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

export const MAX_YOUTUBE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 1 week (7 days)

/**
 * Converts relative YouTube timestamps (e.g. "3 hours ago", "2d ago", "42 min ago", "Streamed 5h ago", "1w ago")
 * into ISO strings. Returns null if missing or unparseable so old/unknown videos never default to Date.now().
 */
export function parseRelativeTimeToIso(rel?: string, nowMs: number = Date.now()): string | null {
  if (!rel) return null;
  const normalized = rel.replace(/\u00a0/g, ' ').trim();
  const match = normalized.match(
    /(\d+)\s*(mo|months?|mins?|minutes?|secs?|seconds?|hrs?|hours?|days?|wks?|weeks?|yrs?|years?|s|m|h|d|w|y)\s+ago/i
  );
  if (!match) return null;

  const amount = parseInt(match[1], 10);
  if (isNaN(amount) || amount < 0) return null;

  const rawUnit = match[2].toLowerCase();
  let unitMs = 0;
  if (rawUnit === 's' || rawUnit.startsWith('sec')) {
    unitMs = 1000;
  } else if (rawUnit === 'm' || rawUnit.startsWith('min')) {
    unitMs = 60 * 1000;
  } else if (rawUnit === 'h' || rawUnit.startsWith('hr') || rawUnit.startsWith('hour')) {
    unitMs = 3600 * 1000;
  } else if (rawUnit === 'd' || rawUnit.startsWith('day')) {
    unitMs = 24 * 3600 * 1000;
  } else if (rawUnit === 'w' || rawUnit.startsWith('wk') || rawUnit.startsWith('week')) {
    unitMs = 7 * 24 * 3600 * 1000;
  } else if (rawUnit === 'mo' || rawUnit.startsWith('month')) {
    unitMs = 30 * 24 * 3600 * 1000;
  } else if (rawUnit === 'y' || rawUnit.startsWith('yr') || rawUnit.startsWith('year')) {
    unitMs = 365 * 24 * 3600 * 1000;
  } else {
    return null;
  }

  return new Date(nowMs - amount * unitMs).toISOString();
}

/**
 * Verifies that a YouTube search result's channel matches the configured source to avoid third-party video pollution.
 */
function isMatchingYouTubeChannel(videoChannel: string | undefined, sourceName: string): boolean {
  if (!videoChannel) return true;
  const normVideo = videoChannel.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normSource = sourceName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!normVideo || !normSource) return true;
  if (normVideo.includes(normSource) || normSource.includes(normVideo)) return true;

  // Allow official broadcast channels for TV anchor shows
  if (normSource === 'sushantsinha' && (normVideo.includes('timesnownavbharat') || normVideo.includes('news18india'))) {
    return true;
  }

  const stopWords = new Set(['the', 'by', 'india', 'bharat', 'news', 'network', 'official', 'we', 'are', 'tv', 'main', 'bhi']);
  const tokens = sourceName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !stopWords.has(t));

  return tokens.length > 0 && tokens.some((token) => normVideo.includes(token));
}

let ytSessionCookies = '';

function updateYtCookies(res: Response) {
  const setCookies: string[] =
    typeof (res.headers as any).getSetCookie === 'function'
      ? (res.headers as any).getSetCookie()
      : [];
  if (!setCookies || setCookies.length === 0) return;

  const cookieMap = new Map<string, string>();
  if (ytSessionCookies) {
    for (const part of ytSessionCookies.split('; ')) {
      const [k, ...v] = part.split('=');
      if (k && v.length > 0) cookieMap.set(k.trim(), v.join('='));
    }
  }
  for (const raw of setCookies) {
    const pair = raw.split(';')[0];
    const [k, ...v] = pair.split('=');
    if (k && v.length > 0) {
      const val = v.join('=').trim();
      if (val) cookieMap.set(k.trim(), val);
    }
  }
  ytSessionCookies = Array.from(cookieMap.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

/**
 * Tier-1 plain-HTTP YouTube search operation.
 * Uses `GET https://www.youtube.com/results?search_query={q}&sp=EgQIAxAB` (Videos uploaded This Week filter)
 * and extracts `videoRenderer` records from `ytInitialData` without launching a browser.
 */
async function fetchYouTubeTier1Http(query: string): Promise<YouTubeVideoResult[]> {
  let currentUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgQIAxAB`;
  let res: Response | null = null;

  for (let hop = 0; hop < 4; hop++) {
    res = await fetch(currentUrl, {
      redirect: 'manual',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(ytSessionCookies ? { 'Cookie': ytSessionCookies } : {}),
      },
      signal: AbortSignal.timeout(9000),
    });
    updateYtCookies(res);

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) break;
      currentUrl = loc.startsWith('http') ? loc : `https://www.youtube.com${loc}`;
      continue;
    }
    break;
  }

  if (!res || !res.ok) {
    throw new Error(`YouTube Tier-1 HTTP ${res?.status || 'failed'}`);
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
 * Ingests a YouTube journalism / creator source using Tier-1 HTTP search (with `sp=EgQIAxAB` This-Week filter)
 * and `api-anything` CLI fallback, strictly enforcing a 7-day (1-week) freshness cutoff and channel match.
 */
export async function fetchYouTubeViaApiAnything(
  source: any,
  maxItems = 15
): Promise<ApiAnythingIngestedItem[]> {
  const query = extractYouTubeQuery(source);

  // 1. Fetch with built-in Tier-1 plain-HTTP operation using YouTube's "This Week" filter (`sp=EgQIAxAB`)
  let videos: YouTubeVideoResult[] | null = [];
  try {
    videos = await fetchYouTubeTier1Http(query);
  } catch {
    videos = null;
  }

  // 2. Fallback to `api-anything call youtube search q=...` CLI if Tier-1 HTTP returned nothing
  if (!videos || videos.length === 0) {
    videos = await callApiAnythingCli('youtube', 'search', { q: query });
  }

  if (!videos || videos.length === 0) {
    return [];
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const items: ApiAnythingIngestedItem[] = [];

  for (const v of videos) {
    if (!v || !v.id || !v.title) continue;
    if (!isMatchingYouTubeChannel(v.channel, source.name)) continue;

    const pubIso = parseRelativeTimeToIso(v.publishedTime, nowMs);
    if (!pubIso) continue;

    const pubMs = new Date(pubIso).getTime();
    if (isNaN(pubMs) || nowMs - pubMs > MAX_YOUTUBE_AGE_MS) {
      continue; // Strictly reject videos older than 1 week (7 days)
    }

    const cleanTitle = v.title.trim();
    const { topic } = getCategoryAndRegion(cleanTitle, source.region, source.lane, source.name);
    const summaryParts = [
      v.channel || source.name,
      v.views ? v.views : null,
      v.publishedTime ? v.publishedTime : null,
    ].filter(Boolean);

    items.push({
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
    });

    if (items.length >= maxItems) break;
  }

  return items;
}

export const MAX_CUSTOM_SITE_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours for non-RSS civic/digital portals

/**
 * Fetches non-RSS civic/policy portals (e.g. PRS Legislative Research, ADR India, The Tatva)
 * using verified Google News RSS syndication timestamps first so static archival links are never
 * stamped with fake Date.now() timestamps, strictly enforcing a 48-hour freshness cutoff.
 */
export async function fetchCustomSiteViaApiAnything(
  source: any,
  maxItems = 20
): Promise<ApiAnythingIngestedItem[]> {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  // 1. Primary: Use Google News RSS syndication in FEED_FALLBACKS which provides real publication timestamps
  const fallbackUrl = FEED_FALLBACKS[source.name];
  if (fallbackUrl) {
    try {
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
        const items: ApiAnythingIngestedItem[] = [];

        for (const item of feed.items || []) {
          const pubRaw = item.isoDate || item.pubDate;
          if (!pubRaw) continue;
          const pubMs = new Date(pubRaw).getTime();
          if (isNaN(pubMs) || nowMs - pubMs > MAX_CUSTOM_SITE_AGE_MS) {
            continue; // Skip old reports/bills older than 48 hours
          }

          const cleanTitle = (item.title || 'Untitled Report').trim();
          const itemUrl = (item.link || item.guid || '').trim();
          if (!itemUrl.startsWith('http')) continue;

          const { topic } = getCategoryAndRegion(cleanTitle, source.region, source.lane, source.name);
          items.push({
            source_id: source.id,
            source_name: source.name,
            lane: source.lane,
            title: cleanTitle,
            url: itemUrl,
            published_at: new Date(pubMs).toISOString(),
            raw_summary: (item.contentSnippet || item.content || cleanTitle)
              .replace(/<[^>]*>?/gm, '')
              .trim()
              .slice(0, 300),
            category: topic,
            via_google_news: true,
            fetched_at: nowIso,
          });

          if (items.length >= maxItems) break;
        }

        return items;
      }
    } catch {
      // Ignore syndication fetch failure
    }
  }

  return [];
}
