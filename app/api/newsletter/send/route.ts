import { NextResponse } from 'next/server';
import { sendDailyNewsletter } from '@/lib/email';

export const dynamic = 'force-dynamic';

function validateRequest(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return false;
  const validKeys = [
    process.env.NEWSLETTER_SECRET_KEY,
    process.env.CRON_SECRET,
  ].filter(Boolean);
  if (validKeys.length === 0) return false;
  return validKeys.some((key) => authHeader === `Bearer ${key}`);
}

function parseTestRecipients(
  val: unknown
): string[] | undefined {
  if (Array.isArray(val)) {
    return val.map((e) => String(e).trim()).filter(Boolean);
  }
  if (typeof val === 'string' && val.trim()) {
    return val.split(',').map((e) => e.trim()).filter(Boolean);
  }
  return undefined;
}

export async function GET(req: Request) {
  if (!validateRequest(req)) {
    return NextResponse.json(
      { error: 'Unauthorized: Missing or invalid Bearer token' }, 
      { status: 401 }
    );
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dryRun') === 'true' || url.searchParams.get('dry_run') === 'true';
  const force = url.searchParams.get('force') === 'true';
  const testParam = url.searchParams.get('testEmail') || url.searchParams.get('test_email') || url.searchParams.get('testRecipients');
  const testRecipients = parseTestRecipients(testParam);

  try {
    const result = await sendDailyNewsletter({
      dryRun,
      force,
      testRecipients,
    });

    return NextResponse.json({
      ok: result.failed === 0,
      message: result.message,
      sent: result.sent,
      failed: result.failed,
      deferred: result.deferred,
      providerCounts: result.providerCounts,
      stories: result.storiesCount,
      dryRun: result.dryRun,
    });
  } catch (error: any) {
    console.error('[API /api/newsletter/send] Execution error:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to send newsletter' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  if (!validateRequest(req)) {
    return NextResponse.json(
      { error: 'Unauthorized: Missing or invalid Bearer token' }, 
      { status: 401 }
    );
  }

  const url = new URL(req.url);
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // Body is optional; fallback to searchParams
  }

  const dryRun =
    body.dryRun === true ||
    body.dry_run === true ||
    url.searchParams.get('dryRun') === 'true' ||
    url.searchParams.get('dry_run') === 'true';

  const force =
    body.force === true ||
    url.searchParams.get('force') === 'true';

  const testParam =
    body.testRecipients ||
    body.testEmail ||
    body.test_email ||
    url.searchParams.get('testEmail') ||
    url.searchParams.get('test_email');

  const testRecipients = parseTestRecipients(testParam);

  try {
    const result = await sendDailyNewsletter({
      dryRun,
      force,
      testRecipients,
    });

    return NextResponse.json({
      ok: result.failed === 0,
      message: result.message,
      sent: result.sent,
      failed: result.failed,
      deferred: result.deferred,
      providerCounts: result.providerCounts,
      stories: result.storiesCount,
      dryRun: result.dryRun,
    });
  } catch (error: any) {
    console.error('[API /api/newsletter/send] Execution error:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to send newsletter' },
      { status: 500 }
    );
  }
}
