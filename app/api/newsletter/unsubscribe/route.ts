import { createClient } from '@supabase/supabase-js';
import { buildUnsubscribeConfirmationEmailHTML, sendTransactionalEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key);
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  const emailParam = searchParams.get('email');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://panchranga.vercel.app';

  if (!token && !emailParam) {
    return new Response(renderErrorPage(siteUrl, 'Invalid or missing unsubscribe token.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const supabase = getSupabase();
  let unsubscribedEmail: string | null = emailParam || null;

  // Process real subscriber token if DB is available
  if (supabase) {
    try {
      if (token && UUID_REGEX.test(token)) {
        // Fetch subscriber email
        const { data: sub } = await supabase
          .from('newsletter_subscribers')
          .select('email, is_active')
          .eq('unsubscribe_token', token)
          .maybeSingle();

        if (sub?.email) {
          unsubscribedEmail = sub.email;
          await supabase
            .from('newsletter_subscribers')
            .update({ is_active: false })
            .eq('unsubscribe_token', token);
        }
      } else if (emailParam) {
        await supabase
          .from('newsletter_subscribers')
          .update({ is_active: false })
          .eq('email', emailParam.toLowerCase().trim());
      }
    } catch (dbErr) {
      console.warn('[UNSUBSCRIBE] Database update warning:', dbErr);
    }
  }

  // Send unsubscribe confirmation email
  if (unsubscribedEmail) {
    try {
      const confirmHtml = buildUnsubscribeConfirmationEmailHTML(siteUrl);
      await sendTransactionalEmail(
        { email: unsubscribedEmail },
        {
          subject: "You've been unsubscribed from Panchranga",
          html: confirmHtml,
        }
      );
      console.log('[UNSUBSCRIBE] Sent unsubscribe confirmation email to:', unsubscribedEmail);
    } catch (emailErr) {
      console.warn('[UNSUBSCRIBE] Failed to send confirmation email:', emailErr);
    }
  }

  // Render the polished unsubscribe page
  return new Response(renderUnsubscribeSuccessPage(siteUrl, unsubscribedEmail), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  let token = searchParams.get('token');
  let email: string | undefined;

  if (!token) {
    try {
      const body = await req.json();
      token = body?.token;
      email = body?.email;
    } catch {
      // Body may not be JSON
    }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://panchranga.vercel.app';
  const supabase = getSupabase();

  if (supabase && token && UUID_REGEX.test(token)) {
    try {
      const { data: sub } = await supabase
        .from('newsletter_subscribers')
        .select('email')
        .eq('unsubscribe_token', token)
        .maybeSingle();

      if (sub?.email) {
        email = sub.email;
      }

      await supabase
        .from('newsletter_subscribers')
        .update({ is_active: false })
        .eq('unsubscribe_token', token);
    } catch (dbErr) {
      console.warn('[UNSUBSCRIBE] POST database error:', dbErr);
    }
  }

  if (email) {
    try {
      const confirmHtml = buildUnsubscribeConfirmationEmailHTML(siteUrl);
      await sendTransactionalEmail(
        { email },
        {
          subject: "You've been unsubscribed from Panchranga",
          html: confirmHtml,
        }
      );
    } catch (emailErr) {
      console.warn('[UNSUBSCRIBE] POST confirmation email failed:', emailErr);
    }
  }

  return new Response('Unsubscribed successfully', {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

function renderUnsubscribeSuccessPage(siteUrl: string, email: string | null): string {
  const cleanSiteUrl = siteUrl.replace(/\/+$/, '');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Unsubscribed — Panchranga</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,700;1,6..72,400&display=swap" rel="stylesheet">
      <style>
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background: #F5F5F3;
          color: #1A1A1A;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 24px;
        }
        .card {
          background: #FFFFFF;
          border: 1px solid #E5E5E0;
          border-radius: 12px;
          max-width: 540px;
          width: 100%;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
          overflow: hidden;
        }
        .header {
          background: #1A1A1A;
          padding: 28px 36px;
        }
        .dots-row {
          display: flex;
          align-items: center;
          gap: 7px;
          margin-bottom: 12px;
        }
        .dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          display: inline-block;
        }
        .brand-title {
          font-family: 'Newsreader', Georgia, serif;
          font-size: 24px;
          font-weight: 700;
          color: #FFFFFF;
          letter-spacing: -0.3px;
        }
        .brand-subtitle {
          font-size: 10px;
          color: #9CA3AF;
          text-transform: uppercase;
          letter-spacing: 0.15em;
          margin-top: 4px;
        }
        .body-content {
          padding: 40px 36px;
        }
        h1 {
          font-family: 'Newsreader', Georgia, serif;
          font-size: 28px;
          font-weight: 700;
          color: #1A1A1A;
          line-height: 1.3;
          margin-bottom: 16px;
        }
        p {
          font-size: 15px;
          line-height: 1.65;
          color: #4A4A4A;
          margin-bottom: 16px;
        }
        .status-box {
          background: #FAFAF8;
          border: 1px solid #E5E5E0;
          border-radius: 8px;
          padding: 16px 20px;
          margin: 24px 0 32px 0;
          font-size: 14px;
          color: #4A4A4A;
        }
        .status-box strong {
          color: #1A1A1A;
        }
        .actions {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        @media (min-width: 480px) {
          .actions {
            flex-direction: row;
          }
        }
        .btn-primary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #1A1A1A;
          color: #FFFFFF;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          padding: 12px 24px;
          border-radius: 6px;
          transition: background 0.15s ease;
        }
        .btn-primary:hover {
          background: #333333;
        }
        .btn-secondary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #FAFAF8;
          color: #1A1A1A;
          border: 1px solid #E5E5E0;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          padding: 12px 24px;
          border-radius: 6px;
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .btn-secondary:hover {
          background: #F0F0EE;
          border-color: #D1D5DB;
        }
        .footer {
          padding: 20px 36px;
          border-top: 1px solid #E5E5E0;
          background: #FAFAF8;
          font-size: 12px;
          color: #9CA3AF;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="dots-row">
            <span class="dot" style="background-color: #4A56E2;"></span>
            <span class="dot" style="background-color: #00B8A9;"></span>
            <span class="dot" style="background-color: #F5A623;"></span>
            <span class="dot" style="background-color: #E84393;"></span>
            <span class="dot" style="background-color: #FF6B6B;"></span>
          </div>
          <div class="brand-title">Panchranga</div>
          <div class="brand-subtitle">पंचरंग · Every Color of the Story</div>
        </div>

        <div class="body-content">
          <h1>We're sorry to see you go.</h1>
          <p>You have been successfully unsubscribed from the Panchranga Daily newsletter.</p>
          <p>You will no longer receive our 7:00 AM IST daily coverage.</p>

          <div class="status-box">
            ${email ? `<strong>${email}</strong> has been removed from active sends.` : 'Your subscription has been deactivated.'}
            <br>
            A confirmation receipt has also been sent to your inbox.
          </div>

          <div class="actions">
            <a href="${cleanSiteUrl}" class="btn-primary">
              ← Return to Panchranga
            </a>
            <a href="${cleanSiteUrl}/#newsletter-footer" class="btn-secondary">
              Resubscribe anytime
            </a>
          </div>
        </div>

        <div class="footer">
          Open source · No editors · No paywall
        </div>
      </div>
    </body>
    </html>
  `;
}

function renderErrorPage(siteUrl: string, message: string): string {
  const cleanSiteUrl = siteUrl.replace(/\/+$/, '');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Unsubscribe Error — Panchranga</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background: #F5F5F3;
          color: #1A1A1A;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 24px;
        }
        .card {
          background: white;
          border: 1px solid #E5E5E0;
          border-radius: 12px;
          max-width: 480px;
          width: 100%;
          padding: 36px;
          text-align: center;
        }
        h1 { font-size: 22px; margin-bottom: 12px; }
        p { color: #6B7280; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
        a {
          display: inline-block;
          background: #1A1A1A;
          color: white;
          text-decoration: none;
          padding: 10px 20px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Unable to process unsubscribe</h1>
        <p>${message}</p>
        <a href="${cleanSiteUrl}">← Back to Panchranga</a>
      </div>
    </body>
    </html>
  `;
}
