export function timeAgo(dateString: string | null | undefined): string {
  if (!dateString) return '';
  const nowMs = Date.now();
  const effectiveMs = getEffectiveItemTimestamp(dateString, null, nowMs);
  if (effectiveMs === null) return '';

  const date = new Date(effectiveMs);
  const seconds = Math.floor((nowMs - effectiveMs) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Returns a valid epoch timestamp (ms) for an article item, clamping future-skewed RSS timestamps
 * (e.g. IST feeds mislabeled as +00:00) to `fetched_at` or `Date.now()`.
 */
export function getEffectiveItemTimestamp(
  publishedAt?: string | null,
  fetchedAt?: string | null,
  nowMs: number = Date.now()
): number | null {
  const pubMs = publishedAt ? new Date(publishedAt).getTime() : NaN;
  const fetchMs = fetchedAt ? new Date(fetchedAt).getTime() : NaN;
  const validFetchMs = !isNaN(fetchMs) ? Math.min(fetchMs, nowMs) : nowMs;

  if (!isNaN(pubMs)) {
    // If RSS feed timestamp is in the future by >1 minute, check if it's an IST (+05:30) timestamp mislabeled as UTC (+00:00)
    if (pubMs > nowMs + 60_000) {
      const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
      const istCorrectedMs = pubMs - IST_OFFSET_MS;
      if (istCorrectedMs <= nowMs + 60_000) {
        return istCorrectedMs;
      }
      return validFetchMs;
    }
    return pubMs;
  }

  if (!isNaN(fetchMs)) {
    return validFetchMs;
  }

  return null;
}

/**
 * Computes `first_seen_at` (earliest item publication) and `last_updated_at` (most recent item publication)
 * from a hub's items so hubs reflect real article freshness rather than batch script execution time.
 */
export function resolveHubTimestamps(
  items?: Array<{ published_at?: string | null; fetched_at?: string | null }> | null,
  fallbackFirstSeen?: string | null,
  fallbackLastUpdated?: string | null
): { first_seen_at: string; last_updated_at: string } {
  const nowMs = Date.now();
  const validTimes: number[] = [];

  if (items && items.length > 0) {
    for (const item of items) {
      const ts = getEffectiveItemTimestamp(item.published_at, item.fetched_at, nowMs);
      if (ts !== null) {
        validTimes.push(ts);
      }
    }
  }

  if (validTimes.length > 0) {
    const minTs = Math.min(...validTimes);
    const maxTs = Math.max(...validTimes);
    return {
      first_seen_at: new Date(minTs).toISOString(),
      last_updated_at: new Date(maxTs).toISOString(),
    };
  }

  const nowIso = new Date(nowMs).toISOString();
  return {
    first_seen_at: fallbackFirstSeen || fallbackLastUpdated || nowIso,
    last_updated_at: fallbackLastUpdated || fallbackFirstSeen || nowIso,
  };
}

