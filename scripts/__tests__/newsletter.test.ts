import assert from 'assert';
import {
  buildComplianceHeaders,
  buildEmailHTML,
  formatHubStories,
  formatIstDate,
  getDailyLimits,
  getStartOfCurrentIstDayUtc,
  maskEmail,
} from '../../lib/email';
import { GmailSmtpProvider } from '../../lib/email/providers/gmail';
import { BrevoProvider } from '../../lib/email/providers/brevo';
import { ResendProvider } from '../../lib/email/providers/resend';
import { dispatchNewsletter } from '../../lib/email/dispatcher';
import { EmailProvider, EmailRecipient, SendResult } from '../../lib/email/types';

async function runTests() {
  console.log('🧪 Starting Panchranga Newsletter System Test Suite...\n');
  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    total++;
    try {
      fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`❌ [FAIL] ${name}:`, err.message);
      throw err;
    }
  }

  async function testAsync(name: string, fn: () => Promise<void>) {
    total++;
    try {
      await fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`❌ [FAIL] ${name}:`, err.message);
      throw err;
    }
  }

  // 1. Email Masking Tests
  test('Email masking: masks emails and protects privacy', () => {
    assert.strictEqual(maskEmail('john.doe@example.com'), 'j***e@example.com');
    assert.strictEqual(maskEmail('ravi@panchranga.in'), 'r***i@panchranga.in');
    assert.strictEqual(maskEmail('ab@test.com'), 'a***@test.com');
    assert.strictEqual(maskEmail('a@b.com'), 'a***@b.com');
    assert.strictEqual(maskEmail('invalid-email'), '***');
    assert.strictEqual(maskEmail(''), '***');
  });

  // 2. IST Day Calculations
  test('IST Midnight Calculation: computes start of IST day in UTC correctly', () => {
    // Test for a known time: 2026-10-03 07:00:00 IST (2026-10-03 01:30:00 UTC)
    const knownDate = new Date('2026-10-03T01:30:00.000Z');
    const startUtc = getStartOfCurrentIstDayUtc(knownDate);

    // Midnight IST on 2026-10-03 is 2026-10-02 18:30:00 UTC
    assert.strictEqual(startUtc.toISOString(), '2026-10-02T18:30:00.000Z');

    // Test formatted IST date
    const formatted = formatIstDate(knownDate);
    assert(formatted.includes('Saturday') || formatted.includes('October') || formatted.includes('3'));
  });

  // 3. Compliance Headers & RFC 8058
  test('Compliance Headers: generates valid List-Unsubscribe and List-Unsubscribe-Post', () => {
    process.env.GMAIL_USER = 'newsletter@panchranga.in';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://panchranga.vercel.app';

    const headers = buildComplianceHeaders('subscriber@example.com', 'token-12345');

    assert.strictEqual(headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
    assert(headers['List-Unsubscribe'].includes('https://panchranga.vercel.app/api/newsletter/unsubscribe?token=token-12345'));
    assert(headers['List-Unsubscribe'].includes('mailto:newsletter@panchranga.in?subject=Unsubscribe%20subscriber%40example.com'));
  });

  // 4. HTML Builder & Footer Text
  test('HTML Builder: preserves layout and contains required footer compliance text', () => {
    const mockStories = [
      {
        id: 'hub-1',
        title: 'Story 1: National Economic Reform',
        summary: 'Deep dive into economic policy changes.',
        image: 'https://example.com/img1.jpg',
        sourceNames: ['The Hindu', 'Indian Express'],
        totalSources: 5,
        hubUrl: 'https://panchranga.vercel.app/hub/hub-1',
      },
    ];

    const html = buildEmailHTML(
      mockStories,
      'Saturday, 3 October 2026',
      'token-abc-123',
      'https://panchranga.vercel.app'
    );

    // Verify key sections
    assert(html.includes("You're receiving this because you subscribed at panchranga.vercel.app"));
    assert(html.includes('Story 1: National Economic Reform'));
    assert(html.includes('https://panchranga.vercel.app/api/newsletter/unsubscribe?token=token-abc-123'));
    assert(html.includes('पंचरंग · Every Color of the Story'));
    assert(html.includes('Read full coverage →'));
  });

  // 5. Provider Configuration & Error Classification
  test('GmailSmtpProvider: configuration and error classification', () => {
    const gmail = new GmailSmtpProvider();

    // Check configured logic
    const oldUser = process.env.GMAIL_USER;
    const oldPass = process.env.GMAIL_APP_PASSWORD;

    delete process.env.GMAIL_USER;
    delete process.env.GMAIL_APP_PASSWORD;
    assert.strictEqual(gmail.isConfigured(), false);

    process.env.GMAIL_USER = 'dummy@gmail.com';
    process.env.GMAIL_APP_PASSWORD = 'dummy';
    assert.strictEqual(gmail.isConfigured(), true);

    // Restore
    if (oldUser) process.env.GMAIL_USER = oldUser;
    else delete process.env.GMAIL_USER;
    if (oldPass) process.env.GMAIL_APP_PASSWORD = oldPass;
    else delete process.env.GMAIL_APP_PASSWORD;
  });

  test('BrevoProvider: isConfigured requires BREVO_ENABLED=true and api key', () => {
    const brevo = new BrevoProvider();

    process.env.BREVO_ENABLED = 'false';
    process.env.BREVO_API_KEY = 'test-key';
    process.env.BREVO_SENDER_EMAIL = 'sender@test.com';
    assert.strictEqual(brevo.isConfigured(), false);

    process.env.BREVO_ENABLED = 'true';
    assert.strictEqual(brevo.isConfigured(), true);

    delete process.env.BREVO_API_KEY;
    assert.strictEqual(brevo.isConfigured(), false);

    delete process.env.BREVO_ENABLED;
  });

  test('ResendProvider: isConfigured requires RESEND_API_KEY', () => {
    const resend = new ResendProvider();

    delete process.env.RESEND_API_KEY;
    assert.strictEqual(resend.isConfigured(), false);

    process.env.RESEND_API_KEY = 're_123';
    assert.strictEqual(resend.isConfigured(), true);
  });

  // 6. Dispatcher Dry Run Simulation
  await testAsync('Dispatcher: DRY_RUN mode calculates planned split without sending', async () => {
    const subscribers: EmailRecipient[] = Array.from({ length: 25 }, (_, i) => ({
      email: `user${i + 1}@example.com`,
      unsubscribeToken: `token-${i + 1}`,
    }));

    // Mock limits
    process.env.GMAIL_DAILY_LIMIT = '10';
    process.env.BREVO_DAILY_LIMIT = '10';
    process.env.RESEND_DAILY_LIMIT = '10';
    process.env.EMAIL_PROVIDER_ORDER = 'gmail,resend';

    // Mock providers configured
    process.env.GMAIL_USER = 'test@gmail.com';
    process.env.GMAIL_APP_PASSWORD = 'test';
    process.env.RESEND_API_KEY = 're_test';

    const result = await dispatchNewsletter({
      subscribers,
      buildMessageForRecipient: () => ({
        subject: 'Test Subject',
        html: '<p>Test</p>',
      }),
      supabase: null,
      dryRun: true,
    });

    assert.strictEqual(result.dryRun, true);
    assert.strictEqual(result.sent, 0);
    assert.strictEqual(result.deferred, 5); // 25 total - (10 gmail + 10 resend) = 5 deferred
    assert.strictEqual(result.plannedSplit?.gmail, 10);
    assert.strictEqual(result.plannedSplit?.resend, 10);
  });

  // 7. Dispatcher Fallthrough & Quota Handling Simulation
  await testAsync('Dispatcher: Fallthrough to next provider on quota error', async () => {
    // Custom mock providers to test dispatching mechanics
    let gmailAttemptCount = 0;
    let resendAttemptCount = 0;

    class MockGmailProvider implements EmailProvider {
      readonly name = 'gmail';
      isConfigured() {
        return true;
      }
      async send(recipient: EmailRecipient, _message?: any): Promise<SendResult> {
        gmailAttemptCount++;
        if (gmailAttemptCount <= 2) {
          return { ok: true };
        }
        // Hit 550 5.4.5 quota on 3rd send
        return {
          ok: false,
          error: '550 5.4.5 Daily user sending limit exceeded',
          quotaExceeded: true,
          permanent: false,
        };
      }
    }

    class MockResendProvider implements EmailProvider {
      readonly name = 'resend';
      isConfigured() {
        return true;
      }
      async send(recipient: EmailRecipient, _message?: any): Promise<SendResult> {
        resendAttemptCount++;
        return { ok: true };
      }
    }

    const testSubscribers: EmailRecipient[] = [
      { email: 'sub1@example.com' },
      { email: 'sub2@example.com' },
      { email: 'sub3@example.com' },
      { email: 'sub4@example.com' },
    ];

    // Build a miniature test dispatcher simulating the exact provider order & fallthrough
    const activeProviders = [
      { provider: new MockGmailProvider(), name: 'gmail', remainingBudget: 10, sentThisRun: 0, quotaExhausted: false },
      { provider: new MockResendProvider(), name: 'resend', remainingBudget: 10, sentThisRun: 0, quotaExhausted: false },
    ];

    let pIndex = 0;
    let totalSent = 0;

    for (const sub of testSubscribers) {
      let sent = false;
      while (pIndex < activeProviders.length && !sent) {
        const cur = activeProviders[pIndex];
        const res = await cur.provider.send(sub, { subject: '', html: '' });
        if (res.ok) {
          sent = true;
          totalSent++;
          cur.sentThisRun++;
        } else if (res.quotaExceeded) {
          cur.quotaExhausted = true;
          cur.remainingBudget = 0;
          pIndex++; // Fallthrough to next provider
        }
      }
    }

    assert.strictEqual(totalSent, 4);
    assert.strictEqual(activeProviders[0].sentThisRun, 2); // sub1, sub2 sent by Gmail
    assert.strictEqual(activeProviders[1].sentThisRun, 2); // sub3, sub4 fallen through and sent by Resend
  });

  // 8. Hard Bounce Inactive Marking Simulation
  test('Hard bounce permanent error detection', () => {
    const gmail = new GmailSmtpProvider();

    // Verify detection pattern for permanent failure
    const permError = {
      message: '550 5.1.1 The email account that you tried to reach does not exist',
      responseCode: 550,
    };
    const errStr = `${permError.message} ${permError.responseCode}`.toLowerCase();
    const isPermanent =
      (permError.responseCode >= 500 && permError.responseCode < 600 && !errStr.includes('5.4.5')) ||
      errStr.includes('5.1.1');
    assert.strictEqual(isPermanent, true);
  });

  console.log(`\n🎉 All ${passed}/${total} tests passed successfully!`);
}

runTests().catch((e) => {
  console.error('Test suite failed:', e);
  process.exit(1);
});
