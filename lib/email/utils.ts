/**
 * Masks an email address for privacy and security compliance.
 * e.g. "reader.name@domain.com" -> "r***e@domain.com"
 * Never log full subscriber emails.
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) {
    return '***';
  }

  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) return '***';

  if (localPart.length <= 2) {
    return `${localPart[0]}***@${domain}`;
  }

  const firstChar = localPart[0];
  const lastChar = localPart[localPart.length - 1];
  return `${firstChar}***${lastChar}@${domain}`;
}

/**
 * Returns the start (00:00:00.000) of the current Indian Standard Time (IST)
 * calendar day converted to UTC.
 * IST is UTC+05:30 with no daylight saving time.
 */
export function getStartOfCurrentIstDayUtc(now: Date = new Date()): Date {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const istDateString = formatter.format(now); // "YYYY-MM-DD"
  const [year, month, day] = istDateString.split('-').map(Number);

  // Midnight IST is 5 hours and 30 minutes before midnight UTC of that date
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istMidnightInUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - istOffsetMs);

  return istMidnightInUtc;
}

/**
 * Formats a Date object in IST for display in the newsletter header.
 */
export function formatIstDate(date: Date = new Date()): string {
  return date.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Builds RFC 8058 compliant headers for email newsletters.
 * List-Unsubscribe: <https://...>, <mailto:...>
 * List-Unsubscribe-Post: List-Unsubscribe=One-Click
 */
export function buildComplianceHeaders(
  recipientEmail: string,
  unsubscribeToken?: string,
  siteUrl?: string
): Record<string, string> {
  const baseSiteUrl = (siteUrl || process.env.NEXT_PUBLIC_SITE_URL || 'https://panchranga.vercel.app').replace(/\/+$/, '');
  const tokenParam = unsubscribeToken ? `?token=${encodeURIComponent(unsubscribeToken)}` : '';
  const httpsUrl = `${baseSiteUrl}/api/newsletter/unsubscribe${tokenParam}`;
  
  const mailtoAddress = process.env.GMAIL_USER || 'unsubscribe@panchranga.vercel.app';
  const mailtoUrl = `mailto:${mailtoAddress}?subject=Unsubscribe%20${encodeURIComponent(recipientEmail)}`;

  return {
    'List-Unsubscribe': `<${httpsUrl}>, <${mailtoUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

/**
 * Asynchronous pause utility.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
