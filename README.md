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

## ⚖️ License

MIT License. Open Source, No Editors, No Paywall.
