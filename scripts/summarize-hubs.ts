import WebSocket from 'ws';
if (typeof (globalThis as any).WebSocket === 'undefined') {
  (globalThis as any).WebSocket = WebSocket;
}

import fs from 'fs';
import path from 'path';
import { generateNeutralSummary, cleanHeadline, cleanSummary } from '../lib/summarizer';
import { TopicHub } from '../lib/types';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function runSummarization() {
  console.log('🤖 Starting Panchranga Guardrailed AI Neutral Summarizer Pipeline...');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const isConfigured = Boolean(supabaseUrl && supabaseKey);

  const dataDir = path.resolve(process.cwd(), 'data');
  const hubsPath = path.resolve(dataDir, 'topic-hubs.json');

  let hubs: TopicHub[] = [];

  if (isConfigured) {
    const supabase = createClient(supabaseUrl!, supabaseKey!);
    
    // Fetch all hubs with pagination (bypassing Supabase 1000-row default limit)
    let dbHubs: any[] = [];
    let hubPage = 0;
    while (true) {
      const { data, error } = await supabase
        .from('topic_hubs')
        .select('*')
        .range(hubPage * 1000, (hubPage + 1) * 1000 - 1);
      if (error || !data || data.length === 0) break;
      dbHubs.push(...data);
      if (data.length < 1000) break;
      hubPage++;
    }

    // Fetch all items from recent days
    let dbItems: any[] = [];
    let itemPage = 0;
    while (true) {
      const { data, error } = await supabase
        .from('raw_items')
        .select('*, source:sources(*)')
        .range(itemPage * 1000, (itemPage + 1) * 1000 - 1);
      if (error || !data || data.length === 0) break;
      dbItems.push(...data);
      if (data.length < 1000) break;
      itemPage++;
    }

    if (dbHubs.length > 0) {
      hubs = dbHubs.map((hub) => ({
        ...hub,
        items: dbItems.filter((i) => i.cluster_id === hub.id),
      })) as any;
    }
  } else if (fs.existsSync(hubsPath)) {
    hubs = JSON.parse(fs.readFileSync(hubsPath, 'utf-8'));
  }

  console.log(`📥 Loaded ${hubs.length} Topic Hubs for AI summarization.`);

  if (hubs.length === 0) {
    console.log('⚠️ No Topic Hubs found. Run `npm run cluster` first.');
    return;
  }

  let summarizedCount = 0;
  let singleItemCount = 0;
  let alreadySummarizedCount = 0;

  // Filter hubs into multi-item and single-item
  const multiItemHubs = hubs.filter((h) => (h.items?.length || 0) > 1);
  const singleItemHubs = hubs.filter((h) => (h.items?.length || 0) <= 1);

  console.log(`🎯 Multi-source event hubs to summarize: ${multiItemHubs.length}`);
  console.log(`📌 Single-source hubs to process: ${singleItemHubs.length}`);

  // 1. Summarize Multi-Item Event Hubs with AI
  for (const hub of multiItemHubs) {
    // If hub already has a solid summary, keep it and skip redundant API call
    if (hub.ai_summary && hub.ai_summary.trim().length > 10) {
      alreadySummarizedCount++;
      continue;
    }

    const { summary, isFlagged } = await generateNeutralSummary(hub);

    if (summary) {
      hub.ai_summary = summary;
      summarizedCount++;
      console.log(`  ✨ [AI Summary] "${summary.slice(0, 70)}..."`);
    }

    // Delay between calls to respect provider free tier RPM limits (15 RPM / 30 RPM)
    await new Promise((r) => setTimeout(r, 4100));
  }

  // 2. Process Single-Item Hubs (extract clean descriptive summary or headline)
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

  console.log(`\n🎉 AI Summarization complete!`);
  console.log(`   ├─ Newly Summarized Multi-Item Hubs: ${summarizedCount}`);
  console.log(`   ├─ Processed Single-Item Hubs: ${singleItemCount}`);
  console.log(`   └─ Already Cached Summaries Kept: ${alreadySummarizedCount}`);

  // Save to Database and Local Cache in Fast Batches
  if (isConfigured) {
    const supabase = createClient(supabaseUrl!, supabaseKey!);
    const hubsWithSummary = hubs.filter((h) => Boolean(h.ai_summary));
    console.log(`💾 Upserting ${hubsWithSummary.length} topic hubs with AI summaries to Supabase in batches...`);

    const chunkSize = 50;
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

  // Always update local cache for offline/instant page rendering
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(hubsPath, JSON.stringify(hubs, null, 2));
  console.log(`💾 Saved ${hubs.length} updated topic hubs to local cache: ${hubsPath}`);
}

runSummarization().catch((err) => {
  console.error('Fatal error during AI summarization:', err);
  process.exit(1);
});
