import Parser from 'rss-parser';
import { getCategoryAndRegion } from '../topics';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const parser = new Parser({
  headers: {
    'User-Agent': USER_AGENT,
    'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*;q=0.9',
  },
  timeout: 10000,
});

function sanitizeXml(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;');
}

export interface GoogleNewsEdition {
  lang: string;
  name: string;
  url: string;
}

export const GOOGLE_NEWS_EDITIONS: GoogleNewsEdition[] = [
  {
    lang: 'en',
    name: 'Google News RSS — India',
    url: 'https://news.google.com/rss/search?q=India&hl=en-IN&gl=IN&ceid=IN:en',
  },
  {
    lang: 'hi',
    name: 'Google News RSS — Hindi',
    url: 'https://news.google.com/rss/search?q=%E0%A4%AD%E0%A4%BE%E0%A4%B0%E0%A4%A4&hl=hi&gl=IN&ceid=IN:hi',
  },
  {
    lang: 'pa',
    name: 'Google News RSS — Punjabi',
    url: 'https://news.google.com/rss/search?q=India&hl=pa&gl=IN&ceid=IN:pa',
  },
  {
    lang: 'ur',
    name: 'Google News RSS — Urdu',
    url: 'https://news.google.com/rss/search?q=India&hl=ur&gl=IN&ceid=IN:ur',
  },
  {
    lang: 'or',
    name: 'Google News RSS — Odia',
    url: 'https://news.google.com/rss/search?q=India&hl=or&gl=IN&ceid=IN:or',
  },
  {
    lang: 'as',
    name: 'Google News RSS — Assamese',
    url: 'https://news.google.com/rss/search?q=India&hl=as&gl=IN&ceid=IN:as',
  },
];

export interface IngestedItem {
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
  fetched_at: string;
}

/**
 * Fetches Google News RSS feeds with defensive parsing and error logging.
 */
export async function fetchGoogleNewsAggregator(
  sourceMap?: Record<string, string>,
  maxPerEdition = 25
): Promise<IngestedItem[]> {
  const allAggregatorItems: IngestedItem[] = [];

  for (const edition of GOOGLE_NEWS_EDITIONS) {
    try {
      console.log(`📡 [Google News RSS] Fetching ${edition.name} (${edition.lang})...`);
      const response = await fetch(edition.url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*;q=0.9',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        console.warn(
          `⚠️ [Google News RSS] HTTP error fetching ${edition.name}: ${response.status} ${response.statusText}`
        );
        continue;
      }

      const xmlText = await response.text();
      let feed: any;
      try {
        feed = await parser.parseString(sanitizeXml(xmlText));
      } catch (parseErr: any) {
        console.error(
          `❌ [Google News RSS] XML Parse failure for ${edition.name}: ${parseErr.message}. Google News structure may have changed!`
        );
        continue;
      }

      if (!feed || !Array.isArray(feed.items) || feed.items.length === 0) {
        console.warn(`⚠️ [Google News RSS] No items returned in feed for ${edition.name}`);
        continue;
      }

      const sourceId = sourceMap?.[edition.name] || sourceMap?.['Google News RSS — India'];

      const items: IngestedItem[] = feed.items.slice(0, maxPerEdition).map((item: any) => {
        const cleanTitle = (item.title || 'Untitled Story').trim();
        const rawSummary = (item.contentSnippet || item.content || item.summary || cleanTitle)
          .replace(/<[^>]*>?/gm, '')
          .trim()
          .slice(0, 300);

        const { topic } = getCategoryAndRegion(cleanTitle, 'national', 'aggregator', edition.name);

        return {
          source_id: sourceId,
          source_name: edition.name,
          lane: 'aggregator' as const,
          title: cleanTitle,
          url: (item.link || item.guid || '').trim(),
          published_at: item.isoDate || item.pubDate || new Date().toISOString(),
          raw_summary: rawSummary,
          category: topic,
          via_google_news: true,
          fetched_at: new Date().toISOString(),
        };
      }).filter((it: IngestedItem) => it.url.startsWith('http') && it.title.length > 5);

      console.log(`✓ [Google News RSS] ${edition.name}: +${items.length} stories`);
      allAggregatorItems.push(...items);
    } catch (err: any) {
      console.error(`❌ [Google News RSS] Error fetching ${edition.name}: ${err.message}`);
    }
  }

  return allAggregatorItems;
}
