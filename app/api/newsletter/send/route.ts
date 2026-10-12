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

export async function GET(req: Request) {
  if (!validateRequest(req)) {
    return NextResponse.json(
      { error: 'Unauthorized' }, 
      { status: 401 }
    );
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dryRun') === 'true';
  const force = url.searchParams.get('force') === 'true';

  try {
    const result = await sendDailyNewsletter({
      dryRun,
      force,
    });

    return NextResponse.json({
      message: result.message,
      sent: result.sent,
      failed: result.failed,
      deferred: result.deferred,
      providerCounts: result.providerCounts,
      stories: result.storiesCount,
      dryRun: result.dryRun,
    });
  } catch (error: any) {
    console.error('[API] Newsletter send error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to send newsletter' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {

  if (!validateRequest(req)) {
    return NextResponse.json(
      { error: 'Unauthorized' }, 
      { status: 401 }
    );
  }

  let body: { dryRun?: boolean; force?: boolean; testRecipients?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    // Body is optional
  }

  try {
    const result = await sendDailyNewsletter({
      dryRun: body.dryRun,
      force: body.force,
      testRecipients: body.testRecipients,
    });

    return NextResponse.json({
      message: result.message,
      sent: result.sent,
      failed: result.failed,
      deferred: result.deferred,
      providerCounts: result.providerCounts,
      stories: result.storiesCount,
      dryRun: result.dryRun,
    });
  } catch (error: any) {
    console.error('[API] Newsletter send error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to send newsletter' },
      { status: 500 }
    );
  }
}
