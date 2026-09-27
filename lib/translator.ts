import fs from 'fs';
import path from 'path';

// Cooldown tracking for translation cascade
let groqCooldownUntil = 0;
let geminiCooldownUntil = 0;
let openRouterCooldownUntil = 0;

// In-memory cache for fast lookups
const memoryCache = new Map<string, string>();

// Path to persistent translations cache
const CACHE_FILE = path.resolve(process.cwd(), 'data', 'translations-cache.json');

// Initialize cache from disk if available
function initCache() {
  if (memoryCache.size > 0) return;
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      for (const [key, val] of Object.entries(data)) {
        if (typeof val === 'string') {
          memoryCache.set(key, val);
        }
      }
    }
  } catch (err) {
    console.warn('⚠️ Could not load translations cache:', err);
  }
}

// Persist cache to disk
function saveCache(key: string, value: string) {
  memoryCache.set(key, value);
  try {
    const dataDir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const currentData = fs.existsSync(CACHE_FILE)
      ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'))
      : {};
    currentData[key] = value;
    fs.writeFileSync(CACHE_FILE, JSON.stringify(currentData, null, 2), 'utf-8');
  } catch (err) {
    // Non-fatal if disk write fails
    console.warn('⚠️ Could not persist translation to disk:', err);
  }
}

export interface ScriptDetectionResult {
  isNonEnglish: boolean;
  langCode: string;
  langName: string;
}

/**
 * Detects whether text contains Indic / non-Latin scripts and returns language code and name.
 */
export function detectScriptLanguage(text: string, sourceLang?: string): ScriptDetectionResult {
  if (!text) {
    return { isNonEnglish: false, langCode: 'en', langName: 'English' };
  }

  // Indic unicode ranges
  if (/[\u0C00-\u0C7F]/.test(text)) {
    return { isNonEnglish: true, langCode: 'te', langName: 'Telugu' };
  }
  if (/[\u0B80-\u0BFF]/.test(text)) {
    return { isNonEnglish: true, langCode: 'ta', langName: 'Tamil' };
  }
  if (/[\u0D00-\u0D7F]/.test(text)) {
    return { isNonEnglish: true, langCode: 'ml', langName: 'Malayalam' };
  }
  if (/[\u0C80-\u0CFF]/.test(text)) {
    return { isNonEnglish: true, langCode: 'kn', langName: 'Kannada' };
  }
  if (/[\u0A80-\u0AFF]/.test(text)) {
    return { isNonEnglish: true, langCode: 'gu', langName: 'Gujarati' };
  }
  if (/[\u0980-\u09FF]/.test(text)) {
    return { isNonEnglish: true, langCode: 'bn', langName: 'Bengali' };
  }
  if (/[\u0A00-\u0A7F]/.test(text)) {
    return { isNonEnglish: true, langCode: 'pa', langName: 'Punjabi' };
  }
  if (/[\u0900-\u097F]/.test(text)) {
    // Devanagari script is shared by Marathi and Hindi.
    // U+0933 (ळ - LLA) is uniquely Marathi. Common suffixes and words also identify Marathi.
    const isMarathi =
      sourceLang === 'mr' ||
      /[\u0933]|आहे|झाले|केले|नाही|म्हणाले|ठाकरे|शिंदे|पवार|पाऊस|पाणी|मुंबईत|पुण्यात|निवडणूक/i.test(text);
    return {
      isNonEnglish: true,
      langCode: isMarathi ? 'mr' : 'hi',
      langName: isMarathi ? 'Marathi' : 'Hindi',
    };
  }

  // If source explicitly says it's non-English but script wasn't caught
  if (sourceLang && sourceLang !== 'en' && sourceLang !== 'all') {
    return { isNonEnglish: true, langCode: sourceLang, langName: sourceLang.toUpperCase() };
  }

  return { isNonEnglish: false, langCode: 'en', langName: 'English' };
}

/**
 * Strips quotes, prefixes, and markdown from LLM translations.
 */
function cleanTranslation(text: string): string {
  return text
    .replace(/^["'“‘]+|["'”’]+$/g, '')
    .replace(/^translation:\s*/i, '')
    .replace(/^english:\s*/i, '')
    .replace(/^headline:\s*/i, '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim();
}

/**
 * Translates a non-English news headline into a concise English gloss (max 15 words).
 * Returns the original headline if already in English.
 */
export async function getEnglishGloss(
  headline: string,
  sourceLang?: string
): Promise<{ englishGloss: string; originalLanguage: string; isTranslated: boolean }> {
  initCache();

  if (!headline || !headline.trim()) {
    return { englishGloss: '', originalLanguage: 'en', isTranslated: false };
  }

  const detection = detectScriptLanguage(headline, sourceLang);
  if (!detection.isNonEnglish) {
    return { englishGloss: headline, originalLanguage: 'en', isTranslated: false };
  }

  const cacheKey = `${detection.langCode}:${headline.trim()}`;
  if (memoryCache.has(cacheKey)) {
    return {
      englishGloss: memoryCache.get(cacheKey)!,
      originalLanguage: detection.langCode.toUpperCase(),
      isTranslated: true,
    };
  }

  const groqKey = process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY || process.env.NEXT_PUBLIC_OPENROUTER_API_KEY;

  const systemPrompt =
    'You are a news translator for an Indian press aggregator. Translate this Indic language headline into a concise, natural English headline (max 15 words). Return ONLY the direct English translation without explanations, introductory text, or quotation marks.';

  // 1. Try Groq (ultra-fast inference, 3500ms timeout)
  if (groqKey && Date.now() > groqCooldownUntil) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: headline },
          ],
          max_tokens: 50,
          temperature: 0.1,
        }),
        signal: AbortSignal.timeout(3500),
      });

      if (response.ok) {
        const json = await response.json();
        const text = json.choices?.[0]?.message?.content?.trim();
        if (text) {
          const gloss = cleanTranslation(text);
          saveCache(cacheKey, gloss);
          return {
            englishGloss: gloss,
            originalLanguage: detection.langCode.toUpperCase(),
            isTranslated: true,
          };
        }
      } else if (response.status === 429) {
        groqCooldownUntil = Date.now() + 60 * 1000;
      }
    } catch (e) {
      console.warn('⚠️ Groq headline translation failed or timed out:', e);
    }
  }

  // 2. Try Gemini Flash (Generous free tier quota)
  if (geminiKey && Date.now() > geminiCooldownUntil) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `${systemPrompt}\n\nHeadline: ${headline}\nEnglish Translation:`,
                  },
                ],
              },
            ],
            generationConfig: { maxOutputTokens: 60, temperature: 0.1 },
          }),
          signal: AbortSignal.timeout(3500),
        }
      );

      if (response.ok) {
        const json = await response.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) {
          const gloss = cleanTranslation(text);
          saveCache(cacheKey, gloss);
          return {
            englishGloss: gloss,
            originalLanguage: detection.langCode.toUpperCase(),
            isTranslated: true,
          };
        }
      } else if (response.status === 429) {
        geminiCooldownUntil = Date.now() + 60 * 1000;
      }
    } catch (e) {
      console.warn('⚠️ Gemini headline translation failed or timed out:', e);
    }
  }

  // 3. Try OpenRouter
  if (openrouterKey && Date.now() > openRouterCooldownUntil) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openrouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://panchranga.vercel.app',
          'X-Title': 'Panchranga Translator',
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-3.1-8b-instruct:free',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: headline },
          ],
          max_tokens: 50,
          temperature: 0.1,
        }),
        signal: AbortSignal.timeout(3500),
      });

      if (response.ok) {
        const json = await response.json();
        const text = json.choices?.[0]?.message?.content?.trim();
        if (text) {
          const gloss = cleanTranslation(text);
          saveCache(cacheKey, gloss);
          return {
            englishGloss: gloss,
            originalLanguage: detection.langCode.toUpperCase(),
            isTranslated: true,
          };
        }
      } else if (response.status === 429) {
        openRouterCooldownUntil = Date.now() + 60 * 1000;
      }
    } catch (e) {
      console.warn('⚠️ OpenRouter translation failed or timed out:', e);
    }
  }

  // Graceful fallback: return original headline
  return {
    englishGloss: headline,
    originalLanguage: detection.langCode.toUpperCase(),
    isTranslated: false,
  };
}
