import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { buildWelcomeEmailHTML, sendTransactionalEmail } from '@/lib/email';

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
      .select('id, is_active')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (selectErr) {
      console.error('[SUBSCRIBE] Error querying existing subscriber:', selectErr);
    }

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

        return NextResponse.json(
          { message: 'resubscribed' },
          { status: 200 }
        );
      }
    }

    // Insert new subscriber
    const { error: insertErr } = await supabase
      .from('newsletter_subscribers')
      .insert({
        email: cleanEmail,
        source: 'website'
      });

    if (insertErr) {
      console.error('[SUBSCRIBE] Error inserting subscriber:', insertErr);
      throw insertErr;
    }

    // Send welcome email directly using provider abstraction
    try {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://panchranga.vercel.app';
      const welcomeHtml = buildWelcomeEmailHTML(siteUrl);
      await sendTransactionalEmail(
        { email: cleanEmail },
        {
          subject: 'Welcome to Panchranga 🗞️',
          html: welcomeHtml,
        }
      );
    } catch (welcomeErr) {
      console.warn('[SUBSCRIBE] Welcome email dispatch warning:', welcomeErr);
    }

    return NextResponse.json(
      { message: 'subscribed' },
      { status: 201 }
    );

  } catch (error: any) {
    console.error('Subscribe error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to subscribe' },
      { status: 500 }
    );
  }
}
