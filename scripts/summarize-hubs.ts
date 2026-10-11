import WebSocket from 'ws';
if (typeof (globalThis as any).WebSocket === 'undefined') {
  (globalThis as any).WebSocket = WebSocket;
}

import fs from 'fs';
import path from 'path';
import { generateNeutralSummary, cleanHeadline, cleanSummary, isValidAiSummary } from '../lib/summarizer';
import { drainDeferredQueue, formatQuotaDashboardLog } from '../lib/llm-router';
import { TopicHub } from '../lib/types';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function runSummarization() {
  console.log('🤖 Starting Panchranga Quota-Aware AI Neutral Summarizer Pipeline...');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const isConfigured = Boolean(supabaseUrl && supabaseKey);

  const dataDir = path.resolve(process.cwd(), 'data');
  const hubsPath = path.resolve(dataDir, 'topic-hubs.json');

  let hubs: TopicHub[] = [];

  if (isConfigured) {
    const supabase = createClient(supabaseUrl!, supabaseKey!);
    const cutoffDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    // Only fetch active hubs from the 48-hour clustering window to avoid burning quota on stale hubs
    const { data: dbHubs } = await supabase
      .from('topic_hubs')
      .select('*')
      .gte('last_updated_at', cutoffDate)
      .order('item_count', { ascending: false });

    const { data: dbItems } = await supabase
      .from('raw_items')
      .select('id, title, url, published_at, raw_summary, og_description, cluster_id, source:sources(id, name, lane, language, region)')
      .gte('published_at', cutoffDate);

    if (dbHubs && dbHubs.length > 0) {
      const itemsList = dbItems || [];
      hubs = dbHubs.map((hub) => ({
        ...hub,
        items: itemsList.filter((i: any) => i.cluster_id === hub.id),
      })) as any;
    }
  } else if (fs.existsSync(hubsPath)) {
    hubs = JSON.parse(fs.readFileSync(hubsPath, 'utf-8'));
  }

  console.log(`📥 Loaded ${hubs.length} active Topic Hubs (48h window) for AI summarization.`);

  if (hubs.length === 0) {
    console.log('⚠️ No Topic Hubs found. Run `npm run cluster` first.');
    return;
  }

  let summarizedCount = 0;
  let deferredCount = 0;
  let singleItemCount = 0;
  let alreadySummarizedCount = 0;

  const multiItemHubs = hubs.filter((h) => (h.items?.length || 0) > 1);
  const singleItemHubs = hubs.filter((h) => (h.items?.length || 0) <= 1);

  console.log(`🎯 Multi-source event hubs to summarize: ${multiItemHubs.length}`);
  console.log(`📌 Single-source hubs (trivial bypass): ${singleItemHubs.length}`);

  // 1. Summarize Multi-Item Event Hubs with background priority & time-slice budget protection
  for (const hub of multiItemHubs) {
    if (hub.ai_summary && isValidAiSummary(hub.ai_summary.trim())) {
      alreadySummarizedCount++;
      continue;
    }

    const { summary, queued, providerUsed } = await generateNeutralSummary(hub, {
      priority: 'background',
    });

    if (queued) {
      deferredCount++;
      console.log(`  ⏳ [Deferred to Queue] "${hub.title.slice(0, 60)}..." (preserving interactive quota buffer)`);
      continue;
    }

    if (summary && isValidAiSummary(summary)) {
      hub.ai_summary = summary;
      summarizedCount++;
      console.log(`  ✨ [${providerUsed || 'AI'}] "${summary.slice(0, 75)}..."`);
    }
  }

  // 2. Process Single-Item Hubs without burning LLM tokens
  for (const hub of singleItemHubs) {
    if (hub.ai_summary && hub.ai_summary.trim().length > 10) {
      alreadySummarizedCount++;
      continue;
    }

    const item = hub.items?.[0];
    const rawSnippet = item?.raw_summary || item?.og_description;
    if (rawSnippet) {
      const cleaned = cleanSummary(rawSnippet);
      const firstSentence = (cleaned.split(/(?<=[.?!])\s+/)[0] || cleaned).trim();
      hub.ai_summary = firstSentence.length > 25 ? firstSentence.slice(0, 160) : cleanHeadline(hub.title);
    } else {
      hub.ai_summary = cleanHeadline(hub.title);
    }
    singleItemCount++;
  }

  // 3. Drain any previously deferred jobs if budget headroom remains
  const drained = await drainDeferredQueue(5);
  if (drained > 0) {
    console.log(`🔄 Drained ${drained} previously deferred summary jobs from queue.`);
  }

  console.log(`\n🎉 AI Summarization complete!`);
  console.log(`   ├─ Newly Summarized Multi-Item Hubs: ${summarizedCount}`);
  console.log(`   ├─ Deferred to Queue (Budget Guard): ${deferredCount}`);
  console.log(`   ├─ Processed Single-Item Hubs (0 LLM tokens): ${singleItemCount}`);
  console.log(`   └─ Already Cached Summaries Kept: ${alreadySummarizedCount}\n`);
  console.log(formatQuotaDashboardLog());

  // Save to Database and Local Cache in Fast Batches
  if (isConfigured) {
    const supabase = createClient(supabaseUrl!, supabaseKey!);
    const hubsWithSummary = hubs.filter((h) => Boolean(h.ai_summary));
    console.log(`\n💾 Upserting ${hubsWithSummary.length} topic hubs with AI summaries to Supabase in batches...`);

    const chunkSize = 150;
    for (let i = 0; i < hubsWithSummary.length; i += chunkSize) {
      const chunk = hubsWithSummary.slice(i, i + chunkSize).map((hub) => ({
        id: hub.id,
        title: hub.title,
        ai_summary: hub.ai_summary,
        first_seen_at: hub.first_seen_at,
        last_updated_at: hub.last_updated_at,
        item_count: hub.item_count,
      }));
      const { error } = await supabase.from('topic_hubs').upsert(chunk, { onConflict: 'id' });
      if (error) {
        console.error(`⚠️ Error updating chunk starting at ${i}:`, error.message);
      }
    }
    console.log('✅ Supabase database updated successfully.');
  }

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const compactHubs = hubs.map((h) => ({
    ...h,
    items: (h.items || []).map(({ embedding, ...rest }: any) => rest),
  }));
  fs.writeFileSync(hubsPath, JSON.stringify(compactHubs, null, 2));
  console.log(`💾 Saved ${compactHubs.length} updated topic hubs to local cache: ${hubsPath}`);
}

runSummarization().catch((err) => {
  console.error('Fatal error during AI summarization:', err);
  process.exit(1);
});
