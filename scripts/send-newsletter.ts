import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { sendDailyNewsletter } from '../lib/email';

async function run() {
  console.log('====================================================');
  console.log('🚀 Panchranga Daily Newsletter Pipeline Triggered');
  console.log('====================================================');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase credentials missing (NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required).');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const dryRun =
    process.env.DRY_RUN === 'true' ||
    process.env.DRY_RUN === '1';

  const testRecipientsRaw = process.env.TEST_RECIPIENTS;
  const testRecipients = testRecipientsRaw
    ? testRecipientsRaw.split(',').map((e) => e.trim()).filter(Boolean)
    : undefined;

  try {
    const result = await sendDailyNewsletter({
      supabase,
      dryRun,
      testRecipients,
    });

    console.log(`[RESULT] ${result.message}`);
    console.log(`[RESULT] Stories: ${result.storiesCount} | Sent: ${result.sent} | Deferred: ${result.deferred} | Failed: ${result.failed}`);

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Newsletter execution failed with error:', error?.message || error);
    process.exit(1);
  }
}

run();
