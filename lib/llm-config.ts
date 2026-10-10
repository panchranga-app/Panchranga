/**
 * Verified Free-Tier LLM Provider & Model Limits Configuration
 *
 * Rules:
 * - Published docs are treated as a ceiling only; real limits confirmed via live API
 *   response headers (`x-ratelimit-*`, `cf-ai-neurons`), `/api/v1/key`, and `/v1beta/models`.
 * - Any metric not directly returned by live response headers or account inspection endpoints
 *   is explicitly marked as 'UNVERIFIED' in `verifiedMetrics` while providing a conservative
 *   operational cap (`operationalLimits`) so the quota tracker never overruns free tiers.
 */

export type ProviderId = 'gemini' | 'groq' | 'cloudflare' | 'openrouter';

export type QuotaScope = 'per_model' | 'per_project' | 'per_account';

export type ResetScheduleType = 'fixed_utc' | 'fixed_pacific' | 'rolling_24h';

export type JobType =
  | 'short_medium'
  | 'chunk_summary'
  | 'final_merge'
  | 'long_input'
  | 'headline_translation';

export type JobPriority = 'interactive' | 'background';

export interface VerifiedMetric<T> {
  value: T | 'UNVERIFIED';
  /** Conservative operational ceiling enforced by the router when value is UNVERIFIED or as hard cap */
  operationalCeiling: T;
  source: string;
}

export interface ModelQuotaConfig {
  provider: ProviderId;
  model: string;
  /** Whether model ID was verified active via live API call */
  modelVerifiedActive: boolean;
  last_verified: string;
  endpoint: string;
  quotaScope: QuotaScope;
  resetSchedule: {
    minuteWindow: 'rolling_60s';
    dailyWindow: ResetScheduleType;
    dailyResetUtcHour: number | 'UNVERIFIED';
    notes: string;
  };
  limits: {
    rpm: VerifiedMetric<number>;
    rpd: VerifiedMetric<number>;
    tpm: VerifiedMetric<number>;
    tpd: VerifiedMetric<number>;
    dailyNeurons?: VerifiedMetric<number>;
    contextWindow: VerifiedMetric<number>;
    maxOutputTokens: VerifiedMetric<number>;
  };
  terms: {
    freeTierTrainsOnData: boolean | 'UNVERIFIED';
    allowSensitiveContent: boolean;
    regionalRestrictions: string;
    endUserServingAllowed: boolean;
    notes: string;
  };
}

export const PROMPT_VERSION = 'v2.2-compact';

/**
 * Fraction of each provider/model's daily quota reserved exclusively for interactive user requests.
 * Background/bulk jobs are deferred once usage reaches (1 - EMERGENCY_BUFFER_RATIO) = 88%.
 */
export const EMERGENCY_BUFFER_RATIO = 0.12;

/**
 * Task-specific max output tokens based on real output sizes (not model maximums).
 */
export const TASK_MAX_TOKENS: Record<JobType, number> = {
  chunk_summary: 70,        // 1 short sentence per chunk (~25 words)
  short_medium: 110,        // 1-2 sentence neutral briefing (<= 35 words)
  final_merge: 110,         // 1-2 sentence merged neutral briefing (<= 35 words)
  long_input: 110,          // 1-2 sentence briefing from long article
  headline_translation: 65, // <= 15-word English headline gloss
};

export const TASK_TEMPERATURE = 0.15;

export const VERIFIED_LLM_CONFIG: Record<string, ModelQuotaConfig> = {
  'groq:openai/gpt-oss-20b': {
    provider: 'groq',
    model: 'openai/gpt-oss-20b',
    modelVerifiedActive: true,
    last_verified: '2026-10-11',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    quotaScope: 'per_model', // Enforced per organization, with separate bucket per model ID
    resetSchedule: {
      minuteWindow: 'rolling_60s',
      dailyWindow: 'rolling_24h',
      dailyResetUtcHour: 0,
      notes: 'Confirmed via live x-ratelimit-reset-requests (2m52.8s per request = 86.4s/req rolling 24h window) and x-ratelimit-reset-tokens headers.',
    },
    limits: {
      rpm: {
        value: 'UNVERIFIED',
        operationalCeiling: 30,
        source: 'Published Groq Free Tier ceiling (30 RPM); 200 OK header x-ratelimit-limit-requests reports RPD (1000).',
      },
      rpd: {
        value: 1000,
        operationalCeiling: 1000,
        source: 'Verified live via x-ratelimit-limit-requests: 1000 header.',
      },
      tpm: {
        value: 8000,
        operationalCeiling: 8000,
        source: 'Verified live via x-ratelimit-limit-tokens: 8000 header.',
      },
      tpd: {
        value: 'UNVERIFIED',
        operationalCeiling: 200000,
        source: 'Published Groq Free Tier ceiling (200,000 TPD); enforced via 429 payload on exhaustion.',
      },
      contextWindow: {
        value: 131072,
        operationalCeiling: 131072,
        source: 'Verified live via GET https://api.groq.com/openai/v1/models.',
      },
      maxOutputTokens: {
        value: 65536,
        operationalCeiling: 65536,
        source: 'Verified live via GET https://api.groq.com/openai/v1/models.',
      },
    },
    terms: {
      freeTierTrainsOnData: false,
      allowSensitiveContent: true,
      regionalRestrictions: 'Global (subject to US export controls)',
      endUserServingAllowed: true,
      notes: 'Groq Services Agreement permits application serving within rate limits; organization-wide quota.',
    },
  },

  'groq:qwen/qwen3.8-27b': {
    provider: 'groq',
    model: 'qwen/qwen3.8-27b',
    modelVerifiedActive: true,
    last_verified: '2026-10-11',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    quotaScope: 'per_model',
    resetSchedule: {
      minuteWindow: 'rolling_60s',
      dailyWindow: 'rolling_24h',
      dailyResetUtcHour: 0,
      notes: 'Confirmed via live x-ratelimit-reset-requests and x-ratelimit-reset-tokens headers.',
    },
    limits: {
      rpm: {
        value: 'UNVERIFIED',
        operationalCeiling: 30,
        source: 'Published Groq Free Tier ceiling (30 RPM).',
      },
      rpd: {
        value: 1000,
        operationalCeiling: 1000,
        source: 'Verified live via x-ratelimit-limit-requests: 1000 header.',
      },
      tpm: {
        value: 8000,
        operationalCeiling: 8000,
        source: 'Verified live via x-ratelimit-limit-tokens: 8000 header.',
      },
      tpd: {
        value: 'UNVERIFIED',
        operationalCeiling: 200000,
        source: 'Published Groq Free Tier ceiling; enforced via 429 error payload.',
      },
      contextWindow: {
        value: 131072,
        operationalCeiling: 131072,
        source: 'Verified live via GET https://api.groq.com/openai/v1/models.',
      },
      maxOutputTokens: {
        value: 16384,
        operationalCeiling: 16384,
        source: 'Verified live via GET https://api.groq.com/openai/v1/models.',
      },
    },
    terms: {
      freeTierTrainsOnData: false,
      allowSensitiveContent: true,
      regionalRestrictions: 'Global (subject to US export controls)',
      endUserServingAllowed: true,
      notes: 'Independent model bucket on Groq Free Tier.',
    },
  },

  'groq:openai/gpt-oss-120b': {
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    modelVerifiedActive: true,
    last_verified: '2026-10-11',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    quotaScope: 'per_model',
    resetSchedule: {
      minuteWindow: 'rolling_60s',
      dailyWindow: 'rolling_24h',
      dailyResetUtcHour: 0,
      notes: 'Confirmed via live x-ratelimit-reset-requests and x-ratelimit-reset-tokens headers.',
    },
    limits: {
      rpm: {
        value: 'UNVERIFIED',
        operationalCeiling: 30,
        source: 'Published Groq Free Tier ceiling (30 RPM).',
      },
      rpd: {
        value: 1000,
        operationalCeiling: 1000,
        source: 'Verified live via x-ratelimit-limit-requests: 1000 header.',
      },
      tpm: {
        value: 8000,
        operationalCeiling: 8000,
        source: 'Verified live via x-ratelimit-limit-tokens: 8000 header.',
      },
      tpd: {
        value: 'UNVERIFIED',
        operationalCeiling: 200000,
        source: 'Published Groq Free Tier ceiling (200,000 TPD).',
      },
      contextWindow: {
        value: 131072,
        operationalCeiling: 131072,
        source: 'Verified live via GET https://api.groq.com/openai/v1/models.',
      },
      maxOutputTokens: {
        value: 65536,
        operationalCeiling: 65536,
        source: 'Verified live via GET https://api.groq.com/openai/v1/models.',
      },
    },
    terms: {
      freeTierTrainsOnData: false,
      allowSensitiveContent: true,
      regionalRestrictions: 'Global (subject to US export controls)',
      endUserServingAllowed: true,
      notes: 'Strongest 120B model in Groq free pool; prioritized for final_merge and quality-critical summaries.',
    },
  },

  'cloudflare:@cf/meta/llama-3.1-8b-instruct-fast': {
    provider: 'cloudflare',
    model: '@cf/meta/llama-3.1-8b-instruct-fast',
    modelVerifiedActive: true,
    last_verified: '2026-10-11',
    endpoint: 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/chat/completions',
    quotaScope: 'per_account',
    resetSchedule: {
      minuteWindow: 'rolling_60s',
      dailyWindow: 'fixed_utc',
      dailyResetUtcHour: 0,
      notes: 'Official Cloudflare Workers AI docs: 10,000 free neurons/day resets strictly at 00:00 UTC.',
    },
    limits: {
      rpm: {
        value: 'UNVERIFIED',
        operationalCeiling: 20,
        source: 'Published Cloudflare docs for llama-3.1-8b-instruct-fast (20 RPM); not emitted in 200 OK headers.',
      },
      rpd: {
        value: 'UNVERIFIED',
        operationalCeiling: 4800,
        source: 'Derived from 10,000 daily neurons / ~1.92 neurons per summary observed in livecf-ai-neurons header.',
      },
      tpm: {
        value: 'UNVERIFIED',
        operationalCeiling: 40000,
        source: 'Not emitted in 200 OK headers; bounded by 20 RPM and neuron allocation.',
      },
      tpd: {
        value: 'UNVERIFIED',
        operationalCeiling: 750000,
        source: 'Bounded by 10,000 free neurons/day (~1.92 neurons per 160 tokens observed live).',
      },
      dailyNeurons: {
        value: 10000,
        operationalCeiling: 10000,
        source: 'Official Cloudflare Workers AI Free Tier limit; neuron usage per call verified live via cf-ai-neurons header and usage.neurons.',
      },
      contextWindow: {
        value: 128000,
        operationalCeiling: 32768,
        source: 'Cloudflare Workers AI model catalog.',
      },
      maxOutputTokens: {
        value: 4096,
        operationalCeiling: 2048,
        source: 'Cloudflare Workers AI model catalog.',
      },
    },
    terms: {
      freeTierTrainsOnData: false,
      allowSensitiveContent: true,
      regionalRestrictions: 'Global',
      endUserServingAllowed: true,
      notes: 'Cloudflare Workers AI does not train models on customer inputs/outputs.',
    },
  },

  'gemini:gemini-3.5-flash-lite': {
    provider: 'gemini',
    model: 'gemini-3.5-flash-lite',
    modelVerifiedActive: true,
    last_verified: '2026-10-11',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
    quotaScope: 'per_project',
    resetSchedule: {
      minuteWindow: 'rolling_60s',
      dailyWindow: 'fixed_pacific',
      dailyResetUtcHour: 7, // Midnight Pacific Time (07:00 UTC PDT / 08:00 UTC PST)
      notes: 'Official Google AI Studio docs: RPM/TPM use rolling 60s window; RPD resets at midnight Pacific Time.',
    },
    limits: {
      rpm: {
        value: 'UNVERIFIED',
        operationalCeiling: 15,
        source: 'Google AI Studio Free Tier project-specific limit; not returned in 200 OK headers.',
      },
      rpd: {
        value: 'UNVERIFIED',
        operationalCeiling: 1000,
        source: 'Google AI Studio Free Tier project-specific limit; not returned in 200 OK headers.',
      },
      tpm: {
        value: 'UNVERIFIED',
        operationalCeiling: 250000,
        source: 'Google AI Studio Free Tier project-specific limit; not returned in 200 OK headers.',
      },
      tpd: {
        value: 'UNVERIFIED',
        operationalCeiling: 1500000,
        source: 'Derived from RPD and TPM project ceilings.',
      },
      contextWindow: {
        value: 1048576,
        operationalCeiling: 1048576,
        source: 'Verified live via GET /v1beta/models/gemini-3.5-flash-lite (inputTokenLimit: 1048576).',
      },
      maxOutputTokens: {
        value: 65536,
        operationalCeiling: 65536,
        source: 'Verified live via GET /v1beta/models/gemini-3.5-flash-lite (outputTokenLimit: 65536).',
      },
    },
    terms: {
      freeTierTrainsOnData: true,
      allowSensitiveContent: false, // Avoid routing sensitive user/article data to Gemini Free Tier
      regionalRestrictions: 'Free tier restricted in EEA/UK/Switzerland; available in India/US.',
      endUserServingAllowed: true,
      notes: 'Google Gemini API Additional Terms: Unpaid (Free) tier prompts/responses may be used by Google for product improvement and human review. Do not route sensitive content here.',
    },
  },

  'openrouter:google/gemma-4-31b-it:free': {
    provider: 'openrouter',
    model: 'google/gemma-4-31b-it:free',
    modelVerifiedActive: true,
    last_verified: '2026-10-11',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    quotaScope: 'per_account', // Shared 50 RPD pool across all :free models on unpaid accounts
    resetSchedule: {
      minuteWindow: 'rolling_60s',
      dailyWindow: 'fixed_utc',
      dailyResetUtcHour: 0,
      notes: 'Verified via OpenRouter docs and GET https://openrouter.ai/api/v1/key (resets at 00:00 UTC).',
    },
    limits: {
      rpm: {
        value: 'UNVERIFIED',
        operationalCeiling: 20,
        source: 'Published OpenRouter :free tier limit (20 RPM).',
      },
      rpd: {
        value: 50,
        operationalCeiling: 50,
        source: 'Verified live via GET https://openrouter.ai/api/v1/key -> free_model_daily_requests: { limit: 50 }.',
      },
      tpm: {
        value: 'UNVERIFIED',
        operationalCeiling: 40000,
        source: 'Upstream provider dependent; not emitted in 200 OK headers.',
      },
      tpd: {
        value: 'UNVERIFIED',
        operationalCeiling: 100000,
        source: 'Bounded by 50 RPD shared across all :free models.',
      },
      contextWindow: {
        value: 262144,
        operationalCeiling: 262144,
        source: 'Verified live via GET https://openrouter.ai/api/v1/models (context_length: 262144).',
      },
      maxOutputTokens: {
        value: 32768,
        operationalCeiling: 32768,
        source: 'Verified live via GET https://openrouter.ai/api/v1/models (max_completion_tokens: 32768).',
      },
    },
    terms: {
      freeTierTrainsOnData: true,
      allowSensitiveContent: false,
      regionalRestrictions: 'Global (`allowed_data_regions: ["global"]` verified via /api/v1/key)',
      endUserServingAllowed: true,
      notes: 'Last-resort spare only due to strict 50 RPD cap across the account. Free providers on OpenRouter may log/train on prompts.',
    },
  },

  'openrouter:google/gemma-4-26b-a4b-it:free': {
    provider: 'openrouter',
    model: 'google/gemma-4-26b-a4b-it:free',
    modelVerifiedActive: true,
    last_verified: '2026-10-11',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    quotaScope: 'per_account',
    resetSchedule: {
      minuteWindow: 'rolling_60s',
      dailyWindow: 'fixed_utc',
      dailyResetUtcHour: 0,
      notes: 'Shares the same 50 RPD account-wide :free pool on OpenRouter (00:00 UTC reset).',
    },
    limits: {
      rpm: {
        value: 'UNVERIFIED',
        operationalCeiling: 20,
        source: 'Published OpenRouter :free tier limit (20 RPM).',
      },
      rpd: {
        value: 50,
        operationalCeiling: 50,
        source: 'Verified live via GET https://openrouter.ai/api/v1/key (shared 50 RPD pool).',
      },
      tpm: {
        value: 'UNVERIFIED',
        operationalCeiling: 40000,
        source: 'Upstream provider dependent.',
      },
      tpd: {
        value: 'UNVERIFIED',
        operationalCeiling: 100000,
        source: 'Bounded by 50 RPD shared pool.',
      },
      contextWindow: {
        value: 262144,
        operationalCeiling: 262144,
        source: 'Verified live via GET https://openrouter.ai/api/v1/models.',
      },
      maxOutputTokens: {
        value: 32768,
        operationalCeiling: 32768,
        source: 'Verified live via GET https://openrouter.ai/api/v1/models.',
      },
    },
    terms: {
      freeTierTrainsOnData: true,
      allowSensitiveContent: false,
      regionalRestrictions: 'Global',
      endUserServingAllowed: true,
      notes: 'Shares 50 RPD account-level :free quota on OpenRouter; used only as secondary OpenRouter fallback.',
    },
  },
};
