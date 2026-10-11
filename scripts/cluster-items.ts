import WebSocket from 'ws';
if (typeof (globalThis as any).WebSocket === 'undefined') {
  (globalThis as any).WebSocket = WebSocket;
}

import fs from 'fs';
import path from 'path';
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

  const cutoffDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const initialClusterMap = new Map<string, string | null>();

  if (isConfigured) {
    const supabase = createClient(supabaseUrl!, supabaseKey!);
    // Cluster recent items from the last 48 hours (omit heavy 384-float embedding column to save Egress)
    const { data: dbItems } = await supabase
      .from('raw_items')
      .select('id, source_id, title, url, published_at, raw_summary, og_image, og_description, category, cluster_id, fetched_at, source:sources(id, name, lane, type, language, region)')
      .gte('published_at', cutoffDate)
      .order('published_at', { ascending: false });
    if (dbItems) {
      rawItems = dbItems as any;
      for (const item of rawItems) {
        initialClusterMap.set(item.url, item.cluster_id || null);
      }
    }
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
  const { isValidAiSummary } = await import('../lib/summarizer');
  const existingSummaryMap = new Map<string, string>();
  if (isConfigured) {
    const supabase = createClient(supabaseUrl!, supabaseKey!);
    const { data: existingHubs } = await supabase
      .from('topic_hubs')
      .select('title, ai_summary')
      .not('ai_summary', 'is', null)
      .gte('last_updated_at', cutoffDate)
      .order('last_updated_at', { ascending: false })
      .limit(500);
    if (existingHubs) {
      for (const h of existingHubs) {
        if (h.ai_summary && isValidAiSummary(h.ai_summary)) {
          existingSummaryMap.set(h.title.toLowerCase().trim(), h.ai_summary);
        }
      }
    }
  }
  if (fs.existsSync(hubsPath)) {
    try {
      const localHubs = JSON.parse(fs.readFileSync(hubsPath, 'utf-8'));
      for (const h of localHubs) {
        if (h.ai_summary && isValidAiSummary(h.ai_summary) && !existingSummaryMap.has(h.title.toLowerCase().trim())) {
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
    
    // Batch upsert hubs in chunks of 150
    const chunkSize = 150;
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

    // Batch update cluster_ids on raw_items (omitting 384-dim embedding from DB to save ~65% storage & egress)
    const itemsToUpdate = clusteredItems.filter((item) => {
      if (!item.cluster_id) return false;
      const prevClusterId = initialClusterMap.get(item.url);
      return prevClusterId !== item.cluster_id;
    });

    console.log(`💾 Syncing cluster IDs for ${itemsToUpdate.length} modified items (${clusteredItems.length - itemsToUpdate.length} unchanged) in batches...`);
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const uniqueUpdates = Array.from(new Map(itemsToUpdate.map((item) => [item.url, item])).values());
    for (let i = 0; i < uniqueUpdates.length; i += chunkSize) {
      const batch = uniqueUpdates.slice(i, i + chunkSize).map((item) => ({
        source_id: (item.source_id && uuidRegex.test(item.source_id)) ? item.source_id : null,
        title: item.title,
        url: item.url,
        published_at: item.published_at,
        raw_summary: item.raw_summary,
        category: item.category,
        og_image: item.og_image,
        og_description: item.og_description,
        cluster_id: item.cluster_id,
        embedding: null,
        fetched_at: item.fetched_at,
      }));
      const { error: batchErr } = await supabase.from('raw_items').upsert(batch, { onConflict: 'url' });
      if (batchErr) {
        console.warn(`⚠️ Batch cluster_id upsert warning [${i}-${i + batch.length}]:`, batchErr.message);
      }
    }

    // Automatic 72-Hour Retention Pruning (prevents raw_items and topic_hubs from growing unbounded)
    const retentionCutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    const [{ error: oldItemsDelErr }, { error: oldHubsDelErr }] = await Promise.all([
      supabase.from('raw_items').delete().lt('published_at', retentionCutoff),
      supabase.from('topic_hubs').delete().lt('last_updated_at', retentionCutoff),
    ]);
    if (oldItemsDelErr) console.warn('⚠️ 72h raw_items retention prune warning:', oldItemsDelErr.message);
    if (oldHubsDelErr) console.warn('⚠️ 72h topic_hubs retention prune warning:', oldHubsDelErr.message);

    // Clean up any superseded topic hubs within the active window
    const currentRunHubIds = new Set(hubs.map((h) => h.id));
    const { data: recentDbHubs } = await supabase
      .from('topic_hubs')
      .select('id')
      .gte('last_updated_at', retentionCutoff)
      .order('last_updated_at', { ascending: false })
      .limit(1500);

    const orphanIds = (recentDbHubs || [])
      .filter((h) => !currentRunHubIds.has(h.id))
      .map((h) => h.id);

    if (orphanIds.length > 0) {
      console.log(`🧹 Found ${orphanIds.length} superseded topic hubs in active window to clean up...`);
      let deletedCount = 0;
      const deleteBatchSize = 200;
      for (let i = 0; i < orphanIds.length; i += deleteBatchSize) {
        const batch = orphanIds.slice(i, i + deleteBatchSize);
        const { error: delErr } = await supabase.from('topic_hubs').delete().in('id', batch);
        if (delErr) {
          console.warn(`⚠️ Error deleting topic hubs batch [${i}-${i + batch.length}]:`, delErr.message);
        } else {
          deletedCount += batch.length;
        }
      }
      console.log(`🧹 Cleaned up ${deletedCount}/${orphanIds.length} superseded topic hubs from database.`);
    }

    console.log('✅ Supabase database sync & 72h retention pruning complete.');
  }

  // Always write local cache (stripping heavy 384-float embeddings from hub items to keep JSON compact)
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const compactHubs = hubs.map((h) => ({
    ...h,
    items: (h.items || []).map(({ embedding, ...rest }: any) => rest),
  }));
  fs.writeFileSync(hubsPath, JSON.stringify(compactHubs, null, 2));
  fs.writeFileSync(itemsPath, JSON.stringify(clusteredItems, null, 2));
  console.log(`💾 Saved ${compactHubs.length} topic hubs and ${clusteredItems.length} items to local cache.`);
}

runClustering().catch((err) => {
  console.error('Fatal error during clustering:', err);
  process.exit(1);
});
