import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  VERIFIED_LLM_CONFIG,
  ModelQuotaConfig,
  ProviderId,
  JobType,
  JobPriority,
  PROMPT_VERSION,
  EMERGENCY_BUFFER_RATIO,
  TASK_MAX_TOKENS,
  TASK_TEMPERATURE,
} from './llm-config';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const QUOTA_STATE_FILE = path.resolve(DATA_DIR, 'llm-quota-state.json');
const SUMMARY_CACHE_FILE = path.resolve(DATA_DIR, 'llm-summary-cache.json');
const DEFERRED_QUEUE_FILE = path.resolve(DATA_DIR, 'llm-deferred-queue.json');

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CIRCUIT_BREAKER_THRESHOLD = 3; // Consecutive failures before cooling

export interface QuotaBucketState {
  key: string;
  provider: ProviderId;
  model: string;
  requestsToday: number;
  tokensToday: number;
  neuronsToday: number;
  minuteWindowStartMs: number;
  requestsThisMinute: number;
  tokensThisMinute: number;
  dailyResetAtMs: number;
  consecutiveFailures: number;
  coolingUntilMs: number;
  rateLimit429Count: number;
  fallbackCount: number;
  lastUpdatedMs: number;
}

export interface PersistentQuotaState {
  version: string;
  buckets: Record<string, QuotaBucketState>;
  telemetry: {
    cacheHits: number;
    cacheMisses: number;
    trivialBypasses: number;
    totalFallbacks: number;
    total429s: number;
    queuedJobsCount: number;
  };
}

export interface CacheEntry {
  text: string;
  provider: ProviderId;
  model: string;
  createdAtMs: number;
  expiresAtMs: number;
}

export interface DeferredJob {
  id: string;
  hubId?: string;
  jobType: JobType;
  systemPrompt: string;
  userPrompt: string;
  isSensitive: boolean;
  enqueuedAtMs: number;
  attempts: number;
}

export interface LlmRouterRequest {
  jobType: JobType;
  priority?: JobPriority;
  systemPrompt: string;
  userPrompt: string;
  isSensitive?: boolean;
  hubId?: string;
  maxTokensOverride?: number;
  timeoutMs?: number;
  /** Optional custom fetch implementation for unit testing mocked responses */
  fetchImpl?: typeof fetch;
}

export interface LlmRouterResponse {
  text: string | null;
  status: 'ok' | 'cached' | 'trivial_bypass' | 'queued_try_later';
  provider?: ProviderId;
  model?: string;
  fromCache: boolean;
  queued: boolean;
  tokensUsed?: number;
  jobId?: string;
}

// In-memory state synced to disk
let quotaState: PersistentQuotaState | null = null;
let summaryCache: Map<string, CacheEntry> | null = null;
let deferredQueue: DeferredJob[] | null = null;
let groqRotationCursor = 0;

// Per-provider concurrency limiter (max 2 in-flight requests per provider)
const activeProviderCalls: Record<ProviderId, number> = {
  gemini: 0,
  groq: 0,
  cloudflare: 0,
  openrouter: 0,
};
const MAX_CONCURRENT_PER_PROVIDER = 2;

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch {}
}

/**
 * Computes the next daily quota reset timestamp in UTC ms for a given model config.
 */
export function computeNextDailyResetMs(config: ModelQuotaConfig, nowMs = Date.now()): number {
  const now = new Date(nowMs);
  if (config.resetSchedule.dailyWindow === 'fixed_pacific') {
    // Midnight Pacific Time (07:00 UTC during PDT, 08:00 UTC during PST)
    const utcHour = typeof config.resetSchedule.dailyResetUtcHour === 'number'
      ? config.resetSchedule.dailyResetUtcHour
      : 7;
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), utcHour, 0, 0, 0));
    if (next.getTime() <= nowMs) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next.getTime();
  }

  // Default fixed_utc or rolling_24h boundary at next 00:00 UTC
  const nextUtcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
  return nextUtcMidnight.getTime();
}

function createInitialBucket(key: string, config: ModelQuotaConfig, nowMs = Date.now()): QuotaBucketState {
  return {
    key,
    provider: config.provider,
    model: config.model,
    requestsToday: 0,
    tokensToday: 0,
    neuronsToday: 0,
    minuteWindowStartMs: nowMs,
    requestsThisMinute: 0,
    tokensThisMinute: 0,
    dailyResetAtMs: computeNextDailyResetMs(config, nowMs),
    consecutiveFailures: 0,
    coolingUntilMs: 0,
    rateLimit429Count: 0,
    fallbackCount: 0,
    lastUpdatedMs: nowMs,
  };
}

export function loadQuotaState(nowMs = Date.now()): PersistentQuotaState {
  if (!quotaState) {
    ensureDataDir();
    try {
      if (fs.existsSync(QUOTA_STATE_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(QUOTA_STATE_FILE, 'utf-8'));
        if (parsed && parsed.buckets) {
          quotaState = parsed;
        }
      }
    } catch {}

    if (!quotaState) {
      quotaState = {
        version: PROMPT_VERSION,
        buckets: {},
        telemetry: {
          cacheHits: 0,
          cacheMisses: 0,
          trivialBypasses: 0,
          totalFallbacks: 0,
          total429s: 0,
          queuedJobsCount: 0,
        },
      };
    }
  }

  // Ensure every configured model has a bucket and apply automatic window resets
  for (const [key, config] of Object.entries(VERIFIED_LLM_CONFIG)) {
    if (!quotaState.buckets[key]) {
      quotaState.buckets[key] = createInitialBucket(key, config, nowMs);
    } else {
      const bucket = quotaState.buckets[key];
      // Reset 60-second rolling window if >= 60s elapsed
      if (nowMs - bucket.minuteWindowStartMs >= 60_000) {
        bucket.minuteWindowStartMs = nowMs;
        bucket.requestsThisMinute = 0;
        bucket.tokensThisMinute = 0;
      }
      // Reset daily window if past dailyResetAtMs
      if (nowMs >= bucket.dailyResetAtMs) {
        bucket.requestsToday = 0;
        bucket.tokensToday = 0;
        bucket.neuronsToday = 0;
        bucket.dailyResetAtMs = computeNextDailyResetMs(config, nowMs);
        if (bucket.coolingUntilMs <= nowMs) {
          bucket.coolingUntilMs = 0;
          bucket.consecutiveFailures = 0;
        }
      }
    }
  }

  return quotaState;
}

export function saveQuotaState() {
  if (!quotaState) return;
  ensureDataDir();
  try {
    fs.writeFileSync(QUOTA_STATE_FILE, JSON.stringify(quotaState, null, 2), 'utf-8');
  } catch {}
}

function loadSummaryCache(nowMs = Date.now()): Map<string, CacheEntry> {
  if (!summaryCache) {
    summaryCache = new Map<string, CacheEntry>();
    ensureDataDir();
    try {
      if (fs.existsSync(SUMMARY_CACHE_FILE)) {
        const raw = JSON.parse(fs.readFileSync(SUMMARY_CACHE_FILE, 'utf-8'));
        for (const [k, v] of Object.entries(raw)) {
          const entry = v as CacheEntry;
          if (entry && entry.expiresAtMs > nowMs) {
            summaryCache.set(k, entry);
          }
        }
      }
    } catch {}
  }
  return summaryCache;
}

function saveSummaryCache() {
  if (!summaryCache) return;
  ensureDataDir();
  try {
    const obj: Record<string, CacheEntry> = {};
    const nowMs = Date.now();
    for (const [k, v] of summaryCache.entries()) {
      if (v.expiresAtMs > nowMs) {
        obj[k] = v;
      }
    }
    fs.writeFileSync(SUMMARY_CACHE_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch {}
}

function loadDeferredQueue(): DeferredJob[] {
  if (!deferredQueue) {
    ensureDataDir();
    try {
      if (fs.existsSync(DEFERRED_QUEUE_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(DEFERRED_QUEUE_FILE, 'utf-8'));
        if (Array.isArray(parsed)) {
          deferredQueue = parsed;
        }
      }
    } catch {}
    if (!deferredQueue) deferredQueue = [];
  }
  return deferredQueue;
}

function saveDeferredQueue() {
  if (!deferredQueue) return;
  ensureDataDir();
  try {
    fs.writeFileSync(DEFERRED_QUEUE_FILE, JSON.stringify(deferredQueue, null, 2), 'utf-8');
  } catch {}
}

/**
 * Resets in-memory state (used by unit tests).
 */
export function resetRouterStateForTests() {
  const nowMs = Date.now();
  quotaState = {
    version: PROMPT_VERSION,
    buckets: {},
    telemetry: {
      cacheHits: 0,
      cacheMisses: 0,
      trivialBypasses: 0,
      totalFallbacks: 0,
      total429s: 0,
      queuedJobsCount: 0,
    },
  };
  for (const [key, config] of Object.entries(VERIFIED_LLM_CONFIG)) {
    quotaState.buckets[key] = createInitialBucket(key, config, nowMs);
  }
  summaryCache = new Map();
  deferredQueue = [];
  groqRotationCursor = 0;
  activeProviderCalls.gemini = 0;
  activeProviderCalls.groq = 0;
  activeProviderCalls.cloudflare = 0;
  activeProviderCalls.openrouter = 0;
}

/**
 * Pre-processes input text before any LLM call:
 * - Strips HTML tags, entities, nav/footer/ad boilerplate, and excess whitespace
 * - Deduplicates identical or near-identical lines/paragraphs so repeated syndicated headlines
 *   are never sent multiple times in the same prompt.
 */
export function preprocessLlmInput(rawText: string): string {
  if (!rawText) return '';

  let cleaned = rawText
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<[^>]*>?/gm, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/(?:read more|continue reading|click here for more|full coverage|subscribe to our newsletter|all rights reserved|advertisement)[\s\S]*$/gi, '');

  const rawLines = cleaned
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const dedupedLines: string[] = [];
  const seenNormalized: string[] = [];

  for (const line of rawLines) {
    const withoutPublisher = line
      .replace(/\s*\|\s*.*$/, '')
      .replace(/\s+-\s+[A-Z][A-Za-z0-9\s.&'-]{2,35}$/, '');
    const norm = withoutPublisher
      .toLowerCase()
      .replace(/[^a-z0-9\u0900-\u0D7F\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!norm) continue;

    // Check if near-identical to an already included line (exact, substring, or >=68% word overlap)
    const wordsA = new Set(norm.split(' ').filter((w) => w.length > 2));
    let isNearDup = false;
    for (const prev of seenNormalized) {
      if (prev === norm || (prev.length > 25 && (prev.includes(norm) || norm.includes(prev)))) {
        isNearDup = true;
        break;
      }
      if (wordsA.size >= 4) {
        const wordsB = new Set(prev.split(' ').filter((w) => w.length > 2));
        let overlap = 0;
        for (const w of wordsA) {
          if (wordsB.has(w)) overlap++;
        }
        const union = new Set([...wordsA, ...wordsB]).size;
        if (union > 0 && overlap / union >= 0.68) {
          isNearDup = true;
          break;
        }
      }
    }

    if (!isNearDup) {
      seenNormalized.push(norm);
      dedupedLines.push(line);
    }
  }

  return dedupedLines.join('\n').trim();
}

/**
 * Estimates token count conservatively for both Latin and Indic scripts.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const hasIndic = /[\u0900-\u0D7F]/.test(text);
  const charsPerToken = hasIndic ? 2.2 : 3.8;
  return Math.max(1, Math.ceil(text.length / charsPerToken));
}

/**
 * Computes content hash for caching: SHA-256(normalizedContent + jobType + PROMPT_VERSION).
 */
export function computeContentHash(jobType: JobType, systemPrompt: string, cleanedUserPrompt: string): string {
  const payload = `${PROMPT_VERSION}|${jobType}|${systemPrompt.trim()}|${cleanedUserPrompt.trim().toLowerCase()}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Parses duration strings like "2m52.8s", "180ms", "45s", or integer seconds from Retry-After / x-ratelimit-reset-* headers.
 */
export function parseResetHeaderMs(rawHeader: string | null | undefined): number | null {
  if (!rawHeader) return null;
  const trimmed = rawHeader.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Math.ceil(parseFloat(trimmed) * 1000);
  }

  let totalMs = 0;
  let matched = false;
  const hours = trimmed.match(/(\d+(?:\.\d+)?)h/i);
  const mins = trimmed.match(/(\d+(?:\.\d+)?)m(?!s)/i);
  const secs = trimmed.match(/(\d+(?:\.\d+)?)s/i);
  const ms = trimmed.match(/(\d+(?:\.\d+)?)ms/i);

  if (hours) {
    totalMs += parseFloat(hours[1]) * 3600_000;
    matched = true;
  }
  if (mins) {
    totalMs += parseFloat(mins[1]) * 60_000;
    matched = true;
  }
  if (secs) {
    totalMs += parseFloat(secs[1]) * 1000;
    matched = true;
  }
  if (ms) {
    totalMs += parseFloat(ms[1]);
    matched = true;
  }

  return matched ? Math.ceil(totalMs) : null;
}

function isProviderConfigured(provider: ProviderId): boolean {
  switch (provider) {
    case 'gemini':
      return Boolean(process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY);
    case 'groq':
      return Boolean(process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY);
    case 'cloudflare':
      return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);
    case 'openrouter':
      return Boolean(process.env.OPENROUTER_API_KEY || process.env.NEXT_PUBLIC_OPENROUTER_API_KEY);
  }
}

/**
 * Returns total daily requests used across shared-pool providers (e.g., OpenRouter's 50 RPD shared across :free models).
 */
function getEffectiveDailyUsage(state: PersistentQuotaState, config: ModelQuotaConfig, bucket: QuotaBucketState) {
  if (config.quotaScope === 'per_model') {
    return {
      requestsToday: bucket.requestsToday,
      tokensToday: bucket.tokensToday,
      neuronsToday: bucket.neuronsToday,
    };
  }
  // Aggregate across all buckets sharing the same provider for per_account / per_project scopes
  let requestsToday = 0;
  let tokensToday = 0;
  let neuronsToday = 0;
  for (const b of Object.values(state.buckets)) {
    if (b.provider === config.provider) {
      requestsToday += b.requestsToday;
      tokensToday += b.tokensToday;
      neuronsToday += b.neuronsToday;
    }
  }
  return { requestsToday, tokensToday, neuronsToday };
}

/**
 * Checks if a model bucket has enough headroom (RPM, RPD, TPM, TPD, Neurons, Context Window, Time-Slice Scheduler).
 */
export function canModelFitRequest(
  key: string,
  estimatedInputTokens: number,
  maxOutputTokens: number,
  priority: JobPriority,
  isSensitive: boolean,
  nowMs = Date.now()
): { allowed: boolean; reason?: string } {
  const config = VERIFIED_LLM_CONFIG[key];
  if (!config) return { allowed: false, reason: 'unknown_model' };

  if (!isProviderConfigured(config.provider)) {
    return { allowed: false, reason: 'missing_credentials' };
  }

  if (isSensitive && !config.terms.allowSensitiveContent) {
    return { allowed: false, reason: 'sensitive_content_disallowed_by_terms' };
  }

  if (activeProviderCalls[config.provider] >= MAX_CONCURRENT_PER_PROVIDER) {
    return { allowed: false, reason: 'provider_concurrency_cap_reached' };
  }

  const state = loadQuotaState(nowMs);
  const bucket = state.buckets[key];

  if (bucket.coolingUntilMs > nowMs) {
    return { allowed: false, reason: `circuit_breaker_cooling_until_${new Date(bucket.coolingUntilMs).toISOString()}` };
  }

  const totalEstimatedTokens = estimatedInputTokens + maxOutputTokens;

  // 1. Context window check
  if (totalEstimatedTokens > config.limits.contextWindow.operationalCeiling) {
    return { allowed: false, reason: 'exceeds_context_window' };
  }

  // 2. Minute window checks (RPM & TPM)
  if (bucket.requestsThisMinute + 1 > config.limits.rpm.operationalCeiling) {
    return { allowed: false, reason: 'exceeds_rpm' };
  }
  if (bucket.tokensThisMinute + totalEstimatedTokens > config.limits.tpm.operationalCeiling) {
    return { allowed: false, reason: 'exceeds_tpm' };
  }

  // 3. Daily window checks (RPD, TPD, Neurons) + Emergency Buffer & Time-Slice Scheduler
  const dailyUsage = getEffectiveDailyUsage(state, config, bucket);
  const maxRpd = config.limits.rpd.operationalCeiling;
  const maxTpd = config.limits.tpd.operationalCeiling;
  const maxNeurons = config.limits.dailyNeurons?.operationalCeiling;

  if (dailyUsage.requestsToday + 1 > maxRpd) {
    return { allowed: false, reason: 'exceeds_rpd' };
  }
  if (dailyUsage.tokensToday + totalEstimatedTokens > maxTpd) {
    return { allowed: false, reason: 'exceeds_tpd' };
  }
  if (maxNeurons && dailyUsage.neuronsToday + 2.5 > maxNeurons) {
    return { allowed: false, reason: 'exceeds_daily_neurons' };
  }

  // 4. All-day availability scheduler:
  // Background jobs cannot consume the 12% emergency buffer OR overrun the current time-slice allowance
  if (priority === 'background') {
    const backgroundRpdCap = Math.floor(maxRpd * (1 - EMERGENCY_BUFFER_RATIO));
    const backgroundTpdCap = Math.floor(maxTpd * (1 - EMERGENCY_BUFFER_RATIO));

    if (dailyUsage.requestsToday + 1 > backgroundRpdCap) {
      return { allowed: false, reason: 'reserved_for_interactive_emergency_buffer_rpd' };
    }
    if (dailyUsage.tokensToday + totalEstimatedTokens > backgroundTpdCap) {
      return { allowed: false, reason: 'reserved_for_interactive_emergency_buffer_tpd' };
    }
    if (maxNeurons && dailyUsage.neuronsToday + 2.5 > Math.floor(maxNeurons * (1 - EMERGENCY_BUFFER_RATIO))) {
      return { allowed: false, reason: 'reserved_for_interactive_emergency_buffer_neurons' };
    }

    // Time-slice pacing: calculate fraction of the 24h cycle elapsed + 25% burst allowance
    const msRemainingInDay = Math.max(0, bucket.dailyResetAtMs - nowMs);
    const dayFractionElapsed = Math.min(1, Math.max(0.15, (86_400_000 - msRemainingInDay) / 86_400_000 + 0.25));
    const sliceRequestCeiling = Math.max(5, Math.ceil(backgroundRpdCap * dayFractionElapsed));

    if (dailyUsage.requestsToday + 1 > sliceRequestCeiling) {
      return { allowed: false, reason: 'exceeds_time_slice_budget_for_background_job' };
    }
  }

  return { allowed: true };
}

/**
 * Returns the ordered list of model keys to try for a given jobType and input size.
 * - Rotates across Groq models (each has its own 1,000 RPD / 8,000 TPM bucket)
 * - Routes long inputs to Gemini Flash Lite (1M context) unless sensitive
 * - Keeps OpenRouter :free strictly as last-resort spare (50 RPD shared limit)
 */
export function getCandidateRouteOrder(jobType: JobType, estimatedInputTokens: number, isSensitive: boolean): string[] {
  const groqModels = [
    'groq:openai/gpt-oss-20b',
    'groq:qwen/qwen3.8-27b',
    'groq:openai/gpt-oss-120b',
  ];
  // Rotate Groq starting cursor so load spreads evenly across all 3 per-model buckets
  const rotatedGroq = [
    groqModels[groqRotationCursor % 3],
    groqModels[(groqRotationCursor + 1) % 3],
    groqModels[(groqRotationCursor + 2) % 3],
  ];

  const openRouterSpare = [
    'openrouter:google/gemma-4-31b-it:free',
    'openrouter:google/gemma-4-26b-a4b-it:free',
  ];

  // 1. Very long inputs (> 2,000 tokens) -> Gemini Flash Lite first (1M context), then Groq (131K)
  if (jobType === 'long_input' || estimatedInputTokens > 2000) {
    const order = [
      ...(isSensitive ? [] : ['gemini:gemini-3.5-flash-lite']),
      ...rotatedGroq,
      'cloudflare:@cf/meta/llama-3.1-8b-instruct-fast',
      ...(isSensitive ? [] : openRouterSpare),
    ];
    return order;
  }

  // 2. Final merge / quality-critical pass -> strongest models first
  if (jobType === 'final_merge') {
    return [
      'groq:openai/gpt-oss-120b',
      'groq:qwen/qwen3.8-27b',
      ...(isSensitive ? [] : ['gemini:gemini-3.5-flash-lite']),
      'groq:openai/gpt-oss-20b',
      'cloudflare:@cf/meta/llama-3.1-8b-instruct-fast',
      ...(isSensitive ? [] : openRouterSpare),
    ];
  }

  // 3. Short/medium inputs, chunk summaries, and headline translations -> fastest/smallest on Groq & Cloudflare first, then Gemini, OpenRouter last
  return [
    ...rotatedGroq,
    'cloudflare:@cf/meta/llama-3.1-8b-instruct-fast',
    ...(isSensitive ? [] : ['gemini:gemini-3.5-flash-lite']),
    ...(isSensitive ? [] : openRouterSpare),
  ];
}

/**
 * Executes a single HTTP call to the selected provider/model and extracts usage + rate-limit headers.
 */
async function invokeSingleModel(
  config: ModelQuotaConfig,
  systemPrompt: string,
  userPrompt: string,
  maxOutputTokens: number,
  timeoutMs: number,
  fetchImpl: typeof fetch
): Promise<{
  ok: boolean;
  status: number;
  text?: string;
  tokensUsed?: number;
  neuronsUsed?: number;
  remainingRequestsHeader?: number;
  remainingTokensHeader?: number;
  resetDurationMs?: number | null;
  errorMessage?: string;
}> {
  if (config.provider === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    const response = await fetchImpl(`${config.endpoint}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        generationConfig: {
          maxOutputTokens,
          temperature: TASK_TEMPERATURE,
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const resetMs = parseResetHeaderMs(response.headers.get('retry-after'));
    if (response.ok) {
      const json = await response.json();
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      const tokensUsed = json.usageMetadata?.totalTokenCount;
      return { ok: true, status: response.status, text, tokensUsed, resetDurationMs: resetMs };
    } else {
      const errJson = await response.json().catch(() => ({}));
      const errMsg = errJson?.error?.message || response.statusText;
      return { ok: false, status: response.status, errorMessage: errMsg, resetDurationMs: resetMs };
    }
  }

  if (config.provider === 'groq') {
    const apiKey = process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY;
    const reasoningEffort = config.model.startsWith('openai/') ? 'low' : 'none';
    const response = await fetchImpl(config.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: maxOutputTokens,
        temperature: TASK_TEMPERATURE,
        reasoning_effort: reasoningEffort,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const remReq = response.headers.get('x-ratelimit-remaining-requests');
    const remTok = response.headers.get('x-ratelimit-remaining-tokens');
    const resetHeader =
      response.headers.get('retry-after') ||
      response.headers.get('x-ratelimit-reset-tokens') ||
      response.headers.get('x-ratelimit-reset-requests');
    const resetMs = parseResetHeaderMs(resetHeader);

    if (response.ok) {
      const json = await response.json();
      const text = json.choices?.[0]?.message?.content?.trim();
      const tokensUsed = json.usage?.total_tokens;
      return {
        ok: true,
        status: response.status,
        text,
        tokensUsed,
        remainingRequestsHeader: remReq !== null ? parseInt(remReq, 10) : undefined,
        remainingTokensHeader: remTok !== null ? parseInt(remTok, 10) : undefined,
        resetDurationMs: resetMs,
      };
    } else {
      const errJson = await response.json().catch(() => ({}));
      const errMsg = errJson?.error?.message || response.statusText;
      return { ok: false, status: response.status, errorMessage: errMsg, resetDurationMs: resetMs };
    }
  }

  if (config.provider === 'cloudflare') {
    const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const cfApiToken = process.env.CLOUDFLARE_API_TOKEN;
    const url = config.endpoint.replace('{account_id}', cfAccountId || '');
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfApiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: maxOutputTokens,
        temperature: TASK_TEMPERATURE,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const resetMs = parseResetHeaderMs(response.headers.get('retry-after'));
    const cfNeuronHeader = response.headers.get('cf-ai-neurons');

    if (response.ok) {
      const json = await response.json();
      const text = (json.choices?.[0]?.message?.content || json.result?.response || '').trim();
      const tokensUsed = json.usage?.total_tokens;
      const neuronsUsed =
        typeof json.usage?.neurons === 'number'
          ? json.usage.neurons
          : cfNeuronHeader
          ? parseFloat(cfNeuronHeader)
          : 1.92;
      return {
        ok: true,
        status: response.status,
        text,
        tokensUsed,
        neuronsUsed,
        resetDurationMs: resetMs,
      };
    } else {
      const errJson = await response.json().catch(() => ({}));
      const errMsg = errJson?.errors?.[0]?.message || response.statusText;
      return { ok: false, status: response.status, errorMessage: errMsg, resetDurationMs: resetMs };
    }
  }

  // OpenRouter (:free last-resort spare)
  const openrouterKey = process.env.OPENROUTER_API_KEY || process.env.NEXT_PUBLIC_OPENROUTER_API_KEY;
  const response = await fetchImpl(config.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openrouterKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://www.panchranga.app',
      'X-Title': 'Panchranga',
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxOutputTokens,
      temperature: TASK_TEMPERATURE,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const resetMs = parseResetHeaderMs(response.headers.get('retry-after'));
  if (response.ok) {
    const json = await response.json();
    // Never fall back to message.reasoning — only accept final message.content
    const text = (json.choices?.[0]?.message?.content || '').trim();
    const tokensUsed = json.usage?.total_tokens;
    return { ok: true, status: response.status, text, tokensUsed, resetDurationMs: resetMs };
  } else {
    const errJson = await response.json().catch(() => ({}));
    const errMsg = errJson?.error?.message || response.statusText;
    return { ok: false, status: response.status, errorMessage: errMsg, resetDurationMs: resetMs };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Main Quota-Aware LLM Router with:
 * - Pre-processing & deduplication
 * - SHA-256 content-hash caching
 * - Per-model quota checks & time-slice scheduling
 * - Retry with Retry-After / exponential backoff + jitter on 429/5xx/timeout (max 2 retries)
 * - Immediate failover (no retry) on 400/401/403/context errors
 * - Circuit breaker cooldowns
 * - Persistent deferred queue when all routes are exhausted
 */
export async function executeRoutedLlmRequest(
  req: LlmRouterRequest,
  validator?: (cleanedText: string) => boolean
): Promise<LlmRouterResponse> {
  const priority: JobPriority = req.priority || 'interactive';
  const isSensitive = Boolean(req.isSensitive);
  const fetchImpl = req.fetchImpl || fetch;
  const timeoutMs = req.timeoutMs || 4200;

  // 1. Pre-process user prompt to strip HTML, boilerplate, and duplicate lines
  const cleanedUserPrompt = preprocessLlmInput(req.userPrompt);
  const estimatedInputTokens = estimateTokens(req.systemPrompt) + estimateTokens(cleanedUserPrompt);
  const maxOutputTokens = req.maxTokensOverride || TASK_MAX_TOKENS[req.jobType] || 85;

  const state = loadQuotaState();
  const cache = loadSummaryCache();

  // 2. Check SHA-256 content-hash cache first
  const cacheKey = computeContentHash(req.jobType, req.systemPrompt, cleanedUserPrompt);
  const cachedEntry = cache.get(cacheKey);
  if (cachedEntry && cachedEntry.expiresAtMs > Date.now()) {
    state.telemetry.cacheHits++;
    saveQuotaState();
    return {
      text: cachedEntry.text,
      status: 'cached',
      provider: cachedEntry.provider,
      model: cachedEntry.model,
      fromCache: true,
      queued: false,
      tokensUsed: 0,
    };
  }
  state.telemetry.cacheMisses++;

  // 3. Select ordered candidate models based on job type, token size, and sensitivity
  const candidates = getCandidateRouteOrder(req.jobType, estimatedInputTokens, isSensitive);
  let routeAttemptedCount = 0;

  for (const modelKey of candidates) {
    const config = VERIFIED_LLM_CONFIG[modelKey];
    if (!config) continue;

    const fit = canModelFitRequest(
      modelKey,
      estimatedInputTokens,
      maxOutputTokens,
      priority,
      isSensitive
    );
    if (!fit.allowed) {
      continue;
    }

    if (routeAttemptedCount > 0) {
      state.telemetry.totalFallbacks++;
      state.buckets[modelKey].fallbackCount++;
    }
    routeAttemptedCount++;

    // Up to 2 retries on retryable errors (429 / 5xx / timeout)
    const maxRetries = 2;
    for (let retry = 0; retry <= maxRetries; retry++) {
      const bucket = state.buckets[modelKey];
      activeProviderCalls[config.provider]++;

      try {
        const res = await invokeSingleModel(
          config,
          req.systemPrompt,
          cleanedUserPrompt,
          maxOutputTokens,
          timeoutMs,
          fetchImpl
        );

        const nowMs = Date.now();
        bucket.lastUpdatedMs = nowMs;

        if (res.ok && res.text) {
          const actualTokens = res.tokensUsed || estimatedInputTokens + estimateTokens(res.text);
          bucket.requestsToday++;
          bucket.requestsThisMinute++;
          bucket.tokensToday += actualTokens;
          bucket.tokensThisMinute += actualTokens;
          if (res.neuronsUsed) {
            bucket.neuronsToday += res.neuronsUsed;
          }

          // Sync live remaining headers from Groq if lower than local estimate
          if (typeof res.remainingRequestsHeader === 'number') {
            const impliedUsed = Math.max(0, config.limits.rpd.operationalCeiling - res.remainingRequestsHeader);
            if (impliedUsed > bucket.requestsToday) {
              bucket.requestsToday = impliedUsed;
            }
          }
          if (typeof res.remainingTokensHeader === 'number') {
            const impliedMinuteUsed = Math.max(0, config.limits.tpm.operationalCeiling - res.remainingTokensHeader);
            if (impliedMinuteUsed > bucket.tokensThisMinute) {
              bucket.tokensThisMinute = impliedMinuteUsed;
            }
          }

          bucket.consecutiveFailures = 0;
          bucket.coolingUntilMs = 0;
          if (config.provider === 'groq') {
            groqRotationCursor = (groqRotationCursor + 1) % 3;
          }

          // Validate output quality if validator provided
          if (validator && !validator(res.text)) {
            break; // Output failed validation, fail over to next model without retrying same model
          }

          // Store in persistent SHA-256 content-hash cache
          cache.set(cacheKey, {
            text: res.text,
            provider: config.provider,
            model: config.model,
            createdAtMs: nowMs,
            expiresAtMs: nowMs + CACHE_TTL_MS,
          });
          saveSummaryCache();
          saveQuotaState();

          return {
            text: res.text,
            status: 'ok',
            provider: config.provider,
            model: config.model,
            fromCache: false,
            queued: false,
            tokensUsed: actualTokens,
          };
        }

        // Handle HTTP error responses
        const status = res.status;
        const errMsg = (res.errorMessage || '').toLowerCase();

        // Non-retryable errors: 400, 401, 403, 404, or context length errors -> never retry, switch model immediately
        if (
          status === 400 ||
          status === 401 ||
          status === 403 ||
          status === 404 ||
          errMsg.includes('context') ||
          errMsg.includes('too long')
        ) {
          bucket.consecutiveFailures++;
          if (status === 401 || status === 403 || status === 404) {
            bucket.coolingUntilMs = nowMs + 10 * 60_000;
          }
          break;
        }

        // 429 Rate Limit or 5xx Server Error
        if (status === 429) {
          bucket.rateLimit429Count++;
          state.telemetry.total429s++;
        }
        bucket.consecutiveFailures++;

        const isDailyExhausted =
          errMsg.includes('per day') ||
          errMsg.includes('tpd') ||
          errMsg.includes('rpd') ||
          errMsg.includes('daily') ||
          errMsg.includes('neurons');

        if (isDailyExhausted) {
          // Trip circuit breaker until daily reset
          bucket.coolingUntilMs = bucket.dailyResetAtMs;
          break;
        }

        if (bucket.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
          const cooldownMs = res.resetDurationMs || 60_000;
          bucket.coolingUntilMs = nowMs + Math.min(cooldownMs, 15 * 60_000);
          break;
        }

        if (retry < maxRetries) {
          const jitter = Math.floor(Math.random() * 120);
          const backoffMs = res.resetDurationMs
            ? Math.min(res.resetDurationMs, 1500)
            : Math.min(250 * Math.pow(2, retry) + jitter, 1500);
          await sleep(backoffMs);
        }
      } catch (err: any) {
        // Network error or timeout
        bucket.consecutiveFailures++;
        if (bucket.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
          bucket.coolingUntilMs = Date.now() + 60_000;
          break;
        }
        if (retry < maxRetries) {
          const jitter = Math.floor(Math.random() * 100);
          await sleep(200 * Math.pow(2, retry) + jitter);
        }
      } finally {
        activeProviderCalls[config.provider] = Math.max(0, activeProviderCalls[config.provider] - 1);
      }
    }
  }

  // 4. Every route exhausted: enqueue job in persistent deferred queue so it drains as quotas reset
  const queue = loadDeferredQueue();
  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (queue.length < 200) {
    queue.push({
      id: jobId,
      hubId: req.hubId,
      jobType: req.jobType,
      systemPrompt: req.systemPrompt,
      userPrompt: cleanedUserPrompt,
      isSensitive,
      enqueuedAtMs: Date.now(),
      attempts: 1,
    });
    state.telemetry.queuedJobsCount = queue.length;
    saveDeferredQueue();
  }
  saveQuotaState();

  return {
    text: null,
    status: 'queued_try_later',
    fromCache: false,
    queued: true,
    jobId,
  };
}

/**
 * Map-Reduce Chunking for long documents (> 1,200 tokens):
 * 1. Splits text into chunks (~450 tokens each, 1-sentence overlap)
 * 2. Summarizes each chunk using a fast small model (`chunk_summary`, max_tokens: 55)
 * 3. Merges chunk summaries once (`final_merge`, max_tokens: 85)
 */
export async function executeMapReduceSummary(
  longText: string,
  systemPrompt: string,
  options: {
    priority?: JobPriority;
    isSensitive?: boolean;
    hubId?: string;
    fetchImpl?: typeof fetch;
    validator?: (text: string) => boolean;
  } = {}
): Promise<LlmRouterResponse> {
  const cleaned = preprocessLlmInput(longText);
  const sentences = cleaned.split(/(?<=[.?!])\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current: string[] = [];
  let currentTokens = 0;

  for (const sentence of sentences) {
    const sTokens = estimateTokens(sentence);
    if (currentTokens + sTokens > 420 && current.length > 0) {
      chunks.push(current.join(' '));
      // Keep 1 overlapping sentence for context continuity
      const overlap = current[current.length - 1];
      current = overlap ? [overlap, sentence] : [sentence];
      currentTokens = estimateTokens(current.join(' '));
    } else {
      current.push(sentence);
      currentTokens += sTokens;
    }
  }
  if (current.length > 0) {
    chunks.push(current.join(' '));
  }

  // Cap at max 4 chunks to bound token spend
  const boundedChunks = chunks.slice(0, 4);
  const chunkSummaries: string[] = [];

  for (const chunk of boundedChunks) {
    const chunkRes = await executeRoutedLlmRequest({
      jobType: 'chunk_summary',
      priority: options.priority,
      systemPrompt: 'Summarize the key factual event, numbers, and location in 1 short sentence (max 22 words). Plain English only.',
      userPrompt: chunk,
      isSensitive: options.isSensitive,
      fetchImpl: options.fetchImpl,
    });
    if (chunkRes.text) {
      chunkSummaries.push(`- ${chunkRes.text}`);
    }
  }

  if (chunkSummaries.length === 0) {
    return {
      text: null,
      status: 'queued_try_later',
      fromCache: false,
      queued: true,
    };
  }

  return executeRoutedLlmRequest(
    {
      jobType: 'final_merge',
      priority: options.priority,
      systemPrompt,
      userPrompt: `Combine these points into a 1-2 sentence neutral briefing (max 35 words):\n${chunkSummaries.join('\n')}`,
      isSensitive: options.isSensitive,
      hubId: options.hubId,
      fetchImpl: options.fetchImpl,
    },
    options.validator
  );
}

/**
 * Drains queued jobs that were deferred during quota exhaustion once quotas reset.
 */
export async function drainDeferredQueue(maxJobs = 5, fetchImpl?: typeof fetch): Promise<number> {
  const queue = loadDeferredQueue();
  if (queue.length === 0) return 0;

  let drained = 0;
  const remaining: DeferredJob[] = [];

  for (const job of queue) {
    if (drained >= maxJobs) {
      remaining.push(job);
      continue;
    }
    const res = await executeRoutedLlmRequest({
      jobType: job.jobType,
      priority: 'background',
      systemPrompt: job.systemPrompt,
      userPrompt: job.userPrompt,
      isSensitive: job.isSensitive,
      hubId: job.hubId,
      fetchImpl,
    });
    if (res.text && !res.queued) {
      drained++;
    } else {
      job.attempts++;
      if (job.attempts < 5) {
        remaining.push(job);
      }
    }
  }

  deferredQueue = remaining;
  const state = loadQuotaState();
  state.telemetry.queuedJobsCount = remaining.length;
  saveDeferredQueue();
  saveQuotaState();
  return drained;
}

/**
 * Returns structured quota dashboard data and human-readable log summary.
 */
export function getQuotaDashboardSummary(nowMs = Date.now()) {
  const state = loadQuotaState(nowMs);
  const queue = loadDeferredQueue();
  const totalLookups = state.telemetry.cacheHits + state.telemetry.cacheMisses;
  const cacheHitRate = totalLookups > 0
    ? `${((state.telemetry.cacheHits / totalLookups) * 100).toFixed(1)}%`
    : '0.0%';

  const models = Object.entries(VERIFIED_LLM_CONFIG).map(([key, cfg]) => {
    const b = state.buckets[key];
    const eff = getEffectiveDailyUsage(state, cfg, b);
    const rpdCap = cfg.limits.rpd.operationalCeiling;
    const tpdCap = cfg.limits.tpd.operationalCeiling;
    const neuronCap = cfg.limits.dailyNeurons?.operationalCeiling;

    return {
      key,
      provider: cfg.provider,
      model: cfg.model,
      requestsUsed: eff.requestsToday,
      requestsRemaining: Math.max(0, rpdCap - eff.requestsToday),
      rpdLimit: rpdCap,
      tokensUsed: eff.tokensToday,
      tokensRemaining: Math.max(0, tpdCap - eff.tokensToday),
      tpdLimit: tpdCap,
      neuronsUsed: neuronCap ? Number(eff.neuronsToday.toFixed(1)) : undefined,
      neuronsRemaining: neuronCap ? Number(Math.max(0, neuronCap - eff.neuronsToday).toFixed(1)) : undefined,
      cooling: b.coolingUntilMs > nowMs,
      coolingUntil: b.coolingUntilMs > nowMs ? new Date(b.coolingUntilMs).toISOString() : null,
      rateLimit429s: b.rateLimit429Count,
      resetAt: new Date(b.dailyResetAtMs).toISOString(),
    };
  });

  return {
    cacheHitRate,
    cacheHits: state.telemetry.cacheHits,
    cacheMisses: state.telemetry.cacheMisses,
    trivialBypasses: state.telemetry.trivialBypasses,
    totalFallbacks: state.telemetry.totalFallbacks,
    total429s: state.telemetry.total429s,
    queuedJobs: queue.length,
    models,
  };
}

export function formatQuotaDashboardLog(): string {
  const dash = getQuotaDashboardSummary();
  const lines = [
    `📊 [LLM Quota Dashboard] Cache Hit Rate: ${dash.cacheHitRate} (${dash.cacheHits} hits / ${dash.cacheMisses} misses) | Trivial Bypasses: ${dash.trivialBypasses} | Fallbacks: ${dash.totalFallbacks} | 429s: ${dash.total429s} | Queued: ${dash.queuedJobs}`,
  ];
  for (const m of dash.models) {
    const neuronInfo = m.neuronsRemaining !== undefined ? ` | Neurons: ${m.neuronsUsed}/${m.neuronsUsed! + m.neuronsRemaining!}` : '';
    const status = m.cooling ? `COOLING until ${m.coolingUntil}` : 'HEALTHY';
    lines.push(
      `   ├─ [${m.provider.toUpperCase()}] ${m.model}: Req ${m.requestsUsed}/${m.rpdLimit} (rem ${m.requestsRemaining}) | Tok ${m.tokensUsed}/${m.tpdLimit}${neuronInfo} | 429s: ${m.rateLimit429s} | ${status}`
    );
  }
  return lines.join('\n');
}
