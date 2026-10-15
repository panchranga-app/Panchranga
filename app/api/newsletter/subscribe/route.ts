import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { buildWelcomeEmailHTML, sendTransactionalEmail } from '@/lib/email';
import { SITE_URL } from '@/lib/config/site';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Database credentials not configured' },
        { status: 500 }
      );
    }

    const { email } = await req.json();

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    const cleanEmail = email.toLowerCase().trim();

    // Check if already subscribed
    const { data: existing, error: selectErr } = await supabase
      .from('newsletter_subscribers')
      .select('id, is_active, unsubscribe_token')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (selectErr) {
      console.error('[SUBSCRIBE] Error querying existing subscriber:', selectErr);
    }

    let unsubscribeToken: string | undefined = existing?.unsubscribe_token;
    let responseMessage: 'subscribed' | 'resubscribed' = 'subscribed';

    if (existing) {
      if (existing.is_active) {
        return NextResponse.json(
          { message: 'already_subscribed' },
          { status: 200 }
        );
      } else {
        // Reactivate if they unsubscribed before
        const { error: updateErr } = await supabase
          .from('newsletter_subscribers')
          .update({ is_active: true })
          .eq('email', cleanEmail);

        if (updateErr) throw updateErr;
        responseMessage = 'resubscribed';
      }
    } else {
      // Insert new subscriber
      const { data: inserted, error: insertErr } = await supabase
        .from('newsletter_subscribers')
        .insert({
          email: cleanEmail,
          source: 'website',
        })
        .select('unsubscribe_token')
        .maybeSingle();

      if (insertErr) {
        console.error('[SUBSCRIBE] Error inserting subscriber:', insertErr);
        throw insertErr;
      }
      unsubscribeToken = inserted?.unsubscribe_token;
    }

    // Send welcome email directly using provider abstraction
    let emailSent = false;
    let emailError: string | undefined;
    try {
      const siteUrl = SITE_URL;
      const welcomeHtml = buildWelcomeEmailHTML(siteUrl, unsubscribeToken);
      const sendRes = await sendTransactionalEmail(
        { email: cleanEmail, unsubscribeToken },
        {
          from: 'Panchranga <welcome@panchranga.app>',
          replyTo: 'welcome@panchranga.app',
          subject: 'Welcome to Panchranga 🗞️',
          html: welcomeHtml,
        }
      );
      emailSent = sendRes.ok;
      if (!sendRes.ok) {
        emailError = sendRes.error;
        console.error('[SUBSCRIBE] Welcome email failed to send:', sendRes.error);
      }
    } catch (welcomeErr: any) {
      emailError = welcomeErr?.message || String(welcomeErr);
      console.warn('[SUBSCRIBE] Welcome email dispatch warning:', welcomeErr);
    }

    return NextResponse.json(
      {
        message: responseMessage,
        emailSent,
        ...(emailError ? { emailError } : {}),
      },
      { status: responseMessage === 'subscribed' ? 201 : 200 }
    );

  } catch (error: any) {
    console.error('Subscribe error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to subscribe' },
      { status: 500 }
    );
  }
}
