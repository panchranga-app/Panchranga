import { GmailSmtpProvider } from './providers/gmail';
import { BrevoProvider } from './providers/brevo';
import { ResendProvider } from './providers/resend';
import {
  DailyNewsletterOptions,
  DailyNewsletterResult,
  EmailMessage,
  EmailProvider,
  EmailRecipient,
  ProviderBudgetStatus,
  SendResult,
} from './types';
import {
  buildComplianceHeaders,
  getStartOfCurrentIstDayUtc,
  maskEmail,
  sleep,
} from './utils';

interface ActiveProviderState {
  provider: EmailProvider;
  name: string;
  dailyLimit: number;
  sentToday: number;
  remainingBudget: number;
  sentThisRun: number;
  quotaExhausted: boolean;
}

/**
 * Creates instances of all supported providers.
 */
export function createProviders(): Record<string, EmailProvider> {
  return {
    gmail: new GmailSmtpProvider(),
    brevo: new BrevoProvider(),
    resend: new ResendProvider(),
  };
}

/**
 * Returns configured daily limits from environment variables with defaults.
 */
export function getDailyLimits(): Record<string, number> {
  return {
    gmail: parseInt(process.env.GMAIL_DAILY_LIMIT || '100', 10),
    brevo: parseInt(process.env.BREVO_DAILY_LIMIT || '290', 10),
    resend: parseInt(process.env.RESEND_DAILY_LIMIT || '95', 10),
  };
}

/**
 * Queries Supabase newsletter_sends to calculate emails sent so far in the current IST day.
 */
export async function getSendsTodayByProvider(
  supabase: any
): Promise<Record<string, number>> {
  const sentCounts: Record<string, number> = {
    gmail: 0,
    brevo: 0,
    resend: 0,
  };

  if (!supabase) return sentCounts;

  try {
    const startOfIstDay = getStartOfCurrentIstDayUtc().toISOString();
    const { data: sendsToday, error } = await supabase
      .from('newsletter_sends')
      .select('gmail_count, brevo_count, resend_count, provider_counts')
      .gte('sent_at', startOfIstDay);

    if (error) {
      console.warn('[EMAIL] Could not query newsletter_sends for today (table/columns may be unmigrated):', error.message);
      return sentCounts;
    }

    if (sendsToday && Array.isArray(sendsToday)) {
      for (const row of sendsToday) {
        if (typeof row.gmail_count === 'number') sentCounts.gmail += row.gmail_count;
        if (typeof row.brevo_count === 'number') sentCounts.brevo += row.brevo_count;
        if (typeof row.resend_count === 'number') sentCounts.resend += row.resend_count;

        if (row.provider_counts && typeof row.provider_counts === 'object') {
          for (const [provider, count] of Object.entries(row.provider_counts)) {
            if (typeof count === 'number' && !('gmail_count' in row)) {
              sentCounts[provider] = (sentCounts[provider] || 0) + count;
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[EMAIL] Warning calculating daily sends from DB:', err);
  }

  return sentCounts;
}

/**
 * Computes the provider budgets and active provider list in priority order.
 */
export async function getProviderBudgetStatuses(
  supabase: any,
  providerMap: Record<string, EmailProvider>
): Promise<ProviderBudgetStatus[]> {
  const orderString = process.env.EMAIL_PROVIDER_ORDER || 'gmail,brevo,resend';
  const order = orderString.split(',').map((p) => p.trim().toLowerCase()).filter(Boolean);
  const limits = getDailyLimits();
  const sentTodayMap = await getSendsTodayByProvider(supabase);

  const statuses: ProviderBudgetStatus[] = [];

  for (const name of order) {
    const provider = providerMap[name];
    if (!provider) {
      console.warn(`[EMAIL] Unknown provider in EMAIL_PROVIDER_ORDER: "${name}", skipping.`);
      continue;
    }

    const isConfigured = provider.isConfigured();
    const limit = limits[name] ?? 0;
    const sentToday = sentTodayMap[name] ?? 0;
    const remainingBudget = isConfigured ? Math.max(0, limit - sentToday) : 0;

    statuses.push({
      providerName: name,
      configured: isConfigured,
      dailyLimit: limit,
      sentToday,
      remainingBudget,
    });
  }

  return statuses;
}

/**
 * Transactional email helper (used for welcome email or single notifications).
 * Tries configured providers in order until one succeeds.
 */
export async function sendTransactionalEmail(
  recipient: EmailRecipient,
  message: EmailMessage
): Promise<SendResult> {
  const providers = createProviders();
  const orderString = process.env.EMAIL_PROVIDER_ORDER || 'gmail,brevo,resend';
  const order = orderString.split(',').map((p) => p.trim().toLowerCase()).filter(Boolean);

  let lastError = 'No email providers configured';

  // Ensure compliance headers are present
  const complianceHeaders = buildComplianceHeaders(recipient.email, recipient.unsubscribeToken);
  const mergedHeaders = {
    ...complianceHeaders,
    ...(message.headers || {}),
  };
  const messageWithHeaders: EmailMessage = {
    ...message,
    headers: mergedHeaders,
  };

  for (const providerName of order) {
    const provider = providers[providerName];
    if (!provider || !provider.isConfigured()) {
      continue;
    }

    try {
      const result = await provider.send(recipient, messageWithHeaders);
      if (result.ok) {
        if (provider.close) await provider.close();
        return result;
      }
      lastError = result.error || 'Provider send failed';
      console.warn(`[EMAIL] Transactional send failed with ${providerName}: ${lastError}`);
    } catch (err: any) {
      lastError = err?.message || String(err);
      console.warn(`[EMAIL] Transactional error with ${providerName}: ${lastError}`);
    } finally {
      if (provider.close) await provider.close();
    }
  }

  return {
    ok: false,
    error: lastError,
  };
}

/**
 * Primary dispatch engine for the daily newsletter.
 * Handles:
 * - Budget checks and order selection
 * - Dry run simulation
 * - Test recipients mode
 * - Priority queue (last_sent_at ascending, nulls first)
 * - Concurrency 3 with ~300ms pacing
 * - Quota detection and provider fallthrough
 * - Retry with backoff for temporary errors
 * - Hard bounce handling (marking inactive in Supabase)
 * - Send log persistence
 */
export async function dispatchNewsletter({
  subscribers,
  buildMessageForRecipient,
  supabase,
  dryRun = false,
  isTestMode = false,
}: {
  subscribers: EmailRecipient[];
  buildMessageForRecipient: (sub: EmailRecipient) => EmailMessage;
  supabase: any;
  dryRun?: boolean;
  isTestMode?: boolean;
}): Promise<DailyNewsletterResult> {
  const providerMap = createProviders();
  const orderString = process.env.EMAIL_PROVIDER_ORDER || 'gmail,brevo,resend';
  const order = orderString.split(',').map((p) => p.trim().toLowerCase()).filter(Boolean);
  const limits = getDailyLimits();
  const sentTodayMap = await getSendsTodayByProvider(supabase);

  // Initialize active providers state
  const activeProviders: ActiveProviderState[] = [];
  for (const name of order) {
    const provider = providerMap[name];
    if (!provider) continue;

    const configured = provider.isConfigured();
    const limit = limits[name] ?? 0;
    const sentToday = isTestMode ? 0 : (sentTodayMap[name] ?? 0);
    const remainingBudget = configured ? Math.max(0, limit - sentToday) : 0;

    if (configured && remainingBudget > 0) {
      activeProviders.push({
        provider,
        name,
        dailyLimit: limit,
        sentToday,
        remainingBudget,
        sentThisRun: 0,
        quotaExhausted: false,
      });
    } else {
      console.log(
        `[EMAIL] Provider ${name} skipped: configured=${configured}, limit=${limit}, sentToday=${sentToday}, remaining=${remainingBudget}`
      );
    }
  }

  // Calculate planned split across providers
  const plannedSplit: Record<string, number> = {};
  let totalAvailableBudget = 0;
  let remainingSubsCount = subscribers.length;

  for (const p of activeProviders) {
    const allocated = Math.min(p.remainingBudget, remainingSubsCount);
    plannedSplit[p.name] = allocated;
    remainingSubsCount -= allocated;
    totalAvailableBudget += p.remainingBudget;
  }
  const plannedDeferred = remainingSubsCount;

  // Log dispatch plan
  console.log('----------------------------------------------------');
  console.log(`[EMAIL] Newsletter Dispatch Plan:`);
  console.log(`  Subscribers to send: ${subscribers.length}`);
  console.log(`  Configured Active Providers: ${activeProviders.map((p) => p.name).join(', ') || 'None'}`);
  for (const p of activeProviders) {
    console.log(
      `    • ${p.name}: Limit ${p.dailyLimit} | Sent today ${p.sentToday} | Remaining budget ${p.remainingBudget} | Planned ${plannedSplit[p.name] || 0}`
    );
  }
  console.log(`  Planned Deferred (next day priority): ${plannedDeferred}`);
  console.log(`  Dry Run: ${dryRun} | Test Mode: ${isTestMode}`);
  console.log('----------------------------------------------------');

  if (dryRun) {
    console.log('[EMAIL] DRY_RUN=true: Simulation complete. No emails were sent.');
    return {
      message: 'Dry run completed successfully',
      sent: 0,
      failed: 0,
      deferred: plannedDeferred,
      providerCounts: plannedSplit,
      storiesCount: 0,
      dryRun: true,
      plannedSplit,
    };
  }

  if (activeProviders.length === 0) {
    console.warn('[EMAIL] No email providers are configured or have remaining budget for today.');
    return {
      message: 'No available providers with budget',
      sent: 0,
      failed: 0,
      deferred: subscribers.length,
      providerCounts: {},
      storiesCount: 0,
      dryRun: false,
    };
  }

  // Live Sending Execution
  let successCount = 0;
  let failCount = 0;
  let permanentBounceCount = 0;
  let activeProviderIndex = 0;

  // Work queue
  const queue = [...subscribers];
  const deferredList: EmailRecipient[] = [];

  // Concurrency 3 worker loop
  const CONCURRENCY = 3;
  const PACING_MS = 300;

  async function worker(workerId: number): Promise<void> {
    while (true) {
      // Find currently available provider with budget
      while (
        activeProviderIndex < activeProviders.length &&
        (activeProviders[activeProviderIndex].remainingBudget <= 0 ||
          activeProviders[activeProviderIndex].quotaExhausted)
      ) {
        activeProviderIndex++;
      }

      if (activeProviderIndex >= activeProviders.length) {
        // All provider budgets exhausted for this run; any items left in queue are deferred
        break;
      }

      const recipient = queue.shift();
      if (!recipient) {
        break; // Queue is empty
      }

      let emailSent = false;
      const message = buildMessageForRecipient(recipient);

      // Try current and subsequent providers if quota errors occur
      while (activeProviderIndex < activeProviders.length && !emailSent) {
        const currentProviderState = activeProviders[activeProviderIndex];

        if (currentProviderState.remainingBudget <= 0 || currentProviderState.quotaExhausted) {
          activeProviderIndex++;
          continue;
        }

        // Retry loop for temporary errors (up to 3 attempts with exponential backoff)
        let attempt = 0;
        const maxAttempts = 3;
        let lastResult: SendResult = { ok: false, error: 'Unsent' };

        while (attempt < maxAttempts) {
          attempt++;
          lastResult = await currentProviderState.provider.send(recipient, message);

          if (lastResult.ok) {
            emailSent = true;
            successCount++;
            currentProviderState.sentThisRun++;
            currentProviderState.remainingBudget--;

            // Update subscriber last_sent_at in database
            if (supabase && !isTestMode && recipient.email) {
              try {
                await supabase
                  .from('newsletter_subscribers')
                  .update({ last_sent_at: new Date().toISOString() })
                  .eq('email', recipient.email);
              } catch (dbErr) {
                // Non-critical if DB column is pending migration
              }
            }

            break; // Success, exit retry loop
          }

          // Handle Quota Error: Stop using this provider and fall through immediately
          if (lastResult.quotaExceeded) {
            console.warn(
              `[EMAIL] Daily quota exceeded on provider "${currentProviderState.name}" (error: ${lastResult.error}). Falling through to next provider.`
            );
            currentProviderState.quotaExhausted = true;
            currentProviderState.remainingBudget = 0;
            activeProviderIndex++;
            break; // Break retry loop to fall through to next provider in outer loop
          }

          // Handle Permanent Failure: Do not retry, mark subscriber inactive
          if (lastResult.permanent) {
            console.warn(
              `[EMAIL] Permanent failure for ${maskEmail(recipient.email)} via ${currentProviderState.name}: ${lastResult.error}. Marking inactive.`
            );
            permanentBounceCount++;
            failCount++;

            if (supabase && !isTestMode && recipient.email) {
              try {
                await supabase
                  .from('newsletter_subscribers')
                  .update({ is_active: false })
                  .eq('email', recipient.email);
                console.log(`[EMAIL] Subscriber ${maskEmail(recipient.email)} marked inactive due to hard bounce.`);
              } catch (dbErr) {
                console.warn(`[EMAIL] Failed to mark ${maskEmail(recipient.email)} inactive:`, dbErr);
              }
            }

            emailSent = false;
            break; // Stop retrying this recipient
          }

          // Handle Temporary Failure: Retry with backoff
          if (attempt < maxAttempts) {
            const backoffMs = 1000 * Math.pow(2, attempt - 1); // 1s, 2s
            console.warn(
              `[EMAIL] Attempt ${attempt} failed for ${maskEmail(recipient.email)} via ${currentProviderState.name} (${lastResult.error}). Retrying in ${backoffMs}ms...`
            );
            await sleep(backoffMs);
          } else {
            console.error(
              `[EMAIL] All ${maxAttempts} attempts failed for ${maskEmail(recipient.email)} via ${currentProviderState.name}: ${lastResult.error}`
            );
            failCount++;
          }
        }

        // If quota exceeded, the outer while loop will try the next provider for this recipient
      }

      if (!emailSent && activeProviderIndex >= activeProviders.length) {
        // No providers remain to send this recipient
        deferredList.push(recipient);
      }

      // Concurrency pacing: ~300ms pause between sends in each worker
      await sleep(PACING_MS);
    }
  }

  // Launch workers concurrently
  const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1));
  await Promise.all(workers);

  // Close provider transports if needed
  for (const p of activeProviders) {
    if (p.provider.close) {
      try {
        await p.provider.close();
      } catch (closeErr) {
        // Ignore close error
      }
    }
  }

  // Any remaining items in queue that were never started due to budget exhaustion are deferred
  const totalDeferred = queue.length + deferredList.length;

  const actualProviderCounts: Record<string, number> = {};
  for (const p of activeProviders) {
    actualProviderCounts[p.name] = p.sentThisRun;
  }

  console.log('====================================================');
  console.log(`[EMAIL] Dispatch Run Complete:`);
  console.log(`  Sent: ${successCount}`);
  console.log(`  Failed: ${failCount} (Permanent hard bounces: ${permanentBounceCount})`);
  console.log(`  Deferred: ${totalDeferred}`);
  for (const [provider, count] of Object.entries(actualProviderCounts)) {
    console.log(`    • ${provider}: ${count} sent`);
  }
  console.log('====================================================');

  return {
    message: 'Newsletter dispatched',
    sent: successCount,
    failed: failCount,
    deferred: totalDeferred,
    providerCounts: actualProviderCounts,
    storiesCount: 0,
    dryRun: false,
  };
}
