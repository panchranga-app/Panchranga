import { createClient } from '@supabase/supabase-js';
import {
  buildEmailHTML,
  fetchTopNewsletterHubs,
  formatHubStories,
} from './builder';
import { dispatchNewsletter, sendTransactionalEmail } from './dispatcher';
import { DailyNewsletterOptions, DailyNewsletterResult, EmailRecipient } from './types';
import { buildComplianceHeaders, formatIstDate, maskEmail } from './utils';

export function getSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * End-to-end daily newsletter orchestrator.
 * Shared by both GitHub Actions (scripts/send-newsletter.ts) and API (/api/newsletter/send).
 */
export async function sendDailyNewsletter(
  options: DailyNewsletterOptions = {}
): Promise<DailyNewsletterResult> {
  const supabase = options.supabase || getSupabaseServiceClient();
  if (!supabase) {
    throw new Error('Supabase client credentials not configured');
  }

  const dryRun =
    options.dryRun ??
    (process.env.DRY_RUN === 'true' || process.env.DRY_RUN === '1');

  // Check TEST_RECIPIENTS
  const testRecipientsRaw =
    options.testRecipients ||
    (process.env.TEST_RECIPIENTS
      ? process.env.TEST_RECIPIENTS.split(',').map((e) => e.trim()).filter(Boolean)
      : undefined);

  const isTestMode = Boolean(testRecipientsRaw && testRecipientsRaw.length > 0);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://panchranga.vercel.app';

  // Step 1: Fetch Top 3 Hubs
  console.log('[NEWSLETTER] Fetching top 3 hubs for today...');
  const hubs = await fetchTopNewsletterHubs(supabase);
  if (!hubs || hubs.length === 0) {
    console.log('[NEWSLETTER] No topic hubs available to send.');
    return {
      message: 'No topic hubs available for today',
      sent: 0,
      failed: 0,
      deferred: 0,
      providerCounts: {},
      storiesCount: 0,
      dryRun,
    };
  }

  const stories = formatHubStories(hubs, siteUrl);
  const todayFormatted = formatIstDate(new Date());

  // Step 2: Determine Subscribers list
  let subscribers: EmailRecipient[] = [];

  if (isTestMode && testRecipientsRaw) {
    console.log(`[NEWSLETTER] TEST_RECIPIENTS mode enabled: Sending ONLY to ${testRecipientsRaw.length} test address(es).`);
    const { data: dbMatches } = await supabase
      .from('newsletter_subscribers')
      .select('id, email, unsubscribe_token')
      .in('email', testRecipientsRaw);

    const matchMap = new Map<string, { id?: string; unsubscribe_token?: string }>();
    dbMatches?.forEach((m: any) => {
      if (m.email) matchMap.set(m.email.toLowerCase(), m);
    });

    subscribers = testRecipientsRaw.map((email) => {
      const match = matchMap.get(email.toLowerCase());
      return {
        id: match?.id,
        email,
        unsubscribeToken: match?.unsubscribe_token || 'test-token',
      };
    });
  } else {
    // Read active subscribers ordered by last_sent_at ascending (nulls first) to prioritize deferred subscribers
    console.log('[NEWSLETTER] Fetching active subscribers from Supabase...');
    let { data: dbSubs, error: subsError } = await supabase
      .from('newsletter_subscribers')
      .select('id, email, unsubscribe_token, last_sent_at')
      .eq('is_active', true)
      .order('last_sent_at', { ascending: true, nullsFirst: true });

    // Fallback if last_sent_at column is not yet present before migration is applied
    if (subsError) {
      console.warn(
        '[NEWSLETTER] Could not order by last_sent_at (migration may be pending). Falling back to subscribed_at:',
        subsError.message
      );
      const fallback = await supabase
        .from('newsletter_subscribers')
        .select('id, email, unsubscribe_token')
        .eq('is_active', true)
        .order('subscribed_at', { ascending: true });
      dbSubs = fallback.data;
    }

    if (!dbSubs || dbSubs.length === 0) {
      console.log('[NEWSLETTER] No active subscribers found.');
      return {
        message: 'No active subscribers found',
        sent: 0,
        failed: 0,
        deferred: 0,
        providerCounts: {},
        storiesCount: stories.length,
        dryRun,
      };
    }

    subscribers = dbSubs.map((s: any) => ({
      id: s.id,
      email: s.email,
      unsubscribeToken: s.unsubscribe_token,
    }));
  }

  // Step 3: Message builder closure for each subscriber
  const buildMessageForRecipient = (sub: EmailRecipient) => {
    const html = buildEmailHTML(stories, todayFormatted, sub.unsubscribeToken, siteUrl);
    const headers = buildComplianceHeaders(sub.email, sub.unsubscribeToken, siteUrl);

    return {
      subject: `Panchranga Daily — ${todayFormatted}`,
      html,
      headers,
    };
  };

  // Step 4: Dispatch Newsletter
  const dispatchResult = await dispatchNewsletter({
    subscribers,
    buildMessageForRecipient,
    supabase,
    dryRun,
    isTestMode,
  });

  dispatchResult.storiesCount = stories.length;

  // Step 5: Log to newsletter_sends if not in test mode and not a dry run
  if (!isTestMode && !dryRun && dispatchResult.sent > 0) {
    try {
      const logPayload = {
        subscriber_count: dispatchResult.sent,
        deferred_count: dispatchResult.deferred,
        gmail_count: dispatchResult.providerCounts.gmail || 0,
        brevo_count: dispatchResult.providerCounts.brevo || 0,
        resend_count: dispatchResult.providerCounts.resend || 0,
        provider_counts: dispatchResult.providerCounts,
        hub_ids: hubs.map((h: any) => h.id),
        status: dispatchResult.failed > 0 ? 'partial' : 'sent',
      };

      const { error: logError } = await supabase.from('newsletter_sends').insert(logPayload);

      // Fallback insert if columns from migration are not yet applied
      if (logError) {
        console.warn('[NEWSLETTER] Inserting full send log failed, trying legacy columns:', logError.message);
        await supabase.from('newsletter_sends').insert({
          subscriber_count: dispatchResult.sent,
          hub_ids: hubs.map((h: any) => h.id),
          status: 'sent',
        });
      }
    } catch (logErr) {
      console.warn('[NEWSLETTER] Failed to write newsletter send record to DB:', logErr);
    }
  }

  return dispatchResult;
}

export { sendTransactionalEmail };
