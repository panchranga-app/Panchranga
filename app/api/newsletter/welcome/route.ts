import { NextResponse } from 'next/server';
import { buildWelcomeEmailHTML, sendTransactionalEmail, getSupabaseServiceClient } from '@/lib/email';
import { SITE_URL } from '@/lib/config/site';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    let email: string | undefined;
    try {
      const body = await req.json();
      email = body?.email;
    } catch {
      // Body is optional; fallback to searchParams
    }

    if (!email) {
      const url = new URL(req.url);
      email = url.searchParams.get('email') || undefined;
    }

    if (!email) {
      return NextResponse.json({ ok: false, error: 'Email is required' }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();
    const siteUrl = SITE_URL;

    // Look up unsubscribe token if subscriber already exists in database
    let unsubscribeToken: string | undefined;
    try {
      const supabase = getSupabaseServiceClient();
      if (supabase) {
        const { data: sub } = await supabase
          .from('newsletter_subscribers')
          .select('unsubscribe_token')
          .eq('email', cleanEmail)
          .maybeSingle();
        unsubscribeToken = sub?.unsubscribe_token;
      }
    } catch {
      // Non-critical if Supabase read fails
    }

    const welcomeHtml = buildWelcomeEmailHTML(siteUrl, unsubscribeToken);

    const sendResult = await sendTransactionalEmail(
      { email: cleanEmail, unsubscribeToken },
      {
        from: 'Panchranga <welcome@panchranga.app>',
        replyTo: 'welcome@panchranga.app',
        subject: 'Welcome to Panchranga 🗞️',
        html: welcomeHtml,
      }
    );

    if (!sendResult.ok) {
      console.error('[WELCOME] Error sending welcome email:', sendResult.error);
      return NextResponse.json(
        { ok: false, error: sendResult.error || 'Failed to send welcome email' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      emailSent: true,
      recipient: cleanEmail,
      message: 'Onboarding welcome email sent successfully',
    });
  } catch (error: any) {
    console.error('[WELCOME] Welcome email handler error:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to send welcome email' },
      { status: 500 }
    );
  }
}
