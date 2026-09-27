import WebSocket from 'ws';
if (typeof (globalThis as any).WebSocket === 'undefined') {
  (globalThis as any).WebSocket = WebSocket;
}

import Parser from 'rss-parser';
import pLimit from 'p-limit';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { STARTER_SOURCES, FEED_FALLBACKS } from '../lib/constants';
import { getCategoryAndRegion } from '../lib/topics';
import { fetchCurrentsApi } from '../lib/fetchers/currents';
import { fetchGoogleNewsAggregator } from '../lib/fetchers/google-news';
import { deduplicateAggregatorItems } from '../lib/dedup';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const REDDIT_USER_AGENT = 'web:panchranga-news-aggregator:v1.0 (by /u/panchranga)';

const parser = new Parser({
  headers: {
    'User-Agent': USER_AGENT,
    'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*;q=0.9',
  },
  timeout: 10000,
});

const redditParser = new Parser({
  headers: {
    'User-Agent': REDDIT_USER_AGENT,
    'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*;q=0.9',
  },
  timeout: 10000,
});

const MAX_ITEMS_PER_SOURCE = 30;
const CONCURRENCY_LIMIT = 7;

interface IngestedItem {
  id?: string;
  source_id?: string;
  source_name: string;
  lane: 'mainstream' | 'grassroots' | 'discourse' | 'aggregator';
  title: string;
  url: string;
  published_at: string;
  raw_summary: string;
  category: string;
  og_image?: string;
  og_description?: string;
  via_google_news?: boolean;
  english_gloss?: string;
  fetched_at: string;
}

/**
 * Extract og:image and og:description meta tags with 2.5s strict timeout.
 */
async function fetchOgData(url: string): Promise<{ ogImage: string | null; ogDesc: string | null }> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return { ogImage: null, ogDesc: null };

    const html = await res.text();
    const ogImage =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1];

    const ogDesc =
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i)?.[1] ||
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1];

    return {
      ogImage: ogImage?.trim() || null,
      ogDesc: ogDesc?.replace(/<[^>]*>?/gm, '')?.trim() || null,
    };
  } catch {
    return { ogImage: null, ogDesc: null };
  }
}

/**
 * Clean & sanitize XML strings before parsing
 */
function sanitizeXml(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;');
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchSingleSource(source: any): Promise<IngestedItem[]> {
  const isReddit = source.type === 'reddit' || source.feed_url.includes('reddit.com');

  // 1. Reddit feeds (using .rss with pacing)
  if (isReddit) {
    const rssUrl = source.feed_url.replace(/\/hot\.json.*$/, '/.rss').replace(/\/+$/, '') + (source.feed_url.endsWith('.rss') ? '' : '/.rss');
    // Polite pause for Reddit anti-spam
    await sleep(2000);

    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': REDDIT_USER_AGENT,
        'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      const xmlText = await response.text();
      const feed = await redditParser.parseString(sanitizeXml(xmlText));
      if (!feed || !feed.items || feed.items.length === 0) {
        return [];
      }

      return feed.items.slice(0, MAX_ITEMS_PER_SOURCE).map((p: any) => {
        const cleanTitle = (p.title || 'Civic Post').trim();
        const rawSummary = (p.contentSnippet || p.content || cleanTitle).replace(/<[^>]*>?/gm, '').trim().slice(0, 300);
        const { topic } = getCategoryAndRegion(cleanTitle, source.region, source.lane, source.name);

        return {
          source_id: source.id,
          source_name: source.name,
          lane: source.lane as any,
          title: cleanTitle,
          url: (p.link || p.guid || '').trim(),
          published_at: p.isoDate || p.pubDate || new Date().toISOString(),
          raw_summary: rawSummary,
          category: topic,
          og_description: `Reddit community discussion · ${source.name}`,
          fetched_at: new Date().toISOString(),
        };
      }).filter((i: any) => i.url.startsWith('http'));
    } else {
      console.error(`⚠️ Reddit fetch failed for ${source.name}: ${response.status} ${response.statusText}`);
      throw new Error(`Reddit HTTP ${response.status}: ${response.statusText}`);
    }
  }

  // 2. RSS / Atom / Google News syndication feed
  let targetUrl = source.feed_url;
  const fallbackUrl = FEED_FALLBACKS[source.name];
  let isFallbackUsed = false;
  let feed: any = null;

  try {
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const xmlText = await res.text();
    feed = await parser.parseString(sanitizeXml(xmlText));
  } catch (err: any) {
    // Audit observation: Outlets like Livemint or HT may block direct crawlers.
    // Try primary feed first, and only fall back to Google News syndication proxy if direct fails.
    if (fallbackUrl) {
      try {
        console.log(`ℹ️ [Anti-WAF] Primary feed failed for ${source.name} (${err.message}). Using syndication fallback.`);
        isFallbackUsed = true;
        targetUrl = fallbackUrl;

        const res = await fetch(fallbackUrl, {
          headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*;q=0.9',
          },
          signal: AbortSignal.timeout(10000),
        });

        if (res.ok) {
          const xmlText = await res.text();
          feed = await parser.parseString(sanitizeXml(xmlText));
        } else {
          feed = await parser.parseURL(fallbackUrl);
        }
      } catch (fbErr: any) {
        throw new Error(`Primary (${err.message}) and Fallback (${fbErr.message}) both failed`);
      }
    } else {
      throw err;
    }
  }

  if (!feed || !feed.items || feed.items.length === 0) {
    return [];
  }

  const itemsRaw = feed.items.slice(0, MAX_ITEMS_PER_SOURCE).map((item: any) => {
    const rawContent = item.contentSnippet || item.content || item.summary || '';
    const cleanSummary = rawContent
      .replace(/<[^>]*>?/gm, '')
      .trim()
      .slice(0, 300);

    let enclosureImage: string | undefined = undefined;
    if (item.enclosure?.url && (item.enclosure.type?.startsWith('image') || item.enclosure.url.match(/\.(jpeg|jpg|png|webp)/i))) {
      enclosureImage = item.enclosure.url;
    } else if (item['media:content']?.$.url) {
      enclosureImage = item['media:content'].$.url;
    } else if (item['media:thumbnail']?.$.url) {
      enclosureImage = item['media:thumbnail'].$.url;
    }

    const cleanTitle = (item.title || 'Untitled Article').trim();
    const { topic } = getCategoryAndRegion(cleanTitle, source.region, source.lane, source.name);
    const itemUrl = (item.link || item.guid || '').trim();
    const isGoogleNews = isFallbackUsed || itemUrl.includes('news.google.com') || targetUrl.includes('news.google.com');

    return {
      source_id: source.id,
      source_name: source.name,
      lane: source.lane as any,
      title: cleanTitle,
      url: itemUrl,
      published_at: item.isoDate || item.pubDate || new Date().toISOString(),
      raw_summary: cleanSummary,
      category: topic,
      og_image: enclosureImage,
      via_google_news: isGoogleNews,
      fetched_at: new Date().toISOString(),
    };
  }).filter((item: any) => item.url.startsWith('http'));

  // Enhance only the top 2 items missing thumbnails to optimize speed
  const itemsWithOg: IngestedItem[] = await Promise.all(
    itemsRaw.map(async (item: any, idx: number) => {
      if (!item.og_image && idx < 2) {
        const { ogImage, ogDesc } = await fetchOgData(item.url);
        return {
          ...item,
          og_image: ogImage || undefined,
          og_description: ogDesc || undefined,
        };
      }
      return item;
    })
  );

  return itemsWithOg;
}

async function fetchRss() {
  console.log('🚀 Starting High-Capacity Panchranga News Ingestion Pipeline...');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let activeSources = STARTER_SOURCES.map((s, idx) => ({ ...s, id: `source-${idx + 1}` }));
  const isConfigured = Boolean(supabaseUrl && supabaseKey);
  let supabase: any = null;

  // Read local sources cache first if present to preserve newly added sources and IDs
  const dataDir = path.resolve(process.cwd(), 'data');
  const sourcesPath = path.resolve(dataDir, 'sources.json');
  if (fs.existsSync(sourcesPath)) {
    try {
      const localSources = JSON.parse(fs.readFileSync(sourcesPath, 'utf-8'));
      if (Array.isArray(localSources) && localSources.length > 0) {
        activeSources = localSources.filter((s: any) => s.is_active !== false);
      }
    } catch (err: any) {
      console.warn('Could not read data/sources.json:', err.message);
    }
  }

  if (isConfigured) {
    supabase = createClient(supabaseUrl!, supabaseKey!);
    const { data: dbSources, error } = await supabase
      .from('sources')
      .select('*')
      .eq('is_active', true);

    if (!error && dbSources && dbSources.length > 0) {
      const dbMap = new Map(dbSources.map((s: any) => [s.name, s]));
      activeSources = activeSources.map((localSrc: any) => {
        const fromDb = dbMap.get(localSrc.name);
        return fromDb ? { ...localSrc, ...fromDb } : localSrc;
      });
    }
  }

  console.log(`📡 Ingesting up to ${MAX_ITEMS_PER_SOURCE} items from ${activeSources.length} active sources...`);
  const allItems: IngestedItem[] = [];

  const standardSources = activeSources.filter((s) => s.type !== 'reddit' && s.lane !== 'aggregator' && !s.feed_url.includes('reddit.com'));
  const redditSources = activeSources.filter((s) => s.type === 'reddit' || s.feed_url.includes('reddit.com'));
  const aggregatorSources = activeSources.filter((s) => s.lane === 'aggregator');

  // 1. Process Standard RSS Feeds with Bounded Concurrency (p-limit)
  const limit = pLimit(CONCURRENCY_LIMIT);
  console.log(`📡 Ingesting from ${standardSources.length} standard sources with bounded concurrency (${CONCURRENCY_LIMIT} workers)...`);

  const standardPromises = standardSources.map((source) =>
    limit(async () => {
      try {
        const items = await fetchSingleSource(source);
        if (supabase && source.id && source.id.length > 10) {
          await supabase
            .from('sources')
            .update({
              last_status: 'healthy',
              last_error: null,
              last_attempted_at: new Date().toISOString(),
            })
            .eq('id', source.id);
        }
        console.log(`✓ [${source.lane.toUpperCase()}] ${source.name} (${source.language}): +${items.length} items`);
        return items;
      } catch (err: any) {
        const errMsg = err?.message || 'Unknown fetch error';
        console.log(`✗ [${source?.lane?.toUpperCase() || 'SRC'}] ${source?.name}: ${errMsg}`);
        if (supabase && source.id && source.id.length > 10) {
          await supabase
            .from('sources')
            .update({
              last_status: 'error',
              last_error: errMsg.slice(0, 500),
              last_attempted_at: new Date().toISOString(),
            })
            .eq('id', source.id);
        }
        return [];
      }
    })
  );

  const standardResults = await Promise.all(standardPromises);
  for (const items of standardResults) {
    allItems.push(...items);
  }

  // 2. Process Reddit Civic Feeds with Multi-Subreddit Ingestion
  if (redditSources.length > 0) {
    console.log(`\n💬 Ingesting ${redditSources.length} civic discourse subreddits...`);
    const subNames = redditSources
      .map((s) => s.feed_url.match(/r\/([^/]+)/i)?.[1])
      .filter(Boolean) as string[];

    let multiFeedSuccess = false;
    if (subNames.length > 0) {
      try {
        const multiRssUrl = `https://www.reddit.com/r/${subNames.join('+')}/.rss`;
        console.log(`📡 Fetching unified multi-subreddit feed: ${multiRssUrl}`);
        const res = await fetch(multiRssUrl, {
          headers: {
            'User-Agent': REDDIT_USER_AGENT,
            'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*;q=0.9',
          },
          signal: AbortSignal.timeout(15000),
        });

        if (res.ok) {
          const xmlText = await res.text();
          const feed = await redditParser.parseString(sanitizeXml(xmlText));
          if (feed && feed.items && feed.items.length > 0) {
            multiFeedSuccess = true;
            const itemsBySub: Record<string, any[]> = {};
            for (const item of feed.items) {
              const subMatch = item.link?.match(/reddit\.com\/r\/([^/]+)/i);
              if (subMatch && subMatch[1]) {
                const sub = subMatch[1].toLowerCase();
                itemsBySub[sub] = itemsBySub[sub] || [];
                itemsBySub[sub].push(item);
              }
            }

            for (const source of redditSources) {
              const subName = (source.feed_url.match(/r\/([^/]+)/i)?.[1] || '').toLowerCase();
              const subRawItems = itemsBySub[subName] || [];
              const mappedItems: IngestedItem[] = subRawItems.slice(0, MAX_ITEMS_PER_SOURCE).map((p: any) => {
                const cleanTitle = (p.title || 'Civic Post').trim();
                const rawSummary = (p.contentSnippet || p.content || cleanTitle).replace(/<[^>]*>?/gm, '').trim().slice(0, 300);
                const { topic } = getCategoryAndRegion(cleanTitle, source.region, source.lane, source.name);
                return {
                  source_id: source.id,
                  source_name: source.name,
                  lane: 'discourse' as const,
                  title: cleanTitle,
                  url: (p.link || p.guid || '').trim(),
                  published_at: p.isoDate || p.pubDate || new Date().toISOString(),
                  raw_summary: rawSummary,
                  category: topic,
                  og_description: `Reddit community discussion · ${source.name}`,
                  fetched_at: new Date().toISOString(),
                };
              }).filter((i: any) => i.url.startsWith('http'));

              allItems.push(...mappedItems);
              console.log(`✓ [DISCOURSE] ${source.name}: +${mappedItems.length} community posts`);

              if (supabase && source.id && source.id.length > 10) {
                await supabase
                  .from('sources')
                  .update({
                    last_status: 'healthy',
                    last_error: null,
                    last_attempted_at: new Date().toISOString(),
                  })
                  .eq('id', source.id);
              }
            }
          }
        }
      } catch (err: any) {
        console.warn(`⚠️ Multi-subreddit feed fetch failed: ${err.message}. Falling back to sequential pacing.`);
      }
    }

    if (!multiFeedSuccess) {
      for (const source of redditSources) {
        try {
          const items = await fetchSingleSource(source);
          allItems.push(...items);
          console.log(`✓ [DISCOURSE] ${source.name}: +${items.length} community posts`);
          if (supabase && source.id && source.id.length > 10) {
            await supabase
              .from('sources')
              .update({
                last_status: 'healthy',
                last_error: null,
                last_attempted_at: new Date().toISOString(),
              })
              .eq('id', source.id);
          }
        } catch (err: any) {
          console.log(`✗ [DISCOURSE] ${source.name}: ${err.message || err}`);
          if (supabase && source.id && source.id.length > 10) {
            await supabase
              .from('sources')
              .update({
                last_status: 'error',
                last_error: (err.message || 'Unknown Reddit fetch error').slice(0, 500),
                last_attempted_at: new Date().toISOString(),
              })
              .eq('id', source.id);
          }
        }
        await sleep(5000);
      }
    }
  }

  // 3. Process Aggregator Lane (Currents API + Google News RSS)
  console.log('\n🌐 Ingesting Aggregator Lane (Pooled Multi-Publisher Feeds)...');
  const sourceMap: Record<string, string> = {};
  for (const s of activeSources) {
    sourceMap[s.name] = s.id;
  }

  const currentsSource = activeSources.find((s) => s.name === 'Currents API');
  const [currentsItems, googleNewsItems] = await Promise.all([
    fetchCurrentsApi(currentsSource?.id),
    fetchGoogleNewsAggregator(sourceMap, 20),
  ]);

  const rawAggregatorItems = [...currentsItems, ...googleNewsItems];
  console.log(`📡 Ingested ${rawAggregatorItems.length} raw articles from aggregator lane.`);

  // 4. Run Phase 4 Deduplication (±2 hour publication window with normalized-title match)
  console.log('🔄 Deduplicating aggregator lane articles against direct feeds...');
  const dedupResult = deduplicateAggregatorItems(rawAggregatorItems, allItems, 2);
  console.log(
    `📊 Deduplication complete: ${dedupResult.dedupHits} duplicates filtered (${dedupResult.hitRate} overlap rate). ${dedupResult.uniqueAggregatorItems.length} unique aggregator items retained.`
  );

  allItems.push(...dedupResult.uniqueAggregatorItems);

  // Update aggregator sources status
  for (const aggSource of aggregatorSources) {
    const count = allItems.filter((i) => i.source_name === aggSource.name).length;
    console.log(`✓ [AGGREGATOR] ${aggSource.name}: +${count} deduplicated stories`);
    if (supabase && aggSource.id && aggSource.id.length > 10) {
      await supabase
        .from('sources')
        .update({
          last_status: 'healthy',
          last_error: null,
          last_attempted_at: new Date().toISOString(),
        })
        .eq('id', aggSource.id);
    }
  }

  console.log(`\n📊 Total raw items successfully fetched: ${allItems.length}`);

  // Category breakdown report
  const categoryCounts: Record<string, number> = {};
  for (const item of allItems) {
    categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
  }
  console.log('🏷️  Category breakdown:', categoryCounts);

  if (isConfigured && supabase && allItems.length > 0) {
    // Deduplicate items by URL to prevent Postgres intra-batch ON CONFLICT errors
    const uniqueItems = Array.from(new Map(allItems.map((item) => [item.url, item])).values());
    console.log(`💾 Upserting ${uniqueItems.length} unique raw items with categories into Supabase...`);
    const chunkSize = 50;
    for (let i = 0; i < uniqueItems.length; i += chunkSize) {
      const chunk = uniqueItems.slice(i, i + chunkSize).map((item) => ({
        source_id: (item.source_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.source_id)) ? item.source_id : null,
        title: item.title,
        url: item.url,
        published_at: item.published_at,
        raw_summary: item.raw_summary,
        category: item.category,
        og_image: item.og_image,
        og_description: item.og_description,
        fetched_at: item.fetched_at,
      }));
      const { error: upsertErr } = await supabase.from('raw_items').upsert(chunk, { onConflict: 'url' });
      if (upsertErr) {
        // If Supabase complains that category column does not exist yet, fallback gracefully without category
        if (upsertErr.message?.includes('category')) {
          console.warn('⚠️ Category column not yet in Supabase schema. Retrying without category...');
          const legacyChunk = chunk.map(({ category, ...rest }) => rest);
          await supabase.from('raw_items').upsert(legacyChunk, { onConflict: 'url' });
        } else {
          console.error('Supabase upsert error:', upsertErr.message);
        }
      }
    }
    console.log('✅ Successfully stored items in Supabase.');
  }

  // Always write local cache fallback
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const outputPath = path.resolve(dataDir, 'ingested-items.json');
  fs.writeFileSync(outputPath, JSON.stringify(allItems, null, 2));
  console.log(`💾 Saved ${allItems.length} raw items to local cache: ${outputPath}`);

  // Update local data/sources.json with live article counts and timestamps
  const countBySourceName: Record<string, number> = {};
  for (const item of allItems) {
    countBySourceName[item.source_name] = (countBySourceName[item.source_name] || 0) + 1;
  }
  let cachedSources: any[] = activeSources;
  if (fs.existsSync(sourcesPath)) {
    try {
      cachedSources = JSON.parse(fs.readFileSync(sourcesPath, 'utf-8'));
    } catch {}
  }
  const nowIso = new Date().toISOString();
  const updatedCachedSources = cachedSources.map((s: any) => {
    const count = countBySourceName[s.name] || 0;
    return {
      ...s,
      article_count: count,
      last_fetched: count > 0 ? nowIso : s.last_fetched || null,
      last_attempted_at: nowIso,
      last_status: count > 0 ? 'healthy' : (s.last_status || 'healthy'),
    };
  });
  fs.writeFileSync(sourcesPath, JSON.stringify(updatedCachedSources, null, 2));
  console.log(`💾 Updated ${updatedCachedSources.length} sources with latest article counts in ${sourcesPath}`);

  console.log('✨ Ingestion cycle completed successfully.');
}

fetchRss().catch((err) => {
  console.error('Fatal error during RSS ingestion:', err);
  process.exit(1);
});
