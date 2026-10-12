import { TopicHub } from './types';
import { extractArticleText } from './article-extractor';
import {
  executeRoutedLlmRequest,
  executeMapReduceSummary,
  preprocessLlmInput,
  estimateTokens,
  loadQuotaState,
  saveQuotaState,
} from './llm-router';
import { JobPriority } from './llm-config';

export const MANDATORY_DISCLAIMER =
  'This summary is AI-generated from public headlines and may not capture full context. Read the original sources.';

const SENSITIVE_KEYWORDS = [
  'communal violence',
  'communal riot',
  'sectarian violence',
  'mob lynching',
  'mob violence',
  'hate speech',
  'sub-judice',
  'ongoing trial',
  'curfew imposed',
];

export const PROTEST_KEYWORDS = [
  // English
  'protest',
  'protests',
  'protester',
  'protesters',
  'protesting',
  'demonstration',
  'demonstrators',
  'agitation',
  'agitators',
  'dharna',
  'bandh',
  'bharat bandh',
  'chakka jam',
  'gherao',
  'hartal',
  'morcha',
  'padayatra',
  'hunger strike',
  'fast unto death',
  'sit-in',
  'tear gas',
  'lathi charge',
  'lathicharge',
  'water cannon',
  'road blockade',
  'rail roko',
  'rasta roko',
  // Hindi
  'प्रदर्शन',
  'विरोध प्रदर्शन',
  'प्रदर्शनकारी',
  'आंदोलन',
  'धरना',
  'चक्का जाम',
  'भारत बंद',
  'घेराव',
  'हड़ताल',
  'भूख हड़ताल',
  'अनशन',
  'लाठीचार्ज',
  'मोर्चा',
  // Marathi
  'उपोषण',
  'ठिय्या',
  'रास्ता रोको',
  'निदर्शने',
  'धरणे',
  // Tamil
  'போராட்டம்',
  'ஆர்ப்பாட்டம்',
  'முற்றுகை',
  'உண்ணாவிரதம்',
  'மறியல்',
  'பந்த்',
  // Telugu
  'నిరసన',
  'ఆందోళన',
  'ధర్నా',
  'బంద్',
  'రాస్తారోకో',
  'దీక్ష',
  // Kannada
  'ಪ್ರತಿಭಟನೆ',
  'ಧರಣಿ',
  'ಬಂದ್',
  'ಮುಷ್ಕರ',
  'ಹೋರಾಟ',
  // Malayalam
  'പ്രതിഷേധം',
  'സമരം',
  'ഹർത്താൽ',
  'ധർണ്ണ',
  'ബന്ദ്',
  'ഉപരോധം',
  // Gujarati
  'આંદોલન',
  'ધરણા',
  'દેખાવો',
  // Bengali
  'বিক্ষোভ',
  'আন্দোলন',
  'ধর্ণা',
  'বনধ',
  'ধর্মঘট',
  'অবরোধ',
  // Punjabi
  'ਪ੍ਰਦਰਸ਼ਨ',
  'ਧਰਨਾ',
  'ਅੰਦੋਲਨ',
  'ਮੋਰਚਾ',
];

const COMPACT_SYSTEM_PROMPT =
  'Neutral news editor. Write a 1-2 sentence factual briefing (<=35 words) strictly from the reports. Plain English, no source names, no quotes, no invented facts.';

export interface SummaryResult {
  summary: string | null;
  isFlagged: boolean;
  isProtest?: boolean;
  flagReason?: string;
  queued?: boolean;
  status?: 'ok' | 'cached' | 'trivial_bypass' | 'queued_try_later' | 'flagged';
  fromCache?: boolean;
  providerUsed?: string;
}

export interface SummarizeOptions {
  priority?: JobPriority;
  fetchImpl?: typeof fetch;
}

function matchesFilterKeyword(text: string, keyword: string): boolean {
  const kwLower = keyword.toLowerCase().trim();
  if (/[^\x00-\x7F]/.test(kwLower)) {
    return text.includes(kwLower);
  }
  const escaped = kwLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'i');
  return regex.test(text);
}

/**
 * Checks if a Topic Hub contains sensitive high-stakes topics that require bypassing AI summarization (Sources-Only Mode).
 */
export function checkSensitiveBypass(hub: TopicHub): boolean {
  const fullText = `${hub.title} ${hub.english_gloss || ''} ${(hub.items || [])
    .map((i) => `${i.title} ${i.english_gloss || ''} ${i.raw_summary || ''}`)
    .join(' ')}`.toLowerCase();

  return SENSITIVE_KEYWORDS.some((keyword) => fullText.includes(keyword));
}

/**
 * Checks if a Topic Hub covers a protest, agitation, or demonstration so it can be flagged as sensitive
 * and routed exclusively to privacy-safe, non-training LLM providers (Groq / Cloudflare).
 */
export function checkProtestFilter(hub: TopicHub): boolean {
  const fullText = `${hub.title} ${hub.english_gloss || ''} ${(hub.items || [])
    .map((i) => `${i.title} ${i.english_gloss || ''} ${i.raw_summary || ''} ${i.og_description || ''}`)
    .join(' ')}`.toLowerCase();

  return PROTEST_KEYWORDS.some((keyword) => matchesFilterKeyword(fullText, keyword));
}

/**
 * Clean headline helper: strips leading/trailing quotes and trailing publisher labels (" - The New York Times", " | NDTV").
 */
export function cleanHeadline(title: string): string {
  if (!title) return '';
  let cleaned = title.replace(/^["'“‘]+|["'”’]+$/g, '').trim();
  cleaned = cleaned.replace(/\s*\|\s*.*$/, '');
  cleaned = cleaned.replace(/\s+-\s+[A-Z][A-Za-z0-9\s.&'-]{2,35}$/, '');
  cleaned = cleaned.replace(/^Mainstream media coverage highlights\s*/i, '');
  cleaned = cleaned.replace(/\s*as reported by.*$/i, '');
  cleaned = cleaned.replace(/&amp;/g, '&');
  cleaned = cleaned.replace(/&quot;/g, '"');
  cleaned = cleaned.replace(/&#39;/g, "'");
  cleaned = cleaned.replace(/&lt;/g, '<');
  cleaned = cleaned.replace(/&gt;/g, '>');
  cleaned = cleaned.replace(/&nbsp;/g, ' ');
  return cleaned.trim();
}

/**
 * Clean article raw summary/description: strips HTML tags, entities, boilerplate
 */
export function cleanSummary(raw: string): string {
  if (!raw) return '';
  let cleaned = raw.replace(/<[^>]*>?/gm, ' ');
  cleaned = cleaned.replace(/&amp;/g, '&');
  cleaned = cleaned.replace(/&quot;/g, '"');
  cleaned = cleaned.replace(/&#39;/g, "'");
  cleaned = cleaned.replace(/&lt;/g, '<');
  cleaned = cleaned.replace(/&gt;/g, '>');
  cleaned = cleaned.replace(/&nbsp;/g, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  cleaned = cleaned.replace(/(?:read more|continue reading|click here for more|full coverage)[\s\S]*$/i, '').trim();
  return cleaned;
}

/**
 * Cleans raw LLM output before validation.
 */
export function cleanGeneratedText(rawText: string): string {
  return rawText
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/gi, '')
    .replace(/^["'“‘]+|["'”’]+$/g, '')
    .replace(/^(?:neutral briefing|briefing|summary):\s*/i, '')
    .replace(/^Mainstream media coverage highlights\s*/i, '')
    .replace(/\s*as reported by.*$/i, '')
    .trim();
}

/**
 * Validates that an LLM output is a genuine news summary and not leaked chain-of-thought or rubric text.
 */
export function isValidAiSummary(text: string): boolean {
  if (!text || text.length < 20) return false;
  const lower = text.toLowerCase();
  if (
    text.startsWith('/') ||
    text.startsWith('*') ||
    text.startsWith('#') ||
    lower.includes('word count') ||
    lower.includes('<= 35') ||
    lower.includes('<=35') ||
    lower.includes('thinking process') ||
    lower.includes('analyze the request') ||
    lower.includes('neutral news editor') ||
    lower.includes('constraint:') ||
    lower.includes('no factual news briefing can be generated')
  ) {
    return false;
  }
  return true;
}

/**
 * Generates a neutral, guardrailed 1-2 sentence summary describing what happened in plain neutral English (max 35 words).
 */
export async function generateNeutralSummary(
  hub: TopicHub,
  options: SummarizeOptions = {}
): Promise<SummaryResult> {
  const items = hub.items || [];
  const primaryTitle = cleanHeadline(hub.title || items[0]?.title || '');

  // Extract best fallback from article description if available
  const rawDesc = items.find((i) => i.raw_summary || i.og_description);
  const bestSnippet = rawDesc ? cleanSummary(rawDesc.raw_summary || rawDesc.og_description || '') : '';
  const firstSentence = bestSnippet ? (bestSnippet.split(/(?<=[.?!])\s+/)[0] || bestSnippet).slice(0, 180) : '';
  const defaultFallback =
    firstSentence.length > 25 && firstSentence.toLowerCase() !== primaryTitle.toLowerCase()
      ? firstSentence
      : primaryTitle;

  if (checkSensitiveBypass(hub)) {
    return {
      summary: primaryTitle,
      isFlagged: true,
      status: 'flagged',
      flagReason:
        'AI Summary bypassed for high-stakes sensitive topic. Displaying verified headline only.',
    };
  }

  const isProtest = checkProtestFilter(hub);

  // Trivial input bypass: skip LLM entirely when there are 0 items or a single short item with no additional context
  if (items.length === 0 || (items.length === 1 && (!bestSnippet || bestSnippet.length < 40))) {
    const state = loadQuotaState();
    state.telemetry.trivialBypasses++;
    saveQuotaState();
    return {
      summary: defaultFallback,
      isFlagged: false,
      isProtest,
      status: 'trivial_bypass',
    };
  }

  // Select up to 6 representative items prioritizing diverse lanes
  let selectedItems = items;
  if (items.length > 6) {
    const mainstream = items.filter((i) => (i.lane || i.sources?.lane || i.source?.lane) === 'mainstream');
    const grassroots = items.filter((i) => (i.lane || i.sources?.lane || i.source?.lane) === 'grassroots');
    const discourse = items.filter((i) => (i.lane || i.sources?.lane || i.source?.lane) === 'discourse');

    const picked: typeof items = [];
    picked.push(...mainstream.slice(0, 2));
    picked.push(...grassroots.slice(0, 2));
    picked.push(...discourse.slice(0, 2));

    const pickedUrls = new Set(picked.map((p) => p.id || p.url));
    for (const it of items) {
      if (picked.length >= 6) break;
      if (!pickedUrls.has(it.id || it.url)) {
        picked.push(it);
        pickedUrls.add(it.id || it.url);
      }
    }
    selectedItems = picked;
  }

  // Build deduplicated lines so identical syndicated headlines are not repeated
  const rawReportLines = selectedItems.map((i) => {
    const title = cleanHeadline(i.title);
    const snippet = i.raw_summary ? cleanSummary(i.raw_summary).slice(0, 110) : '';
    if (snippet && snippet.toLowerCase() !== title.toLowerCase() && !title.toLowerCase().includes(snippet.toLowerCase().slice(0, 35))) {
      return `- ${title}: ${snippet}`;
    }
    return `- ${title}`;
  });

  const dedupedReports = preprocessLlmInput(rawReportLines.join('\n'));

  // Only scrape webpage text if deduplicated headlines/snippets have sparse context (< 220 chars)
  // and this is not a mocked unit test
  let articleExcerpt = '';
  if (dedupedReports.length < 220 && items[0]?.url && !options.fetchImpl) {
    try {
      const fullArticleText = await Promise.race([
        extractArticleText(items[0].url, 2200),
        new Promise<string | null>((resolve) => setTimeout(() => resolve(null), 2200)),
      ]);
      if (fullArticleText) {
        articleExcerpt = `\nExcerpt: ${preprocessLlmInput(fullArticleText).slice(0, 650)}`;
      }
    } catch {}
  }

  const userPrompt = `${dedupedReports}${articleExcerpt}`;
  const totalInputTokens = estimateTokens(userPrompt);

  // Use map-reduce chunking if input is long (> 850 tokens)
  const routerRes =
    totalInputTokens > 850
      ? await executeMapReduceSummary(userPrompt, COMPACT_SYSTEM_PROMPT, {
          priority: options.priority || 'interactive',
          isSensitive: isProtest,
          hubId: hub.id,
          fetchImpl: options.fetchImpl,
          validator: (txt) => isValidAiSummary(cleanGeneratedText(txt)),
        })
      : await executeRoutedLlmRequest(
          {
            jobType: totalInputTokens > 2000 ? 'long_input' : 'short_medium',
            priority: options.priority || 'interactive',
            systemPrompt: COMPACT_SYSTEM_PROMPT,
            userPrompt,
            isSensitive: isProtest,
            hubId: hub.id,
            fetchImpl: options.fetchImpl,
          },
          (txt) => isValidAiSummary(cleanGeneratedText(txt))
        );

  if (routerRes.text) {
    const cleaned = cleanGeneratedText(routerRes.text);
    if (isValidAiSummary(cleaned)) {
      return {
        summary: cleaned,
        isFlagged: false,
        isProtest,
        queued: false,
        status: routerRes.status,
        fromCache: routerRes.fromCache,
        providerUsed: routerRes.provider ? `${routerRes.provider}:${routerRes.model}` : undefined,
      };
    }
  }

  // Every route exhausted or deferred -> return graceful fallback with queued flag
  return {
    summary: defaultFallback,
    isFlagged: false,
    isProtest,
    queued: routerRes.queued,
    status: routerRes.status,
    fromCache: false,
  };
}
