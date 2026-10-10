# Panchranga (पंचरंग)

> **Every Color of the Story** — Automated Multi-Perspective Indian News Aggregator

Panchranga is an open-source, independent news intelligence platform for Indian news. We bring together coverage from mainstream national media, grassroots independent reporters, and public discourse — side by side on one screen.

The name Panchranga means "many colors" — because every news story has more than one color to it. We believe you deserve to see them all.

No editors. No paywalls. No bias labels. Just every color of the story.

---

## 🌟 The Three-Lane Structure

1. **Mainstream**: National English & Hindi daily newspapers and official press releases (e.g., Indian Express, Times of India, NDTV, PIB). Provides institutional and official framing.
2. **Grassroots**: Independent outlets, investigative journalists, and ground reporters (e.g., The Wire, Scroll.in, The News Minute, PARI). Offers field reporting and regional depth.
3. **Public Discourse**: Public discussions, online community threads, and citizen reactions from active subreddits (e.g., r/india, r/IndiaSpeaks, r/indiatech).

---

## 🛠️ Tech Stack

- **Framework**: Next.js 14 (App Router), React 18, TypeScript
- **Styling**: Tailwind CSS
- **Database & Vectors**: Supabase Postgres with `pgvector`
- **Embeddings**: Open-source vector embeddings (MiniLM-L6-v2, 384 dimensions)
- **Pipeline**: GitHub Actions scheduled ingestion cron

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm

### Installation

```bash
# Clone the repository
git clone https://github.com/Ravivishwakarma1/Panchranga.git
cd Panchranga

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

---

## 📬 Newsletter Architecture & Email Providers

Panchranga delivers a daily 7:00 AM IST newsletter featuring the top 3 synthesized stories across mainstream, grassroots, and public discourse.

Because serverless execution environments (like Vercel) have tight timeouts, automated bulk sending runs via **GitHub Actions** (`.github/workflows/newsletter.yml`) and `scripts/send-newsletter.ts`. The API endpoint `/api/newsletter/send` remains available for manual or webhook triggers.

### Multi-Provider Architecture

The system features an automated waterfall provider dispatcher:

1. **Gmail SMTP (`GmailSmtpProvider`)**:
   - Primary provider for sending without needing a custom domain.
   - Uses `nodemailer` over port 465 (SSL) with connection pooling (`pool: true`, concurrency 3, ~300ms pacing).
   - Authenticates via Gmail App Password (`GMAIL_APP_PASSWORD`) with dedicated account (`GMAIL_USER`).
   - Strictly sends one message per recipient (no mass To/CC/BCC).
2. **Brevo API (`BrevoProvider`)**:
   - Secondary transactional email provider via HTTP API (`https://api.brevo.com/v3/smtp/email`).
   - Enabled only when `BREVO_ENABLED=true` and `BREVO_API_KEY` is configured.
3. **Resend API (`ResendProvider`)**:
   - Fallback provider via Resend SDK (`RESEND_API_KEY`).

### Daily Quotas & IST Day Tracking

Provider order and daily budgets are fully configurable:
- `EMAIL_PROVIDER_ORDER`: Default `"gmail,brevo,resend"`.
- `GMAIL_DAILY_LIMIT`: Default `100` (ramp up toward 450).
- `BREVO_DAILY_LIMIT`: Default `290`.
- `RESEND_DAILY_LIMIT`: Default `95`.

Daily send counts are tracked relative to the Indian Standard Time (IST) calendar day in the `newsletter_sends` table. Each run fills providers up to their remaining daily budget.

### Ramping `GMAIL_DAILY_LIMIT`

For a new Gmail account, Google applies conservative algorithmic sending limits. Ramp up gradually to protect account reputation:

| Phase | Days Active | `GMAIL_DAILY_LIMIT` | Notes |
|-------|-------------|---------------------|-------|
| Warmup | Days 1–7 | `100` (default) | Send to engaged users; keep bounce rate < 1%. |
| Steady Growth | Days 8–14 | `200` | Verify low spam reports. |
| Expansion | Days 15–21 | `350` | Scale up if deliverability is solid. |
| Production Ceiling | Day 22+ | `450` | Maximum recommended (free Gmail hard cap is 500/day; 450 leaves buffer for welcome emails). |

### Deferred Subscribers & Prioritization

If subscriber count exceeds the combined available daily budget across all active providers:
- Leftover subscribers are deferred (`deferred_count` tracked in database).
- On the next day's run, subscribers are fetched using `ORDER BY last_sent_at ASC NULLS FIRST`, ensuring deferred subscribers are always served first.

### Quota Fallthrough & Hard Bounce Handling

- **Daily Quota Errors** (e.g. Gmail `550 5.4.5` or `454 4.7.0`): The dispatcher immediately marks that provider exhausted for the current run and falls through to the next configured provider in the order.
- **Temporary Errors** (SMTP 4xx, network drop): Automatically retried up to 3 times with exponential backoff (1s, 2s, 4s).
- **Permanent Errors / Hard Bounces** (SMTP 5xx user unknown, invalid recipient): Subscriber is immediately marked inactive (`is_active = false`) in Supabase so no future sends are attempted.

### Testing & Simulation Modes

- **Dry Run**: Set `DRY_RUN=true` (or trigger the workflow with dry_run input) to preview planned subscriber split across providers without sending any emails.
- **Test Recipients**: Set `TEST_RECIPIENTS=me@domain.com,test@domain.com` to send exclusively to those addresses without touching the subscriber table or writing to the send log.

---

## 🤖 LLM Quota-Aware Router & Free-Tier Budget Management

Panchranga's AI summarizer (`lib/summarizer.ts`) and Indic headline translator (`lib/translator.ts`) route all requests through a centralized, quota-aware router (`lib/llm-router.ts`) backed by verified free-tier limits (`lib/llm-config.ts`).

### 1. Routing Order by Job Type
- **Short/Medium Briefings (`short_medium`), Chunk Summaries (`chunk_summary`), & Translations (`headline_translation`)**:
  1. **Groq Per-Model Pool (Round-Robin)**: Rotates across `openai/gpt-oss-20b` (`reasoning_effort: 'low'`) → `qwen/qwen3.8-27b` (`reasoning_effort: 'none'`) → `openai/gpt-oss-120b` (`reasoning_effort: 'low'`). Each model has its own independent `1,000 RPD` / `8,000 TPM` bucket (`3,000 RPD` combined).
  2. **Cloudflare Workers AI**: `@cf/meta/llama-3.1-8b-instruct-fast` (`10,000 free neurons/day` ≈ `4,800 summaries/day`).
  3. **Google Gemini API**: `gemini-3.5-flash-lite` (`0` thinking tokens, `1M` context window). *Skipped if content is flagged sensitive due to Google's unpaid tier data-training terms.*
  4. **OpenRouter (`:free` Last-Resort Spare)**: `google/gemma-4-31b-it:free` → `google/gemma-4-26b-a4b-it:free` (strictly last resort due to the shared `50 RPD` unpaid account cap).
- **Long Inputs (`long_input` > 2,000 tokens)**:
  - Routes to `gemini:gemini-3.5-flash-lite` first (1,048,576 token context window), followed by Groq (`131,072` context window) and Cloudflare. Documents exceeding `850` tokens automatically use **Map-Reduce Chunking** (`chunk_summary` at `max_tokens: 70` → single `final_merge` at `max_tokens: 110`).
- **Final Merge / Quality-Critical Pass (`final_merge`)**:
  - Routes to the strongest available model with headroom (`groq:openai/gpt-oss-120b` → `groq:qwen/qwen3.8-27b` → `gemini:gemini-3.5-flash-lite` → `cloudflare:@cf/meta/llama-3.1-8b-instruct-fast`).

### 2. How Quotas Are Tracked & Reset
- **Persistent State**: Counters (`requestsToday`, `tokensToday`, `neuronsToday`, rolling 60s `requestsThisMinute`/`tokensThisMinute`, circuit-breaker `coolingUntilMs`, and `dailyResetAtMs`) are persisted in `data/llm-quota-state.json`.
- **Content-Hash Cache**: Responses are cached by `SHA-256(PROMPT_VERSION | jobType | systemPrompt | normalizedInput)` in `data/llm-summary-cache.json` (24h TTL) so identical content is never summarized twice.
- **Real Reset Schedules**:
  - **Groq**: Rolling 24h window synced dynamically with live `x-ratelimit-remaining-requests` and `x-ratelimit-remaining-tokens` headers.
  - **Cloudflare Workers AI & OpenRouter**: Fixed reset at `00:00 UTC`.
  - **Google Gemini API**: Fixed daily RPD reset at midnight Pacific Time (`07:00 UTC` PDT / `08:00 UTC` PST).
- **All-Day Pacing & Emergency Buffer**: `12%` (`EMERGENCY_BUFFER_RATIO = 0.12`) of each model's daily quota is reserved exclusively for interactive user requests (`priority: 'interactive'`). Background batch jobs (`priority: 'background'`) are paced across 24 hourly time slices and deferred to `data/llm-deferred-queue.json` if a slice or buffer threshold is reached.

### 3. How to Update Limits
Edit `VERIFIED_LLM_CONFIG` in [`lib/llm-config.ts`](lib/llm-config.ts):
1. Update the model's `limits` (`rpm`, `rpd`, `tpm`, `tpd`, `dailyNeurons`, `contextWindow`, `maxOutputTokens`).
2. Set `value` to the exact number if confirmed via live response headers or account endpoint, or `'UNVERIFIED'` with a safe `operationalCeiling`.
3. Update `last_verified` (`YYYY-MM-DD`) and `source`.

### 4. How to Read the Quota Log
At the end of `npm run summarize` (or by calling `formatQuotaDashboardLog()` from `lib/llm-router.ts`), the router prints:
```text
📊 [LLM Quota Dashboard] Cache Hit Rate: 33.3% (4 hits / 8 misses) | Trivial Bypasses: 12 | Fallbacks: 1 | 429s: 0 | Queued: 0
   ├─ [GROQ] openai/gpt-oss-20b: Req 3/1000 (rem 997) | Tok 410/200000 | 429s: 0 | HEALTHY
   ├─ [GROQ] qwen/qwen3.8-27b: Req 3/1000 (rem 997) | Tok 295/200000 | 429s: 0 | HEALTHY
   ├─ [GROQ] openai/gpt-oss-120b: Req 2/1000 (rem 998) | Tok 260/200000 | 429s: 0 | HEALTHY
   ├─ [CLOUDFLARE] @cf/meta/llama-3.1-8b-instruct-fast: Req 1/4800 (rem 4799) | Tok 142/750000 | Neurons: 1.9/10000 | 429s: 0 | HEALTHY
   ├─ [GEMINI] gemini-3.5-flash-lite: Req 1/1000 (rem 999) | Tok 88/1500000 | 429s: 0 | HEALTHY
   ├─ [OPENROUTER] google/gemma-4-31b-it:free: Req 0/50 (rem 50) | Tok 0/100000 | 429s: 0 | HEALTHY
```
- **`HEALTHY` vs `COOLING until <ISO>`**: Shows whether the circuit breaker is open (`HEALTHY`) or tripped due to consecutive errors / 429 cooldown (`COOLING`).
- **`Queued`**: Number of jobs waiting in `data/llm-deferred-queue.json` to drain automatically when quotas reset.

---

## ⚖️ License

MIT License. Open Source, No Editors, No Paywall.

