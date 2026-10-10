import assert from 'assert';
import {
  executeRoutedLlmRequest,
  executeMapReduceSummary,
  resetRouterStateForTests,
  loadQuotaState,
  canModelFitRequest,
  preprocessLlmInput,
  drainDeferredQueue,
  parseResetHeaderMs,
} from '../../lib/llm-router';
import { VERIFIED_LLM_CONFIG } from '../../lib/llm-config';

// Ensure test env vars are populated without real secrets
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'test-groq-key';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-gemini-key';
process.env.CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || 'test-cf-account';
process.env.CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || 'test-cf-token';
process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || 'test-or-key';

function createJsonResponse(status: number, body: any, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

async function runTests() {
  console.log('🧪 Running LLM Quota-Aware Router Unit Tests...\n');

  // 1. Pre-processing & Near-Duplicate Line Deduplication
  {
    const dirty = `
      <nav>Menu</nav>
      <p>Indian Police Round Up Protest Leaders and Lock Down Delhi - The New York Times</p>
      <p>Indian Police Round Up Protest Leaders and Lock Down Delhi | NYT</p>
      <p>Authorities imposed Section 144 and detained 40 organizers across central New Delhi.</p>
      <footer>All rights reserved</footer>
    `;
    const cleaned = preprocessLlmInput(dirty);
    const lines = cleaned.split('\n');
    assert.strictEqual(lines.length, 2, 'Should deduplicate near-identical headline lines and strip <nav>/<footer>');
    console.log('✅ Test 1 passed: Pre-processing strips HTML/boilerplate and deduplicates near-identical lines.');
  }

  // 2. Header Reset Duration Parser
  {
    assert.strictEqual(parseResetHeaderMs('2m52.8s'), 172800);
    assert.strictEqual(parseResetHeaderMs('180ms'), 180);
    assert.strictEqual(parseResetHeaderMs('3'), 3000);
    console.log('✅ Test 2 passed: Retry-After and x-ratelimit-reset-* duration parser.');
  }

  // 3. Cache Hits (SHA-256 Content-Hash Cache)
  {
    resetRouterStateForTests();
    let networkCalls = 0;
    const mockFetch: typeof fetch = async () => {
      networkCalls++;
      return createJsonResponse(
        200,
        {
          choices: [
            {
              message: {
                content: 'Police detained protest leaders and enforced a lockdown across New Delhi on Sunday.',
              },
            },
          ],
          usage: { total_tokens: 45 },
        },
        { 'x-ratelimit-remaining-requests': '999', 'x-ratelimit-remaining-tokens': '7955' }
      );
    };

    const res1 = await executeRoutedLlmRequest({
      jobType: 'short_medium',
      systemPrompt: 'Summarize.',
      userPrompt: '- Indian Police Round Up Protest Leaders in Delhi',
      fetchImpl: mockFetch,
    });
    assert.strictEqual(res1.status, 'ok');
    assert.strictEqual(res1.fromCache, false);
    assert.strictEqual(networkCalls, 1);

    // Second call with identical content + extra HTML whitespace should hit cache with 0 network calls
    const res2 = await executeRoutedLlmRequest({
      jobType: 'short_medium',
      systemPrompt: 'Summarize.',
      userPrompt: '  <p>- Indian Police Round Up Protest Leaders in Delhi</p>  ',
      fetchImpl: mockFetch,
    });
    assert.strictEqual(res2.status, 'cached');
    assert.strictEqual(res2.fromCache, true);
    assert.strictEqual(res2.text, res1.text);
    assert.strictEqual(networkCalls, 1, 'Cached call must not trigger a network request');
    console.log('✅ Test 3 passed: Content-hash cache hits prevent duplicate LLM calls.');
  }

  // 4. Failover Order, Retry on 429/500/Timeout, No Retry on 400, & Circuit Breaker
  {
    resetRouterStateForTests();
    const callLog: string[] = [];

    const mockFetch: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      const bodyObj = init?.body ? JSON.parse(init.body as string) : {};
      const modelId = bodyObj.model || (url.includes('gemini') ? 'gemini-3.5-flash-lite' : 'unknown');
      callLog.push(modelId);

      // First Groq model (openai/gpt-oss-20b) returns 429 daily limit -> immediate circuit break & failover
      if (modelId === 'openai/gpt-oss-20b') {
        return createJsonResponse(
          429,
          { error: { message: 'Rate limit reached for tokens per day (TPD)' } },
          { 'retry-after': '1' }
        );
      }

      // Second Groq model (qwen/qwen3.8-27b) returns 400 Bad Request -> must NOT retry on 400!
      if (modelId === 'qwen/qwen3.8-27b') {
        return createJsonResponse(400, { error: { message: 'Invalid request payload' } });
      }

      // Third Groq model (openai/gpt-oss-120b) fails once with 500, then succeeds on retry!
      if (modelId === 'openai/gpt-oss-120b') {
        const count = callLog.filter((m) => m === 'openai/gpt-oss-120b').length;
        if (count === 1) {
          return createJsonResponse(500, { error: { message: 'Internal server error' } }, { 'retry-after': '0.05' });
        }
        return createJsonResponse(200, {
          choices: [
            {
              message: {
                content: 'Heavy rains in Mumbai caused waterlogging and delayed suburban train services on Monday.',
              },
            },
          ],
          usage: { total_tokens: 52 },
        });
      }

      return createJsonResponse(500, {});
    };

    const res = await executeRoutedLlmRequest({
      jobType: 'short_medium',
      systemPrompt: 'Summarize.',
      userPrompt: '- Heavy rains hit Mumbai causing waterlogging',
      fetchImpl: mockFetch,
    });

    assert.strictEqual(res.status, 'ok');
    assert.strictEqual(res.provider, 'groq');
    assert.strictEqual(res.model, 'openai/gpt-oss-120b');
    assert.deepStrictEqual(
      callLog,
      ['openai/gpt-oss-20b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-120b'],
      'Should fail over across Groq models, never retry 400 or daily 429, and retry 500 once before succeeding'
    );

    const state = loadQuotaState();
    assert.ok(
      state.buckets['groq:openai/gpt-oss-20b'].coolingUntilMs > Date.now(),
      'Circuit breaker should mark daily-exhausted model as cooling'
    );
    console.log('✅ Test 4 passed: Failover order, 500 retry with backoff, no retry on 400, and circuit breaker.');
  }

  // 5. Emergency Buffer Protection, Quota Exhaustion -> Queued State, and Quota Reset Drain
  {
    resetRouterStateForTests();
    const state = loadQuotaState();

    // Simulate 90% usage on groq:openai/gpt-oss-20b (above 88% background ceiling, below 100% interactive cap)
    state.buckets['groq:openai/gpt-oss-20b'].requestsToday = 900;
    const bgFit = canModelFitRequest('groq:openai/gpt-oss-20b', 50, 50, 'background', false);
    const fgFit = canModelFitRequest('groq:openai/gpt-oss-20b', 50, 50, 'interactive', false);
    assert.strictEqual(bgFit.allowed, false, 'Background job must be blocked when inside 12% emergency buffer');
    assert.strictEqual(fgFit.allowed, true, 'Interactive user request must still be allowed in emergency buffer');

    // Now exhaust all buckets so every route fails -> job should be queued gracefully
    for (const [k, cfg] of Object.entries(VERIFIED_LLM_CONFIG)) {
      state.buckets[k].requestsToday = cfg.limits.rpd.operationalCeiling;
    }

    const exhaustedRes = await executeRoutedLlmRequest({
      jobType: 'short_medium',
      systemPrompt: 'Summarize.',
      userPrompt: '- ISRO launches new weather satellite from Sriharikota',
      hubId: 'hub-isro-1',
    });

    assert.strictEqual(exhaustedRes.status, 'queued_try_later');
    assert.strictEqual(exhaustedRes.queued, true);
    assert.ok(exhaustedRes.jobId, 'Exhausted job should receive a queue jobId');

    // Simulate quota reset time passing for Cloudflare Workers AI
    const cfBucket = state.buckets['cloudflare:@cf/meta/llama-3.1-8b-instruct-fast'];
    cfBucket.dailyResetAtMs = Date.now() - 1000;
    loadQuotaState(Date.now()); // Triggers automatic daily reset on cfBucket
    assert.strictEqual(cfBucket.requestsToday, 0, 'Daily counter must reset to 0 after dailyResetAtMs');

    // Drain the deferred queue using mocked Cloudflare response
    const drained = await drainDeferredQueue(5, async () =>
      createJsonResponse(
        200,
        {
          choices: [
            {
              message: {
                content: 'ISRO successfully launched a new weather observation satellite from Sriharikota.',
              },
            },
          ],
          usage: { total_tokens: 48, neurons: 1.8 },
        },
        { 'cf-ai-neurons': '1.8' }
      )
    );
    assert.strictEqual(drained, 1, 'Drained 1 deferred job after quota reset');
    console.log('✅ Test 5 passed: Emergency 12% buffer protection, graceful queue on exhaustion, and quota reset drain.');
  }

  // 6. Map-Reduce Chunking for Long Documents
  {
    resetRouterStateForTests();
    const seenJobSizes: number[] = [];
    const mockFetch: typeof fetch = async (_input, init) => {
      const body = JSON.parse(init?.body as string);
      seenJobSizes.push(body.max_tokens);
      return createJsonResponse(200, {
        choices: [
          {
            message: {
              content: 'The Reserve Bank of India kept the repo rate unchanged at 6.5 percent in Mumbai.',
            },
          },
        ],
        usage: { total_tokens: 60 },
      });
    };

    const longSentence = 'The Reserve Bank of India Monetary Policy Committee met in Mumbai to review inflation and GDP growth across states. ';
    const longArticle = Array.from({ length: 35 }, (_, i) => `Section ${i + 1}: ${longSentence}`).join('. ');

    const mrRes = await executeMapReduceSummary(longArticle, 'Write a neutral briefing.', {
      fetchImpl: mockFetch,
    });

    assert.strictEqual(mrRes.status, 'ok');
    assert.ok(seenJobSizes.includes(70), 'Should run chunk_summary steps with max_tokens=70');
    assert.ok(seenJobSizes.includes(110), 'Should run final_merge step with max_tokens=110');
    console.log('✅ Test 6 passed: Map-Reduce chunking splits long documents into chunk summaries + final merge.');
  }

  console.log('\n🎉 All 6 LLM Quota-Aware Router test suites passed!');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
