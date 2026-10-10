import fs from 'fs';
import path from 'path';
import { executeRoutedLlmRequest } from './llm-router';
import { JobPriority } from './llm-config';

// In-memory cache for fast lookups
const memoryCache = new Map<string, string>();

// Path to persistent translations cache
const CACHE_FILE = path.resolve(process.cwd(), 'data', 'translations-cache.json');

const COMPACT_TRANSLATE_SYSTEM_PROMPT =
  'Translate this Indic news headline into a natural English headline (<=15 words). Output ONLY the translation, no quotes.';

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
    const isMarathi =
      sourceLang === 'mr' ||
      /[\u0933]|आहे|झाले|केले|नाही|म्हणाले|ठाकरे|शिंदे|पवार|पाऊस|पाणी|मुंबईत|पुण्यात|निवडणूक/i.test(text);
    return {
      isNonEnglish: true,
      langCode: isMarathi ? 'mr' : 'hi',
      langName: isMarathi ? 'Marathi' : 'Hindi',
    };
  }

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
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/gi, '')
    .replace(/^["'“‘]+|["'”’]+$/g, '')
    .replace(/^translation:\s*/i, '')
    .replace(/^english:\s*/i, '')
    .replace(/^headline:\s*/i, '')
    .trim();
}

/**
 * Translates a non-English news headline into a concise English gloss (max 15 words).
 * Routes through the quota-aware LLM router with content-hash caching.
 */
export async function getEnglishGloss(
  headline: string,
  sourceLang?: string,
  priority: JobPriority = 'interactive'
): Promise<{ englishGloss: string; originalLanguage: string; isTranslated: boolean; queued?: boolean }> {
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

  const res = await executeRoutedLlmRequest({
    jobType: 'headline_translation',
    priority,
    systemPrompt: COMPACT_TRANSLATE_SYSTEM_PROMPT,
    userPrompt: headline.trim(),
    isSensitive: false,
  });

  if (res.text) {
    const gloss = cleanTranslation(res.text);
    if (gloss.length >= 4 && !gloss.startsWith('/')) {
      saveCache(cacheKey, gloss);
      return {
        englishGloss: gloss,
        originalLanguage: detection.langCode.toUpperCase(),
        isTranslated: true,
      };
    }
  }

  // Graceful fallback: return original headline
  return {
    englishGloss: headline,
    originalLanguage: detection.langCode.toUpperCase(),
    isTranslated: false,
    queued: res.queued,
  };
}
