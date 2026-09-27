/**
 * Panchranga Multilingual Vector Embedding Module (384 Dimensions)
 * Supports English, Hindi, Marathi, Tamil, Telugu, Bengali, Kannada, Gujarati.
 */

export const EMBEDDING_DIMENSION = 384;

/**
 * Normalizes a vector to unit length (L2 norm = 1) for cosine similarity calculation via dot product.
 */
export function normalizeVector(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (norm === 0) return vector;
  return vector.map((val) => val / norm);
}

/**
 * Stopwords to filter out generic grammatical noise from similarity matching.
 */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
  'with', 'by', 'from', 'up', 'about', 'into', 'over', 'after', 'is', 'are',
  'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
  'did', 'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might',
  'must', 'news', 'latest', 'india', 'today', 'live', 'updates', 'pm', 'says'
]);

/**
 * Known boilerplate phrases commonly inserted by Google News syndication fallbacks
 * and generic RSS aggregators that distort vector similarity.
 */
export const BOILERPLATE_PATTERNS: RegExp[] = [
  /comprehensive up-to-date news coverage,?\s*(aggregated from sources all over the world by google news)?/gi,
  /aggregated from sources all over the world(\s*by google news)?/gi,
  /view full coverage on google news/gi,
  /google news/gi,
  /submitted by\s+.*?to\s+r\/[a-zA-Z0-9_-]+\s*\[link\]\s*\[comments\]/gi,
  /read (the )?(full )?(article|story|more) (on|at)\s+.*/gi,
  /unsubscribe\s*-\s*.*/gi,
  /photo:\s*.*/gi,
  /credit:\s*.*/gi,
  /read more at:.*/gi,
  /full coverage/gi,
];

/**
 * Strips publisher branding suffixes and known boilerplate from text before embedding.
 * Embeds on clean title + real substantive snippet only, falling back to title-only
 * weighting when summary is boilerplate, empty, or merely repeats the title.
 */
export function cleanTextForEmbedding(title: string, rawSummary?: string): string {
  if (!title) return '';

  // Clean publisher branding suffix from title, e.g. "Headline - Sakshi" -> "Headline"
  let cleanTitle = title
    .replace(/\s*[\-–—|]\s*[^–—\-|\s]+.*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanTitle || cleanTitle.length < 3) {
    cleanTitle = title.trim();
  }

  if (!rawSummary || typeof rawSummary !== 'string') {
    return cleanTitle;
  }

  // Remove HTML tags and common boilerplate patterns
  let cleanSummary = rawSummary.replace(/<[^>]*>?/gm, ' ');
  for (const pattern of BOILERPLATE_PATTERNS) {
    cleanSummary = cleanSummary.replace(pattern, ' ');
  }

  // Strip trailing publisher suffix from summary if present
  cleanSummary = cleanSummary
    .replace(/\s*[\-–—|]\s*[^–—\-|\s]+.*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Normalized forms to check if summary is just identical to title
  const normTitle = cleanTitle.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const normSummary = cleanSummary.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

  // If summary is trivial (< 15 chars), contains no alphabetic content, or is redundant with title, embed title only
  if (cleanSummary.length < 15 || normSummary === normTitle || normSummary.length === 0) {
    return cleanTitle;
  }

  // Both title and meaningful summary present: emphasize title with double-weighting
  return `${cleanTitle}. ${cleanTitle}. ${cleanSummary}`;
}

/**
 * Generates a 384-dimensional vector embedding for multilingual text.
 * Accepts either title + optional rawSummary, or pre-composed text.
 */
export async function generateEmbedding(text: string, rawSummary?: string): Promise<number[]> {
  const preparedText = rawSummary !== undefined
    ? cleanTextForEmbedding(text, rawSummary)
    : cleanTextForEmbedding(text);

  // Unicode regex matching letters & numbers across all Indian scripts
  const clean = preparedText.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ');
  const vector = new Array(EMBEDDING_DIMENSION).fill(0);
  const words = clean.split(/\s+/).filter((w) => w.length > 1 && !STOPWORDS.has(w));

  if (words.length === 0) return vector;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];

    // Primary word token hash
    let hash = 0;
    for (let c = 0; c < word.length; c++) {
      hash = (hash << 5) - hash + word.charCodeAt(c);
      hash |= 0;
    }
    const idx = Math.abs(hash) % EMBEDDING_DIMENSION;
    vector[idx] += 2.0;

    // Sub-word 3-grams for fuzzy word matching
    if (word.length >= 3) {
      for (let j = 0; j <= word.length - 3; j++) {
        const gram = word.substring(j, j + 3);
        let gHash = 0;
        for (let c = 0; c < gram.length; c++) {
          gHash = (gHash << 5) - gHash + gram.charCodeAt(c);
          gHash |= 0;
        }
        const gIdx = Math.abs(gHash) % EMBEDDING_DIMENSION;
        vector[gIdx] += 0.8;
      }
    }
  }

  return normalizeVector(vector);
}

/**
 * Calculates Cosine Similarity between two 384-dim vector embeddings.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
