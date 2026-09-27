import crypto from 'crypto';
import { cosineSimilarity } from './embeddings';
import { isWithinHubDuplicate, normalizeTitle, wordJaccardSimilarity } from './dedup';
import { RawItem, TopicHub } from './types';

export const SIMILARITY_THRESHOLD = 0.45; // Multilingual cosine similarity threshold for clustering same-event items
export const SINGLE_SOURCE_SANITY_CAP = 12; // Cap on items from one publisher before requiring strict title re-comparison

export interface ClusteredResult {
  hubs: TopicHub[];
  clusteredItems: RawItem[];
}

/**
 * Cluster raw items into Topic Hubs based on Cosine Similarity of 384-dim vector embeddings,
 * with safeguards against single-source mega-hub explosion and post-clustering duplicate detection.
 */
export function clusterRawItems(
  existingHubs: TopicHub[],
  rawItems: RawItem[],
  threshold = SIMILARITY_THRESHOLD
): ClusteredResult {
  const hubs: TopicHub[] = JSON.parse(JSON.stringify(existingHubs));
  const clusteredItems: RawItem[] = JSON.parse(JSON.stringify(rawItems));

  for (const item of clusteredItems) {
    if (!item.embedding || item.embedding.length === 0) continue;

    let bestHub: TopicHub | null = null;
    let maxSimilarity = -1;

    const candidateSource = (item.source_name || item.sources?.name || item.source?.name || '').trim();

    // Compare item against existing topic hubs
    for (const hub of hubs) {
      if (!hub.items || hub.items.length === 0) continue;

      // 1. Sanity Cap: Check if this single publisher is already over-represented in this hub
      const sameSourceCount = candidateSource
        ? hub.items.filter((i) => (i.source_name || i.sources?.name || i.source?.name || '').trim() === candidateSource).length
        : 0;

      // Calculate max similarity and lead-item similarity to combat single-linkage drift
      let hubMaxSim = -1;
      let leadSim = -1;

      for (let idx = 0; idx < hub.items.length; idx++) {
        const hubItem = hub.items[idx];
        if (hubItem.embedding && hubItem.embedding.length > 0) {
          const sim = cosineSimilarity(item.embedding, hubItem.embedding);
          if (sim > hubMaxSim) {
            hubMaxSim = sim;
          }
          if (idx === 0) {
            leadSim = sim;
          }
        }
      }

      // If hub has items, fallback leadSim to hubMaxSim if first item lacked embedding
      if (leadSim < 0) leadSim = hubMaxSim;

      // If adding would exceed the single-source sanity cap, require strict title re-comparison
      if (sameSourceCount >= SINGLE_SOURCE_SANITY_CAP) {
        const jaccardWithHubTitle = wordJaccardSimilarity(
          normalizeTitle(item.title),
          normalizeTitle(hub.title)
        );
        // Stricter requirement: high lead embedding match AND lexical title keyword overlap
        if (leadSim < 0.55 || jaccardWithHubTitle < 0.25) {
          continue; // Reject joining this hub to prevent single-source mega-hub explosion
        }
      }

      // 2. Prevent single-linkage drift for larger hubs (item must retain reasonable affinity to lead event)
      if (hub.items.length >= 4 && leadSim < 0.30) {
        continue;
      }

      if (hubMaxSim > maxSimilarity) {
        maxSimilarity = hubMaxSim;
        bestHub = hub;
      }
    }

    if (bestHub && maxSimilarity >= threshold) {
      // Attach to existing hub
      item.cluster_id = bestHub.id;
      if (!bestHub.items) bestHub.items = [];

      // 3. Post-clustering within-hub duplicate detection (URL, normalized title, or >=0.85 Jaccard)
      const dupCheck = isWithinHubDuplicate(item, bestHub.items);

      if (dupCheck.isDuplicate && dupCheck.matchedItem) {
        // Merge metadata: copy thumbnail or better summary if existing lacked it
        if (item.og_image && !dupCheck.matchedItem.og_image) {
          dupCheck.matchedItem.og_image = item.og_image;
        }
        if (
          item.raw_summary &&
          (!dupCheck.matchedItem.raw_summary ||
            dupCheck.matchedItem.raw_summary.length < item.raw_summary.length)
        ) {
          dupCheck.matchedItem.raw_summary = item.raw_summary;
        }
        bestHub.last_updated_at = new Date().toISOString();
      } else {
        bestHub.items.push(item);
        bestHub.item_count = bestHub.items.length;
        bestHub.last_updated_at = new Date().toISOString();
      }
    } else {
      // Create new topic hub for this event
      const newHubId = crypto.randomUUID();
      item.cluster_id = newHubId;

      const newHub: TopicHub = {
        id: newHubId,
        title: item.title,
        first_seen_at: item.published_at || new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
        item_count: 1,
        mainstream_count: item.lane === 'mainstream' ? 1 : 0,
        grassroots_count: item.lane === 'grassroots' ? 1 : 0,
        discourse_count: item.lane === 'discourse' ? 1 : 0,
        items: [item],
      };

      hubs.push(newHub);
    }
  }

  // Recalculate lane counts & clean up empty hubs
  const finalHubs = hubs.map((hub) => {
    const itemsInHub = hub.items || [];
    const mainstream = itemsInHub.filter((i) => i.lane === 'mainstream').length;
    const grassroots = itemsInHub.filter((i) => i.lane === 'grassroots').length;
    const discourse = itemsInHub.filter((i) => i.lane === 'discourse').length;

    return {
      ...hub,
      item_count: itemsInHub.length,
      mainstream_count: mainstream,
      grassroots_count: grassroots,
      discourse_count: discourse,
    };
  }).sort((a, b) => new Date(b.last_updated_at).getTime() - new Date(a.last_updated_at).getTime());

  return {
    hubs: finalHubs,
    clusteredItems,
  };
}
