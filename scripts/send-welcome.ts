import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { buildWelcomeEmailHTML, sendTransactionalEmail } from '../lib/email';
import { SITE_URL } from '../lib/config/site';

async function run() {
  const recipient = (process.argv[2] || process.env.TEST_EMAIL || 'ravivishwakarma5754@gmail.com').toLowerCase().trim();
  console.log('====================================================');
  console.log(`🚀 Sending Panchranga Onboarding / Welcome Email`);
  console.log(`Target: ${recipient}`);
  console.log('====================================================');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let unsubscribeToken: string | undefined;

  if (supabaseUrl && supabaseKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data } = await supabase
        .from('newsletter_subscribers')
        .select('unsubscribe_token')
        .eq('email', recipient)
        .maybeSingle();

      unsubscribeToken = data?.unsubscribe_token;
      if (unsubscribeToken) {
        console.log(`[SUBSCRIBER] Found existing subscriber with unsubscribe token: ${unsubscribeToken.slice(0, 8)}...`);
      }
    } catch (err: any) {
      console.warn('[DB] Could not query subscriber token:', err?.message);
    }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || SITE_URL;
  const welcomeHtml = buildWelcomeEmailHTML(siteUrl, unsubscribeToken);

  console.log(`[DISPATCH] Sending via primary provider (Resend priority)...`);
  const result = await sendTransactionalEmail(
    { email: recipient, unsubscribeToken },
    {
      from: 'Panchranga <welcome@panchranga.app>',
      replyTo: 'welcome@panchranga.app',
      subject: 'Welcome to Panchranga 🗞️',
      html: welcomeHtml,
    }
  );

  console.log('====================================================');
  if (result.ok) {
    console.log(`✅ Welcome email successfully sent to ${recipient}!`);
  } else {
    console.error(`❌ Failed to send welcome email: ${result.error}`);
  }
  console.log('====================================================');

  process.exit(result.ok ? 0 : 1);
}

run();
