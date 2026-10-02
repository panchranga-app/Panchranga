import { NextResponse } from 'next/server';
import { sendDailyNewsletter } from '@/lib/email';

export const dynamic = 'force-dynamic';

function validateRequest(req: Request) {
  const authHeader = req.headers.get('authorization');
  const expectedKey = process.env.NEWSLETTER_SECRET_KEY;
  if (!expectedKey) return false;
  return authHeader === `Bearer ${expectedKey}`;
}

export async function POST(req: Request) {
  if (!validateRequest(req)) {
    return NextResponse.json(
      { error: 'Unauthorized' }, 
      { status: 401 }
    );
  }

  let body: { dryRun?: boolean; testRecipients?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    // Body is optional
  }

  try {
    const result = await sendDailyNewsletter({
      dryRun: body.dryRun,
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
