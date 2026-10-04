import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

import { createClient } from '@supabase/supabase-js';

async function cleanupGhostHubs() {
  console.log('====================================================');
  console.log('🧹 Panchranga Topic Hub Database Ghost Cleaner');
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

  console.log('📊 Step 1: Collecting all active cluster_ids from raw_items...');
  const activeClusterIds = new Set<string>();
  let itemPage = 0;
  while (true) {
    const { data, error } = await supabase
      .from('raw_items')
      .select('cluster_id')
      .not('cluster_id', 'is', null)
      .range(itemPage * 1000, (itemPage + 1) * 1000 - 1);

    if (error) {
      console.error('❌ Error fetching raw_items page:', error.message);
      break;
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (row.cluster_id) activeClusterIds.add(row.cluster_id);
    }

    if (data.length < 1000) break;
    itemPage++;
    if (itemPage % 10 === 0) {
      console.log(`   Fetched ${itemPage * 1000} items so far...`);
    }
  }

  console.log(`✅ Found ${activeClusterIds.size} unique active topic hub IDs currently in use.`);

  console.log('\n📊 Step 2: Scanning and deleting orphaned ghost topic hubs...');
  let totalDeleted = 0;
  const BATCH_SIZE = 50;

  // We scan topic_hubs in batches
  while (true) {
    const { data: hubBatch, error } = await supabase
      .from('topic_hubs')
      .select('id')
      .limit(1000);

    if (error) {
      console.error('❌ Error scanning topic_hubs:', error.message);
      break;
    }
    if (!hubBatch || hubBatch.length === 0) {
      console.log('No more topic hubs to process.');
      break;
    }

    const orphanIds = hubBatch
      .filter((h) => !activeClusterIds.has(h.id))
      .map((h) => h.id);

    if (orphanIds.length === 0) {
      console.log('All remaining hubs in this scan window are active!');
      break;
    }

    for (let i = 0; i < orphanIds.length; i += BATCH_SIZE) {
      const chunk = orphanIds.slice(i, i + BATCH_SIZE);
      const { error: delErr } = await supabase
        .from('topic_hubs')
        .delete()
        .in('id', chunk);

      if (delErr) {
        console.error('⚠️ Delete error:', delErr.message);
      } else {
        totalDeleted += chunk.length;
      }
    }

    console.log(`   Deleted ${totalDeleted} ghost hubs so far...`);

    // If all in this batch were active, we're done
    if (orphanIds.length < hubBatch.length * 0.1) {
      break;
    }
  }

  console.log(`\n🎉 Ghost cleanup complete! Successfully removed ${totalDeleted} dead topic hubs.`);
}

cleanupGhostHubs().catch(console.error);
