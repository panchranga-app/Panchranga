import WebSocket from 'ws';
if (typeof (globalThis as any).WebSocket === 'undefined') {
  (globalThis as any).WebSocket = WebSocket;
}

import fs from 'fs';
import path from 'path';
import pLimit from 'p-limit';
import { generateEmbedding } from '../lib/embeddings';
import { clusterRawItems, SIMILARITY_THRESHOLD } from '../lib/clustering';
import { RawItem, TopicHub } from '../lib/types';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function runClustering() {
  console.log('⚡ Starting Panchranga Topic Hub Vector Clustering...');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const isConfigured = Boolean(supabaseUrl && supabaseKey);

  let rawItems: RawItem[] = [];

  const dataDir = path.resolve(process.cwd(), 'data');
  const itemsPath = path.resolve(dataDir, 'ingested-items.json');
  const hubsPath = path.resolve(dataDir, 'topic-hubs.json');

  if (isConfigured) {
    const supabase = createClient(supabaseUrl!, supabaseKey!);
    // Cluster recent items from the last 48 hours to maintain fast, fresh topic hubs
    const cutoffDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: dbItems } = await supabase
      .from('raw_items')
      .select('*, source:sources(*)')
      .gte('published_at', cutoffDate)
      .order('published_at', { ascending: false });
    if (dbItems) rawItems = dbItems as any;
  } else {
    // Local JSON cache fallback
    if (fs.existsSync(itemsPath)) {
      rawItems = JSON.parse(fs.readFileSync(itemsPath, 'utf-8'));
    }
  }

  console.log(`📥 Loaded ${rawItems.length} raw items for event clustering.`);

  if (rawItems.length === 0) {
    console.log('⚠️ No raw items available to cluster. Run `npm run fetch-rss` first.');
    return;
  }

  // Load cached embeddings from local cache if available to avoid recomputing
  const localEmbedMap = new Map<string, number[]>();
  if (fs.existsSync(itemsPath)) {
    try {
      const localItems = JSON.parse(fs.readFileSync(itemsPath, 'utf-8'));
      for (const it of localItems) {
        if (it.embedding && Array.isArray(it.embedding) && it.embedding.length > 0) {
          localEmbedMap.set(it.url, it.embedding);
        }
      }
    } catch {}
  }

  // Generate vector embeddings only for new items
  console.log('🧠 Checking vector embeddings...');
  let newlyEmbedded = 0;
  let cachedEmbedded = 0;

  for (const item of rawItems) {
    const hasBoilerplate = Boolean(
      item.raw_summary &&
      (item.raw_summary.toLowerCase().includes('google news') ||
       item.raw_summary.toLowerCase().includes('comprehensive up-to-date'))
    );

    if (!hasBoilerplate && !item.embedding && localEmbedMap.has(item.url)) {
      item.embedding = localEmbedMap.get(item.url);
    }

    if (!hasBoilerplate && item.embedding && Array.isArray(item.embedding) && item.embedding.length > 0) {
      cachedEmbedded++;
      continue;
    }

    item.embedding = await generateEmbedding(item.title, item.raw_summary);
    newlyEmbedded++;
  }
  console.log(`✅ Embeddings ready: ${newlyEmbedded} newly computed, ${cachedEmbedded} loaded from cache.`);

  // Execute Cosine Similarity Clustering starting from fresh set
  console.log(`🔄 Clustering items into Topic Hubs (Cosine Threshold = ${SIMILARITY_THRESHOLD})...`);
  const { hubs, clusteredItems } = clusterRawItems([], rawItems, SIMILARITY_THRESHOLD);

  console.log(`\n🎉 Clustering complete! Grouped ${rawItems.length} news items into ${hubs.length} Topic Hubs.`);

  // Display top multi-item topic hubs
  const multiItemHubs = hubs.filter((h) => (h.item_count || 0) > 1);
  console.log(`\n🌟 Multi-Item Event Topic Hubs created: ${multiItemHubs.length}`);
  multiItemHubs.forEach((h, idx) => {
    console.log(`  [Hub ${idx + 1}] "${h.title}"`);
    console.log(`        └─ ${h.item_count} items (${h.mainstream_count || 0} mainstream · ${h.grassroots_count || 0} grassroots · ${h.discourse_count || 0} discourse)`);
  });

  // Keep map of existing AI summaries so re-clustering does not wipe them out
  const existingSummaryMap = new Map<string, string>();
  if (isConfigured) {
    const supabase = createClient(supabaseUrl!, supabaseKey!);
    const { data: existingHubs } = await supabase.from('topic_hubs').select('title, ai_summary').not('ai_summary', 'is', null);
    if (existingHubs) {
      for (const h of existingHubs) {
        if (h.ai_summary) existingSummaryMap.set(h.title.toLowerCase().trim(), h.ai_summary);
      }
    }
  }
  if (fs.existsSync(hubsPath)) {
    try {
      const localHubs = JSON.parse(fs.readFileSync(hubsPath, 'utf-8'));
      for (const h of localHubs) {
        if (h.ai_summary && !existingSummaryMap.has(h.title.toLowerCase().trim())) {
          existingSummaryMap.set(h.title.toLowerCase().trim(), h.ai_summary);
        }
      }
    } catch {}
  }

  // Restore existing AI summaries for matching topic hubs
  for (const hub of hubs) {
    const key = hub.title.toLowerCase().trim();
    if (!hub.ai_summary && existingSummaryMap.has(key)) {
      hub.ai_summary = existingSummaryMap.get(key);
    }
  }

  // Save to Database and Local Cache
  if (isConfigured) {
    const supabase = createClient(supabaseUrl!, supabaseKey!);
    console.log('💾 Syncing topic hubs and cluster IDs to Supabase Postgres...');
    
    // Batch upsert hubs in chunks of 50
    const chunkSize = 50;
    for (let i = 0; i < hubs.length; i += chunkSize) {
      const chunk = hubs.slice(i, i + chunkSize).map((hub) => ({
        id: hub.id,
        title: hub.title,
        ai_summary: hub.ai_summary || null,
        first_seen_at: hub.first_seen_at,
        last_updated_at: hub.last_updated_at,
        item_count: hub.item_count,
      }));
      const { error } = await supabase.from('topic_hubs').upsert(chunk);
      if (error) console.error('⚠️ Error upserting topic hubs chunk:', error);
    }

    // Update cluster_ids and embeddings on raw_items with concurrency
    console.log(`💾 Syncing cluster IDs and embeddings for ${clusteredItems.length} items to Supabase...`);
    const updateLimit = pLimit(15);
    const updatePromises = clusteredItems
      .filter((item) => item.cluster_id)
      .map((item) =>
        updateLimit(async () => {
          await supabase
            .from('raw_items')
            .update({ cluster_id: item.cluster_id, embedding: item.embedding || null })
            .eq('url', item.url);
        })
      );
    await Promise.all(updatePromises);

    // Clean up orphaned hubs in topic_hubs that have 0 raw_items
    const { data: allLinkedItems } = await supabase.from('raw_items').select('cluster_id').not('cluster_id', 'is', null).limit(10000);
    if (allLinkedItems) {
      const activeClusterIds = new Set(allLinkedItems.map((i) => i.cluster_id));
      const { data: currentHubs } = await supabase.from('topic_hubs').select('id');
      if (currentHubs) {
        const orphanIds = currentHubs.filter((h) => !activeClusterIds.has(h.id)).map((h) => h.id);
        if (orphanIds.length > 0) {
          await supabase.from('topic_hubs').delete().in('id', orphanIds);
          console.log(`🧹 Cleaned up ${orphanIds.length} orphaned topic hubs from database.`);
        }
      }
    }

    console.log('✅ Supabase database sync complete.');
  }

  // Always write local cache so app has immediate fresh data
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(hubsPath, JSON.stringify(hubs, null, 2));
  fs.writeFileSync(itemsPath, JSON.stringify(clusteredItems, null, 2));
  console.log(`💾 Saved ${hubs.length} topic hubs and ${clusteredItems.length} items to local cache.`);
}

runClustering().catch((err) => {
  console.error('Fatal error during clustering:', err);
  process.exit(1);
});
