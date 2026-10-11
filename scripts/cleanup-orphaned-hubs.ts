import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

import { createClient } from '@supabase/supabase-js';

async function cleanupGhostHubs() {
  console.log('====================================================');
  console.log('🧹 Panchranga Supabase Storage & Retention Cleaner');
  console.log('====================================================');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase credentials missing.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const retentionCutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

  // 1. Prune raw_items older than 72 hours
  console.log(`\n📊 Step 1: Pruning raw_items older than 72h (< ${retentionCutoff})...`);
  let totalOldItemsDeleted = 0;
  while (true) {
    const { data: oldItems, error: selErr } = await supabase
      .from('raw_items')
      .select('id')
      .lt('published_at', retentionCutoff)
      .limit(1000);

    if (selErr) {
      console.error('⚠️ Error selecting old raw_items:', selErr.message);
      break;
    }
    if (!oldItems || oldItems.length === 0) break;

    const ids = oldItems.map((r) => r.id);
    for (let i = 0; i < ids.length; i += 250) {
      const chunk = ids.slice(i, i + 250);
      const { error: delErr } = await supabase.from('raw_items').delete().in('id', chunk);
      if (!delErr) {
        totalOldItemsDeleted += chunk.length;
      }
    }
    console.log(`   Deleted ${totalOldItemsDeleted} stale raw_items so far...`);
    if (oldItems.length < 1000) break;
  }
  console.log(`✅ Step 1 complete: Removed ${totalOldItemsDeleted} stale raw_items (> 72h).`);

  // 2. Nullify unused 384-dim embeddings on active raw_items to save ~65% storage
  console.log('\n📊 Step 2: Clearing unused vector embeddings on active raw_items...');
  const { error: embedClearErr, count: clearedCount } = await supabase
    .from('raw_items')
    .update({ embedding: null }, { count: 'exact' })
    .not('embedding', 'is', null);
  if (embedClearErr) {
    console.warn('⚠️ Notice clearing embeddings:', embedClearErr.message);
  } else {
    console.log(`✅ Step 2 complete: Cleared embeddings on ${clearedCount ?? 0} active rows.`);
  }

  // 3. Time-slice prune topic_hubs older than 72 hours (zero-egress range deletes)
  console.log(`\n📊 Step 3: Pruning topic_hubs older than 72h (< ${retentionCutoff})...`);
  let totalOldHubsDeleted = 0;
  const { data: oldestHubRows } = await supabase
    .from('topic_hubs')
    .select('last_updated_at')
    .order('last_updated_at', { ascending: true })
    .limit(1);

  if (oldestHubRows && oldestHubRows.length > 0) {
    let cursorMs = new Date(oldestHubRows[0].last_updated_at).getTime();
    const targetMs = new Date(retentionCutoff).getTime();
    let stepMs = 3 * 60 * 60 * 1000; // 3-hour window slices

    while (cursorMs < targetMs) {
      const nextMs = Math.min(cursorMs + stepMs, targetMs);
      const nextIso = new Date(nextMs).toISOString();
      const { count, error: sliceErr } = await supabase
        .from('topic_hubs')
        .delete({ count: 'exact' })
        .lt('last_updated_at', nextIso);

      if (sliceErr) {
        // Halve window if statement timeout occurs
        stepMs = Math.max(15 * 60 * 1000, Math.floor(stepMs / 2));
        continue;
      }

      totalOldHubsDeleted += count || 0;
      cursorMs = nextMs;
      if ((count || 0) > 0) {
        console.log(`   Deleted ${totalOldHubsDeleted} stale topic_hubs (up to ${nextIso})...`);
      }
      // Gently expand step if slice was fast and small
      if ((count || 0) < 2000 && stepMs < 6 * 60 * 60 * 1000) {
        stepMs *= 2;
      }
    }
  }
  console.log(`✅ Step 3 complete: Removed ${totalOldHubsDeleted} stale topic_hubs (> 72h).`);

  // 4. Collect all active cluster_ids from remaining raw_items & delete any remaining ghost hubs
  console.log('\n📊 Step 4: Collecting active cluster_ids and removing remaining ghost hubs...');
  const activeClusterIds = new Set<string>();
  let itemPage = 0;
  while (true) {
    const { data, error } = await supabase
      .from('raw_items')
      .select('cluster_id')
      .not('cluster_id', 'is', null)
      .range(itemPage * 1000, (itemPage + 1) * 1000 - 1);

    if (error || !data || data.length === 0) break;
    for (const row of data) {
      if (row.cluster_id) activeClusterIds.add(row.cluster_id);
    }
    if (data.length < 1000) break;
    itemPage++;
  }
  console.log(`   Active cluster_ids in use: ${activeClusterIds.size}`);

  let totalGhostDeleted = 0;
  while (true) {
    const { data: hubBatch, error } = await supabase
      .from('topic_hubs')
      .select('id')
      .limit(1000);

    if (error || !hubBatch || hubBatch.length === 0) break;

    const orphanIds = hubBatch
      .filter((h) => !activeClusterIds.has(h.id))
      .map((h) => h.id);

    if (orphanIds.length === 0) break;

    for (let i = 0; i < orphanIds.length; i += 200) {
      const chunk = orphanIds.slice(i, i + 200);
      const { error: delErr } = await supabase.from('topic_hubs').delete().in('id', chunk);
      if (!delErr) totalGhostDeleted += chunk.length;
    }
    console.log(`   Deleted ${totalGhostDeleted} recent ghost hubs so far...`);
    if (orphanIds.length < hubBatch.length * 0.1) break;
  }

  console.log(`\n🎉 Cleanup complete! Removed ${totalOldItemsDeleted} old raw_items, ${totalOldHubsDeleted} old topic_hubs, and ${totalGhostDeleted} ghost hubs.`);
  console.log('💡 Run "VACUUM FULL public.raw_items; VACUUM FULL public.topic_hubs;" in Supabase SQL Editor to reclaim physical disk space.');
}

cleanupGhostHubs().catch(console.error);
