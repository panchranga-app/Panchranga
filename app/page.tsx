import fs from 'fs';
import path from 'path';
import { Suspense } from 'react';
import { TopicHub, RawItem } from '@/lib/types';
import HomePageClient, { Hub, FactCheckItem } from '@/components/HomePageClient';
import PanchrangaLoader from '@/components/PanchrangaLoader';
import { getCategoryAndRegion } from '@/lib/topics';

import { supabase } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';

async function getClusteredData(): Promise<{ hubs: TopicHub[]; rawItems: RawItem[] }> {
  // Helper to read local JSON files safely
  const readLocalFallback = (): { hubs: TopicHub[]; rawItems: RawItem[] } => {
    try {
      const hubsPath = path.resolve(process.cwd(), 'data', 'topic-hubs.json');
      const itemsPath = path.resolve(process.cwd(), 'data', 'ingested-items.json');

      let hubs: TopicHub[] = [];
      let rawItems: RawItem[] = [];

      if (fs.existsSync(hubsPath)) {
        hubs = JSON.parse(fs.readFileSync(hubsPath, 'utf-8'));
      }
      if (fs.existsSync(itemsPath)) {
        rawItems = JSON.parse(fs.readFileSync(itemsPath, 'utf-8'));
      }

      const normalizedRawItems: RawItem[] = (rawItems || []).map((item: any) => {
        const src = Array.isArray(item.sources) ? item.sources[0] : (item.sources || item.source);
        return {
          ...item,
          lane: src?.lane || item.lane || 'mainstream',
          source_name: src?.name || item.source_name || 'Unknown',
          language: src?.language || item.language || 'en',
          via_google_news: item.via_google_news || (item.url && item.url.includes('news.google.com')),
          english_gloss: item.english_gloss,
          sources: src,
          source: src,
        };
      });

      let normalizedHubs: TopicHub[] = hubs
        .map((h) => ({
          ...h,
          items: (h.items || []).map((item: any) => {
            const src = Array.isArray(item.sources) ? item.sources[0] : (item.sources || item.source);
            return {
              ...item,
              lane: src?.lane || item.lane || 'mainstream',
              source_name: src?.name || item.source_name || 'Unknown',
              via_google_news: item.via_google_news || (item.url && item.url.includes('news.google.com')),
              english_gloss: item.english_gloss,
              sources: src,
              source: src,
            };
          }),
        }))
        .filter((h) => h.items && h.items.length > 0);

      // If topic-hubs had 0 valid hubs with items, synthesize hubs from rawItems
      if (normalizedHubs.length === 0 && normalizedRawItems.length > 0) {
        normalizedHubs = normalizedRawItems.slice(0, 50).map((item) => ({
          id: item.cluster_id || item.id,
          title: item.title,
          ai_summary: item.raw_summary || item.title,
          first_seen_at: item.published_at || new Date().toISOString(),
          last_updated_at: item.published_at || new Date().toISOString(),
          item_count: 1,
          items: [item],
        }));
      }

      return { hubs: normalizedHubs, rawItems: normalizedRawItems };
    } catch (e) {
      console.error('Error reading local topic hubs data:', e);
      return { hubs: [], rawItems: [] };
    }
  };

  // 1. Try querying Supabase Postgres if configured (with a 6-second timeout)
  if (supabase) {
    try {
      const fetchSupabase = Promise.all([
        supabase
          .from('topic_hubs')
          .select('id, title, ai_summary, first_seen_at, last_updated_at, item_count')
          .order('last_updated_at', { ascending: false })
          .limit(300),
        supabase
          .from('raw_items')
          .select(`
            id,
            title,
            url,
            published_at,
            og_image,
            og_description,
            raw_summary,
            cluster_id,
            fetched_at,
            sources:source_id (
              id,
              name,
              lane,
              type,
              language,
              region
            )
          `)
          .order('published_at', { ascending: false })
          .limit(1000),
      ]);

      const timeoutPromise = new Promise<{ data: null }[]>((_, reject) =>
        setTimeout(() => reject(new Error('Supabase query timed out')), 6000)
      );

      const [hubsRes, itemsRes] = (await Promise.race([fetchSupabase, timeoutPromise])) as any[];

      const dbHubs = hubsRes?.data;
      const dbItems = itemsRes?.data;

      if (dbHubs && dbHubs.length > 0 && dbItems && dbItems.length > 0) {
        const normalizedDbItems: RawItem[] = dbItems.map((item: any) => {
          const src = Array.isArray(item.sources) ? item.sources[0] : (item.sources || item.source);
          return {
            ...item,
            lane: src?.lane || item.lane || 'mainstream',
            source_name: src?.name || item.source_name || 'Unknown',
            language: src?.language || item.language || 'en',
            via_google_news: item.via_google_news || (item.url && item.url.includes('news.google.com')),
            english_gloss: item.english_gloss,
            sources: src,
            source: src,
          };
        });

        // Group items by cluster_id for fast O(1) lookup
        const clusterMap = new Map<string, RawItem[]>();
        for (const item of normalizedDbItems) {
          if (item.cluster_id) {
            const list = clusterMap.get(item.cluster_id) || [];
            list.push(item);
            clusterMap.set(item.cluster_id, list);
          }
        }

        // Match hubs with their linked items
        const hubsWithItems: TopicHub[] = dbHubs
          .map((hub: any) => {
            const items = clusterMap.get(hub.id) || [];
            return {
              ...hub,
              items,
            };
          })
          .filter((hub: TopicHub) => hub.items && hub.items.length > 0);

        if (hubsWithItems.length > 0) {
          return { hubs: hubsWithItems, rawItems: normalizedDbItems };
        }

        // If no hubs matched cluster_ids, synthesize hubs from normalizedDbItems
        if (normalizedDbItems.length > 0) {
          const syntheticHubs: TopicHub[] = normalizedDbItems.slice(0, 60).map((item) => ({
            id: item.cluster_id || item.id,
            title: item.title,
            ai_summary: item.raw_summary || item.title,
            first_seen_at: item.published_at || new Date().toISOString(),
            last_updated_at: item.published_at || new Date().toISOString(),
            item_count: 1,
            items: [item],
          }));
          return { hubs: syntheticHubs, rawItems: normalizedDbItems };
        }
      }
    } catch (err) {
      console.warn('Supabase query failed or timed out, falling back to local files:', err);
    }
  }

  // 2. Fallback to local JSON files
  return readLocalFallback();
}

export default async function HomePage({
  searchParams,
}: {
  searchParams?: { q?: string; topic?: string; lang?: string };
}) {
  const { hubs, rawItems } = await getClusteredData();

  // Map hubs into client format with computed counts and og_image
  const processedHubs: Hub[] = hubs.map((hub) => {
    const rawList = hub.items ?? [];
    const items = rawList.map((i: any) => {
      const src = Array.isArray(i.sources) ? i.sources[0] : (i.sources || i.source);
      return {
        ...i,
        lane: src?.lane || i.lane || 'mainstream',
        source_name: src?.name || i.source_name || 'Unknown',
        language: src?.language || i.language || 'en',
        sources: src,
        source: src,
      };
    });

    const firstOgItem = items.find((i) => i.og_image);
    let mainstreamCount = items.filter((i) => {
      const lane = i.lane || i.sources?.lane || i.source?.lane;
      return lane === 'mainstream' || lane === 'aggregator';
    }).length;
    let grassrootsCount = items.filter((i) => (i.lane || i.sources?.lane || i.source?.lane) === 'grassroots').length;
    let discourseCount = items.filter((i) => (i.lane || i.sources?.lane || i.source?.lane) === 'discourse').length;

    // Safety fallback: if no items matched lane classifications but items exist, assign to mainstream
    if (mainstreamCount === 0 && grassrootsCount === 0 && discourseCount === 0 && items.length > 0) {
      mainstreamCount = items.length;
    }

    const uniqueSourceNames = new Set(
      items.map((i) => i.sources?.name || i.source?.name || i.source_name).filter(Boolean)
    );
    const sourceCount = Math.max(uniqueSourceNames.size, mainstreamCount + grassrootsCount + discourseCount, 1);

    const firstSource =
      firstOgItem?.sources?.name ||
      firstOgItem?.source?.name ||
      firstOgItem?.source_name ||
      items[0]?.sources?.name ||
      items[0]?.source?.name ||
      items[0]?.source_name ||
      'Panchranga';

    const sourceRegion =
      items.find((i) => (i.sources?.region || i.source?.region) && (i.sources?.region || i.source?.region) !== 'national')?.sources?.region ||
      items[0]?.sources?.region ||
      items[0]?.source?.region;

    const sourceLang =
      firstOgItem?.sources?.language ||
      firstOgItem?.source?.language ||
      firstOgItem?.language ||
      items[0]?.sources?.language ||
      items[0]?.source?.language ||
      items[0]?.language ||
      'en';

    const allLangs = Array.from(
      new Set(
        items.map((i) => i.sources?.language || i.source?.language || i.language || 'en').filter(Boolean)
      )
    );

    const { topic, region } = getCategoryAndRegion(hub.title ?? '', sourceRegion);

    const isGoogleNews = Boolean(
      hub.via_google_news ||
      items.some((i) => i.via_google_news || (i.url && i.url.includes('news.google.com')))
    );

    const englishGloss =
      hub.english_gloss ||
      items.find((i) => i.english_gloss)?.english_gloss;

    return {
      id: hub.id,
      title: hub.title ?? 'Untitled Topic Hub',
      english_gloss: englishGloss,
      ai_summary: hub.ai_summary ?? null,
      last_updated_at: hub.last_updated_at ?? hub.first_seen_at ?? new Date().toISOString(),
      og_image: firstOgItem?.og_image ?? null,
      mainstream_count: mainstreamCount,
      grassroots_count: grassrootsCount,
      discourse_count: discourseCount,
      source_count: sourceCount,
      first_source_name: firstSource,
      topic,
      region,
      language: sourceLang,
      languages: allLangs,
      via_google_news: isGoogleNews,
      sources: items[0]?.sources || items[0]?.source || { name: firstSource, region: sourceRegion, language: sourceLang },
    };
  });

  // Sort by last_updated_at descending
  processedHubs.sort(
    (a, b) =>
      new Date(b.last_updated_at).getTime() -
      new Date(a.last_updated_at).getTime()
  );

  const heroHub = processedHubs[0] ?? null;
  const gridHubs = processedHubs.length > 1 ? processedHubs.slice(1) : processedHubs;

  // Extract Fact Check Items
  const factCheckNames = ['alt news', 'boom', 'newschecker', 'factly'];
  let factCheckItems: FactCheckItem[] = rawItems
    .filter((item) => {
      const sName = (item.sources?.name || item.source?.name || item.source_name || '').toLowerCase();
      const isFactCheckSource = factCheckNames.some((fc) => sName.includes(fc));
      return isFactCheckSource;
    })
    .slice(0, 3)
    .map((item) => ({
      id: item.id,
      source_name: item.sources?.name || item.source?.name || item.source_name || 'Fact Check',
      title: item.title,
      url: item.url,
      published_at: item.published_at,
      via_google_news: Boolean(item.via_google_news || (item.url && item.url.includes('news.google.com'))),
    }));

  // Fallback sample fact check items if none in rawItems
  if (factCheckItems.length < 3) {
    const fallbackFC: FactCheckItem[] = [
      {
        id: 'fc-1',
        source_name: 'Alt News',
        title: 'Fact Check: Viral video claiming EVM tampering in recent elections is from 2019',
        url: 'https://www.altnews.in',
        published_at: new Date().toISOString(),
      },
      {
        id: 'fc-2',
        source_name: 'BOOM Live',
        title: 'No, RBI has not issued notice declaring Rs 500 notes invalid',
        url: 'https://www.boomlive.in',
        published_at: new Date().toISOString(),
      },
      {
        id: 'fc-3',
        source_name: 'Newschecker',
        title: 'Altered image of Supreme Court verdict circulated on social media',
        url: 'https://newschecker.in',
        published_at: new Date().toISOString(),
      },
    ];
    factCheckItems = [...factCheckItems, ...fallbackFC].slice(0, 3);
  }

  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] w-full flex flex-col items-center justify-center py-24">
          <PanchrangaLoader loading={true} size="md" />
        </div>
      }
    >
      <HomePageClient
        hubs={gridHubs}
        heroHub={heroHub}
        factCheckItems={factCheckItems}
        initialSearchQuery={searchParams?.q || ''}
        initialTopic={searchParams?.topic || ''}
        initialLanguage={searchParams?.lang || ''}
      />
    </Suspense>
  );
}
