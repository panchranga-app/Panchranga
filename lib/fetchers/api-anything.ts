import { execFile } from 'child_process';
import { promisify } from 'util';
import { getCategoryAndRegion } from '../topics';
import { FEED_FALLBACKS } from '../constants';
import Parser from 'rss-parser';

const execFileAsync = promisify(execFile);

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const rssFallbackParser = new Parser({
  headers: {
    'User-Agent': USER_AGENT,
    'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*;q=0.9',
  },
  timeout: 10000,
});

export interface ApiAnythingIngestedItem {
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

interface YouTubeVideoResult {
  id: string;
  title: string;
  channel?: string;
  views?: string;
  publishedTime?: string;
}

let cliAvailableCache: boolean | null = null;

/**
 * Checks once per process whether the `api-anything` CLI is installed in PATH.
 */
export async function isApiAnythingCliInstalled(): Promise<boolean> {
  if (cliAvailableCache !== null) return cliAvailableCache;
  try {
    const cmd = process.platform === 'win32' ? 'api-anything.cmd' : 'api-anything';
    await execFileAsync(cmd, ['--help'], { timeout: 5000 });
    cliAvailableCache = true;
    return true;
  } catch {
    cliAvailableCache = false;
    return false;
  }
}

/**
 * Calls `api-anything call <site> <op> key=value` via CLI if installed.
 */
async function callApiAnythingCli(site: string, op: string, args: Record<string, string>): Promise<any | null> {
  if (!(await isApiAnythingCliInstalled())) return null;
  try {
    const cmd = process.platform === 'win32' ? 'api-anything.cmd' : 'api-anything';
    const cliArgs = ['call', site, op, ...Object.entries(args).map(([k, v]) => `${k}=${v}`)];
    const { stdout } = await execFileAsync(cmd, cliArgs, { timeout: 12000, maxBuffer: 4 * 1024 * 1024 });
    const parsed = JSON.parse(stdout.trim());
    if (parsed && parsed.ok && Array.isArray(parsed.data)) {
      return parsed.data;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Converts relative YouTube timestamps (e.g. "3 hours ago", "2 days ago") into ISO strings.
 */
function parseRelativeTimeToIso(rel?: string): string {
  const now = Date.now();
  if (!rel) return new Date(now).toISOString();
  const match = rel.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i);
  if (!match) return new Date(now).toISOString();
  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    second: 1000,
    minute: 60 * 1000,
    hour: 3600 * 1000,
    day: 24 * 3600 * 1000,
    week: 7 * 24 * 3600 * 1000,
    month: 30 * 24 * 3600 * 1000,
    year: 365 * 24 * 3600 * 1000,
  };
  return new Date(now - amount * (multipliers[unit] || 0)).toISOString();
}

/**
 * Tier-1 plain-HTTP YouTube search operation matching `sites/youtube.json` in `goodnight000/api-anything`.
 * Uses `GET https://www.youtube.com/results?search_query={q}&sp=EgIQAQ%3D%3D` (Videos filter)
 * and extracts `videoRenderer` records from `ytInitialData` without launching a browser.
 */
async function fetchYouTubeTier1Http(query: string): Promise<YouTubeVideoResult[]> {
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D`;
  const res = await fetch(searchUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(9000),
  });

  if (!res.ok) {
    throw new Error(`YouTube Tier-1 HTTP ${res.status}`);
  }

  const html = await res.text();
  const jsonMatch =
    html.match(/var\s+ytInitialData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/) ||
    html.match(/window\["ytInitialData"\]\s*=\s*(\{[\s\S]*?\});/);

  if (!jsonMatch || !jsonMatch[1]) {
    return [];
  }

  let data: any;
  try {
    data = JSON.parse(jsonMatch[1]);
  } catch {
    return [];
  }

  const results: YouTubeVideoResult[] = [];
  const contents =
    data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];

  for (const section of contents) {
    const items = section?.itemSectionRenderer?.contents || [];
    for (const entry of items) {
      const v = entry?.videoRenderer;
      if (!v || !v.videoId) continue;

      const title =
        v.title?.runs?.map((r: any) => r.text).join('') ||
        v.title?.simpleText ||
        '';
      if (!title) continue;

      const channel =
        v.ownerText?.runs?.[0]?.text ||
        v.longBylineText?.runs?.[0]?.text ||
        undefined;
      const views =
        v.viewCountText?.simpleText ||
        v.shortViewCountText?.simpleText ||
        undefined;
      const publishedTime = v.publishedTimeText?.simpleText || undefined;

      results.push({
        id: v.videoId,
        title: title.trim(),
        channel,
        views,
        publishedTime,
      });
    }
  }

  return results;
}

/**
 * Extracts YouTube search query from a source's feed_url or name.
 */
function extractYouTubeQuery(source: any): string {
  try {
    const parsed = new URL(source.feed_url);
    const q = parsed.searchParams.get('search_query') || parsed.searchParams.get('q');
    if (q) return q;
  } catch {
    // ignore URL parse error
  }
  return `${source.name} India news`;
}

/**
 * Ingests a YouTube journalism / creator source using API Anything (`youtube search` op)
 * with built-in Tier-1 HTTP execution so it works both with the `api-anything` CLI and standalone.
 */
export async function fetchYouTubeViaApiAnything(
  source: any,
  maxItems = 15
): Promise<ApiAnythingIngestedItem[]> {
  const query = extractYouTubeQuery(source);

  // 1. Try `api-anything call youtube search q=...` CLI first if installed
  let videos: YouTubeVideoResult[] | null = await callApiAnythingCli('youtube', 'search', { q: query });

  // 2. Fallback to built-in Tier-1 plain-HTTP operation (identical to sites/youtube.json)
  if (!videos || videos.length === 0) {
    videos = await fetchYouTubeTier1Http(query);
  }

  if (!videos || videos.length === 0) {
    return [];
  }

  const nowIso = new Date().toISOString();
  return videos
    .filter((v) => v && v.id && v.title)
    .slice(0, maxItems)
    .map((v) => {
      const cleanTitle = v.title.trim();
      const { topic } = getCategoryAndRegion(cleanTitle, source.region, source.lane, source.name);
      const pubIso = parseRelativeTimeToIso(v.publishedTime);
      const summaryParts = [
        v.channel || source.name,
        v.views ? v.views : null,
        v.publishedTime ? v.publishedTime : null,
      ].filter(Boolean);

      return {
        source_id: source.id,
        source_name: source.name,
        lane: source.lane,
        title: cleanTitle,
        url: `https://www.youtube.com/watch?v=${v.id}`,
        published_at: pubIso,
        raw_summary: `${summaryParts.join(' · ')} — ${cleanTitle}`.slice(0, 300),
        category: topic,
        og_image: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
        og_description: `YouTube video report · ${source.name}`,
        fetched_at: nowIso,
      };
    });
}

/**
 * Tier-1 plain-HTTP HTML operation for non-RSS civic/policy portals (e.g. PRS Legislative Research,
 * ADR India, The Tatva) modeled on `api-anything add --html` selector extraction, with automatic
 * fallback to `FEED_FALLBACKS` Google News syndication.
 */
export async function fetchCustomSiteViaApiAnything(
  source: any,
  maxItems = 20
): Promise<ApiAnythingIngestedItem[]> {
  const nowIso = new Date().toISOString();

  // 1. Try direct HTML scraping of article/report links on the portal page
  try {
    const res = await fetch(source.feed_url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      const html = await res.text();
      const baseUrl = new URL(source.feed_url).origin;
      const anchorRegex = /<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      const items: ApiAnythingIngestedItem[] = [];
      const seenUrls = new Set<string>();

      let match: RegExpExecArray | null;
      while ((match = anchorRegex.exec(html)) !== null && items.length < maxItems) {
        const rawHref = match[1].trim();
        const rawText = match[2]
          .replace(/<[^>]*>?/gm, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        // Require substantive headline-length anchor text
        if (rawText.length < 28 || rawText.length > 220) continue;
        if (/^(read more|login|sign in|subscribe|privacy|terms|contact|about)/i.test(rawText)) continue;

        let fullUrl = rawHref;
        if (rawHref.startsWith('/')) {
          fullUrl = `${baseUrl}${rawHref}`;
        } else if (!rawHref.startsWith('http')) {
          continue;
        }

        if (seenUrls.has(fullUrl)) continue;
        seenUrls.add(fullUrl);

        const { topic } = getCategoryAndRegion(rawText, source.region, source.lane, source.name);
        items.push({
          source_id: source.id,
          source_name: source.name,
          lane: source.lane,
          title: rawText,
          url: fullUrl,
          published_at: nowIso,
          raw_summary: `${source.name} report — ${rawText}`.slice(0, 300),
          category: topic,
          og_description: `Direct Tier-1 web extraction · ${source.name}`,
          fetched_at: nowIso,
        });
      }

      if (items.length >= 3) {
        return items;
      }
    }
  } catch {
    // Fall through to syndication fallback
  }

  // 2. Fallback to Google News RSS syndication if configured in FEED_FALLBACKS
  const fallbackUrl = FEED_FALLBACKS[source.name];
  if (fallbackUrl) {
    const res = await fetch(fallbackUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const xml = await res.text();
      const feed = await rssFallbackParser.parseString(xml);
      return (feed.items || []).slice(0, maxItems).map((item: any) => {
        const cleanTitle = (item.title || 'Untitled Report').trim();
        const { topic } = getCategoryAndRegion(cleanTitle, source.region, source.lane, source.name);
        return {
          source_id: source.id,
          source_name: source.name,
          lane: source.lane,
          title: cleanTitle,
          url: (item.link || item.guid || '').trim(),
          published_at: item.isoDate || item.pubDate || nowIso,
          raw_summary: (item.contentSnippet || item.content || cleanTitle).replace(/<[^>]*>?/gm, '').trim().slice(0, 300),
          category: topic,
          via_google_news: true,
          fetched_at: nowIso,
        };
      }).filter((i: any) => i.url.startsWith('http'));
    }
  }

  return [];
}
