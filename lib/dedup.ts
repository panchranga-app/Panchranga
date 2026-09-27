import { RawItem } from './types';

/**
 * Normalizes a news article title for deduplication:
 * 1. Strips publisher branding suffix (e.g. " - The Hindu", " | NDTV", " — BBC")
 * 2. Lowercases string
 * 3. Removes all punctuation while preserving Unicode multilingual characters (Hindi, Urdu, Punjabi, etc.)
 * 4. Collapses whitespace
 */
export function normalizeTitle(title: string): string {
  if (!title) return '';

  return title
    // Strip common trailing publisher attribution: " - Source Name", " | Source Name", " — Source Name"
    .replace(/\s*[\-–—|]\s*[^–—\-|\s]+.*$/, '')
    // Unicode-aware: keep letters (\p{L}), numbers (\p{N}), and whitespace (\s)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculates word-level Jaccard similarity between two normalized strings
 */
export function wordJaccardSimilarity(str1: string, str2: string): number {
  const set1 = new Set(str1.split(' ').filter((w) => w.length > 2));
  const set2 = new Set(str2.split(' ').filter((w) => w.length > 2));

  if (set1.size === 0 || set2.size === 0) return 0;

  let intersection = 0;
  for (const word of set1) {
    if (set2.has(word)) {
      intersection++;
    }
  }

  const union = new Set([...set1, ...set2]).size;
  return union === 0 ? 0 : intersection / union;
}

export interface DedupMatch {
  isDuplicate: boolean;
  matchedItem?: any;
  reason?: string;
  similarity?: number;
}

/**
 * Checks whether an incoming aggregator article is a duplicate of any existing direct feed article
 * within a ±2 hour publication window.
 */
export function checkDuplicate(
  aggItem: { title: string; published_at: string; url?: string },
  existingItems: Array<{ title: string; published_at: string; source_name?: string; url?: string }>,
  timeWindowHours = 2
): DedupMatch {
  const aggNorm = normalizeTitle(aggItem.title);
  if (!aggNorm || aggNorm.length < 10) {
    return { isDuplicate: false };
  }

  const aggTime = new Date(aggItem.published_at).getTime();
  const windowMs = timeWindowHours * 60 * 60 * 1000;

  for (const existing of existingItems) {
    // If URL matches exactly, it's definitely a duplicate
    if (aggItem.url && existing.url && aggItem.url === existing.url) {
      return {
        isDuplicate: true,
        matchedItem: existing,
        reason: 'exact_url_match',
        similarity: 1.0,
      };
    }

    const existTime = new Date(existing.published_at).getTime();
    if (!isNaN(aggTime) && !isNaN(existTime)) {
      if (Math.abs(aggTime - existTime) > windowMs) {
        continue; // Outside the ±2 hour window
      }
    }

    const existNorm = normalizeTitle(existing.title);
    if (!existNorm) continue;

    // Exact normalized title match
    if (aggNorm === existNorm) {
      return {
        isDuplicate: true,
        matchedItem: existing,
        reason: 'exact_normalized_title_match',
        similarity: 1.0,
      };
    }

    // High word token overlap match (> 0.85) for minor phrasing variations
    const sim = wordJaccardSimilarity(aggNorm, existNorm);
    if (sim >= 0.85) {
      return {
        isDuplicate: true,
        matchedItem: existing,
        reason: `high_jaccard_similarity_${(sim * 100).toFixed(0)}%`,
        similarity: sim,
      };
    }
  }

  return { isDuplicate: false };
}

export interface DedupResult<T> {
  uniqueAggregatorItems: T[];
  dedupHits: number;
  totalAggregatorItems: number;
  hitRate: string;
  hitLog: Array<{ aggTitle: string; matchedTitle: string; sourceName: string; reason: string }>;
}

/**
 * Deduplicates an array of aggregator lane items against existing direct feed items.
 */
export function deduplicateAggregatorItems<T extends { title: string; published_at: string; url?: string }>(
  aggregatorItems: T[],
  existingItems: Array<{ title: string; published_at: string; source_name?: string; url?: string }>,
  timeWindowHours = 2
): DedupResult<T> {
  const uniqueAggregatorItems: T[] = [];
  const hitLog: Array<{ aggTitle: string; matchedTitle: string; sourceName: string; reason: string }> = [];
  const runningPool = [...existingItems];

  for (const item of aggregatorItems) {
    const match = checkDuplicate(item, runningPool, timeWindowHours);
    if (match.isDuplicate && match.matchedItem) {
      hitLog.push({
        aggTitle: item.title,
        matchedTitle: match.matchedItem.title,
        sourceName: match.matchedItem.source_name || 'Direct Source',
        reason: match.reason || 'normalized_title_match',
      });
      console.log(
        `🔍 [DEDUP] Aggregator story matched direct feed: "${item.title.slice(0, 50)}..." matches [${match.matchedItem.source_name || 'Direct'}] "${match.matchedItem.title.slice(0, 50)}..."`
      );
    } else {
      uniqueAggregatorItems.push(item);
      runningPool.push(item as any); // Prevent intra-aggregator duplicates
    }
  }

  const dedupHits = hitLog.length;
  const total = aggregatorItems.length;
  const hitRate = total > 0 ? `${((dedupHits / total) * 100).toFixed(1)}%` : '0.0%';

  return {
    uniqueAggregatorItems,
    dedupHits,
    totalAggregatorItems: total,
    hitRate,
    hitLog,
  };
}

/**
 * Checks if a candidate item is a duplicate of any item already inside a Topic Hub:
 * 1. Exact URL match
 * 2. Exact normalized title match (after stripping publisher suffix)
 * 3. High word token Jaccard similarity (>= 0.85)
 */
export function isWithinHubDuplicate<T extends { title: string; url?: string }>(
  candidate: T,
  existingHubItems: T[]
): { isDuplicate: boolean; matchedItem?: T; reason?: string } {
  if (!existingHubItems || existingHubItems.length === 0) {
    return { isDuplicate: false };
  }

  const candUrl = (candidate.url || '').trim();
  const candNorm = normalizeTitle(candidate.title);

  for (const existing of existingHubItems) {
    const existUrl = (existing.url || '').trim();

    // 1. Exact URL match
    if (candUrl && existUrl && candUrl === existUrl) {
      return { isDuplicate: true, matchedItem: existing, reason: 'exact_url' };
    }

    if (!candNorm) continue;
    const existNorm = normalizeTitle(existing.title);
    if (!existNorm) continue;

    // 2. Exact normalized title match
    if (candNorm === existNorm) {
      return { isDuplicate: true, matchedItem: existing, reason: 'exact_normalized_title' };
    }

    // 3. High token Jaccard similarity (>= 0.85)
    const sim = wordJaccardSimilarity(candNorm, existNorm);
    if (sim >= 0.85) {
      return { isDuplicate: true, matchedItem: existing, reason: `jaccard_${(sim * 100).toFixed(0)}%` };
    }
  }

  return { isDuplicate: false };
}

