/**
 * Panchranga Site Configuration & Centralized URL Management
 */

export const SITE_NAME = 'Panchranga';
export const SITE_TAGLINE = 'Every Color of the Story';
export const SITE_DESCRIPTION =
  'Open-source multi-perspective Indian news aggregator clustering 96+ feeds across 13 languages into mainstream, grassroots, and public discourse lanes.';
export const PRODUCTION_URL = 'https://panchranga.app';

/**
 * Returns the canonical base URL for the active environment.
 * Ensures no trailing slash.
 */
export function getSiteUrl(): string {
  // 1. Explicit environment variable overrides
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (envUrl && typeof envUrl === 'string') {
    return envUrl.trim().replace(/\/+$/, '');
  }

  // 2. Netlify preview / branch deploy detection
  if (process.env.CONTEXT && process.env.CONTEXT !== 'production') {
    const netlifyUrl = process.env.DEPLOY_PRIME_URL || process.env.URL;
    if (netlifyUrl) {
      return netlifyUrl.trim().replace(/\/+$/, '');
    }
  }

  // 3. Canonical production URL
  return PRODUCTION_URL;
}

export const SITE_URL = getSiteUrl();

/**
 * Determines whether the current execution context is the production deployment.
 * Supports Netlify CONTEXT ('production', 'deploy-preview', 'branch-deploy') and standard NODE_ENV.
 */
export function isProduction(): boolean {
  if (process.env.CONTEXT) {
    return process.env.CONTEXT === 'production';
  }
  return process.env.NODE_ENV === 'production';
}
