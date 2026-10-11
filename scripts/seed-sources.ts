import WebSocket from 'ws';
if (typeof (globalThis as any).WebSocket === 'undefined') {
  (globalThis as any).WebSocket = WebSocket;
}

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { STARTER_SOURCES } from '../lib/constants';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function seed() {
  console.log('🌱 Synchronizing Panchranga sources registry...');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const sourcesWithIds = STARTER_SOURCES.map((src, idx) => ({
    ...src,
    id: `source-${idx + 1}`,
    is_active: true,
    last_status: 'healthy',
    created_at: new Date().toISOString(),
  }));

  // Always save to local data/sources.json cache
  const dataDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const sourcesPath = path.resolve(dataDir, 'sources.json');
  fs.writeFileSync(sourcesPath, JSON.stringify(sourcesWithIds, null, 2));
  console.log(`💾 Saved ${sourcesWithIds.length} active sources to local cache: ${sourcesPath}`);

  if (supabaseUrl && supabaseKey) {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all existing sources in 1 query instead of 185 individual queries
    const { data: existingSources } = await supabase
      .from('sources')
      .select('id, name, feed_url, is_active');

    const byName = new Map<string, any>();
    const byUrl = new Map<string, any>();
    for (const row of existingSources || []) {
      byName.set(row.name, row);
      byUrl.set(row.feed_url, row);
    }

    // 1. Batch upsert active sources
    const payloads = STARTER_SOURCES.map((src) => {
      const match = byName.get(src.name) || byUrl.get(src.feed_url);
      const item: any = {
        name: src.name,
        lane: src.lane,
        type: src.type,
        feed_url: src.feed_url,
        language: src.language,
        region: src.region,
        is_active: true,
      };
      if (match?.id) {
        item.id = match.id;
      }
      return item;
    });

    const withId = payloads.filter((p) => Boolean(p.id));
    const withoutId = payloads.filter((p) => !p.id);

    if (withId.length > 0) {
      const { error } = await supabase.from('sources').upsert(withId, { onConflict: 'id' });
      if (error) {
        console.warn('⚠️ Batch update existing sources warning:', error.message);
      } else {
        console.log(`✅ Batch updated ${withId.length} existing sources.`);
      }
    }

    if (withoutId.length > 0) {
      const { error } = await supabase.from('sources').upsert(withoutId, { onConflict: 'feed_url' });
      if (error) {
        if (error.message?.includes('sources_type_check')) {
          const compatBatch = withoutId.map((p) => ({
            ...p,
            type: p.lane === 'aggregator' ? p.type : 'rss',
          }));
          const { error: retryErr } = await supabase.from('sources').upsert(compatBatch, { onConflict: 'feed_url' });
          if (!retryErr) {
            console.log(`✅ Batch inserted ${compatBatch.length} new sources (compat mode).`);
          } else {
            console.warn('⚠️ Batch insert compat warning:', retryErr.message);
          }
        } else {
          console.warn('⚠️ Batch insert new sources warning:', error.message);
        }
      } else {
        console.log(`✅ Batch inserted ${withoutId.length} new sources.`);
      }
    }

    // 2. Deactivate any obsolete or discontinued sources in DB in a single batch call
    const activeNames = new Set(STARTER_SOURCES.map((s) => s.name));
    const toDeactivateIds = (existingSources || [])
      .filter((s) => !activeNames.has(s.name) && s.is_active)
      .map((s) => s.id);

    if (toDeactivateIds.length > 0) {
      console.log(`🧹 Deactivating ${toDeactivateIds.length} discontinued/dead sources...`);
      await supabase.from('sources').update({ is_active: false }).in('id', toDeactivateIds);
    }
  }

  console.log('🎉 Seeding and source synchronization completed successfully!');
}

seed().catch((err) => {
  console.error('Fatal error during seeding:', err);
  process.exit(1);
});
