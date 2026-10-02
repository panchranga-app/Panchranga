import { NextResponse } from 'next/server';
import { buildWelcomeEmailHTML, sendTransactionalEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://panchranga.vercel.app';
    const welcomeHtml = buildWelcomeEmailHTML(siteUrl);

    const sendResult = await sendTransactionalEmail(
      { email },
      {
        subject: 'Welcome to Panchranga 🗞️',
        html: welcomeHtml,
      }
    );

    if (!sendResult.ok) {
      console.error('[WELCOME] Error sending welcome email:', sendResult.error);
      return NextResponse.json(
        { error: sendResult.error || 'Failed to send welcome email' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[WELCOME] Welcome email handler error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to send welcome email' },
      { status: 500 }
    );
  }
}
