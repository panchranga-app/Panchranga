import WebSocket from 'ws';
if (typeof (globalThis as any).WebSocket === 'undefined') {
  (globalThis as any).WebSocket = WebSocket;
}

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function clearAll() {
  console.log('🧹 Clearing all existing articles, topic hubs, and caches...');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey) {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Delete all raw_items first (references topic_hubs and sources)
    console.log('🗑️  Deleting all rows from "raw_items" table in Supabase...');
    const { error: itemsErr, count: itemsCount } = await supabase
      .from('raw_items')
      .delete({ count: 'exact' })
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (itemsErr) {
      console.error('⚠️ Error deleting raw_items:', itemsErr.message);
    } else {
      console.log(`✅ Deleted ${itemsCount ?? 'all'} rows from raw_items.`);
    }

    // 2. Delete all topic_hubs
    console.log('🗑️  Deleting all rows from "topic_hubs" table in Supabase...');
    const { error: hubsErr, count: hubsCount } = await supabase
      .from('topic_hubs')
      .delete({ count: 'exact' })
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (hubsErr) {
      console.error('⚠️ Error deleting topic_hubs:', hubsErr.message);
    } else {
      console.log(`✅ Deleted ${hubsCount ?? 'all'} rows from topic_hubs.`);
    }
  }

  // 3. Clear local JSON cache files
  const dataDir = path.resolve(process.cwd(), 'data');
  const itemsPath = path.resolve(dataDir, 'ingested-items.json');
  const hubsPath = path.resolve(dataDir, 'topic-hubs.json');

  if (fs.existsSync(itemsPath)) {
    fs.writeFileSync(itemsPath, '[]', 'utf-8');
    console.log('✅ Cleared data/ingested-items.json.');
  }

  if (fs.existsSync(hubsPath)) {
    fs.writeFileSync(hubsPath, '[]', 'utf-8');
    console.log('✅ Cleared data/topic-hubs.json.');
  }

  console.log('✨ All old articles and hubs have been successfully cleared.');
}

clearAll().catch((err) => {
  console.error('Fatal error during clear:', err);
  process.exit(1);
});
