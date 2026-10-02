import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');

  if (!token) {
    return new Response('Invalid unsubscribe link', { status: 400 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return new Response('Database credentials not configured', { status: 500 });
  }

  const { error } = await supabase
    .from('newsletter_subscribers')
    .update({ is_active: false })
    .eq('unsubscribe_token', token);

  if (error) {
    console.error('Unsubscribe error:', error);
    return new Response('Something went wrong', { status: 500 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://panchranga.vercel.app';

  // Return a simple HTML confirmation page
  return new Response(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Unsubscribed — Panchranga</title>
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
          background: #FAFAF8;
        }
        .box {
          text-align: center;
          padding: 40px;
          max-width: 400px;
        }
        h1 { 
          font-size: 24px; 
          color: #1A1A1A;
          margin-bottom: 12px;
        }
        p { color: #6B6B6B; line-height: 1.6; }
        a { 
          color: #C0392B; 
          text-decoration: none;
          font-weight: 600;
        }
      </style>
    </head>
    <body>
      <div class="box">
        <h1>You've been unsubscribed</h1>
        <p>You won't receive any more emails from Panchranga.</p>
        <p style="margin-top: 20px">
          <a href="${siteUrl}">
            ← Back to Panchranga
          </a>
        </p>
      </div>
    </body>
    </html>
  `, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  let token = searchParams.get('token');

  if (!token) {
    try {
      const body = await req.json();
      token = body?.token;
    } catch {
      // Body may not be JSON
    }
  }

  if (!token) {
    return new Response('Invalid unsubscribe link', { status: 400 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return new Response('Database credentials not configured', { status: 500 });
  }

  const { error } = await supabase
    .from('newsletter_subscribers')
    .update({ is_active: false })
    .eq('unsubscribe_token', token);

  if (error) {
    console.error('Unsubscribe error:', error);
    return new Response('Something went wrong', { status: 500 });
  }

  return new Response('Unsubscribed successfully', {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

