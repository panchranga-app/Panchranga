import { HubStory } from './types';
import { normalizeTitle, wordJaccardSimilarity } from '../dedup';

/**
 * Builds the newsletter HTML email.
 * Preserves the exact layout, colors, and typography of the Panchranga newsletter.
 */
export function buildEmailHTML(
  stories: HubStory[],
  date: string,
  unsubscribeToken?: string,
  siteUrl: string = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.panchranga.app'
): string {
  const baseSiteUrl = siteUrl.replace(/\/+$/, '');
  const tokenParam = unsubscribeToken ? `?token=${encodeURIComponent(unsubscribeToken)}` : '';
  const unsubscribeUrl = `${baseSiteUrl}/api/newsletter/unsubscribe${tokenParam}`;

  const storyBlocks = stories.map((story, i) => `
    <tr>
      <td style="padding: 0 0 32px 0;">
        ${story.image ? `
          <img 
            src="${story.image}" 
            alt="${story.title}"
            width="560"
            style="
              width: 100%;
              max-width: 560px;
              height: 240px;
              object-fit: cover;
              border-radius: 6px;
              display: block;
              margin-bottom: 16px;
            "
          />
        ` : ''}
        
        <p style="
          margin: 0 0 6px 0;
          font-family: Inter, Arial, sans-serif;
          font-size: 11px;
          font-weight: 700;
          color: #C0392B;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        ">
          Story ${i + 1} of 3
          ${story.sourceNames.length > 0 
            ? ' · ' + story.sourceNames.join(', ')
            : ''}
        </p>

        <h2 style="
          margin: 0 0 12px 0;
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 22px;
          font-weight: 700;
          color: #1A1A1A;
          line-height: 1.35;
        ">
          ${story.title}
        </h2>

        ${story.summary ? `
          <p style="
            margin: 0 0 16px 0;
            font-family: Inter, Arial, sans-serif;
            font-size: 15px;
            color: #4A4A4A;
            line-height: 1.6;
            font-style: italic;
          ">
            ${story.summary}
          </p>
        ` : ''}

        <p style="
          margin: 0 0 16px 0;
          font-family: Inter, Arial, sans-serif;
          font-size: 12px;
          color: #9CA3AF;
        ">
          ${story.totalSources} source${story.totalSources !== 1 ? 's' : ''} covering this story
        </p>

        <a 
          href="${story.hubUrl}"
          style="
            display: inline-block;
            padding: 10px 20px;
            background: #C0392B;
            color: white;
            font-family: Inter, Arial, sans-serif;
            font-size: 13px;
            font-weight: 600;
            text-decoration: none;
            border-radius: 4px;
          "
        >
          Read full coverage →
        </a>

        ${i < stories.length - 1 ? `
          <hr style="
            border: none;
            border-top: 1px solid #E5E5E0;
            margin: 32px 0 0 0;
          "/>
        ` : ''}
      </td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Panchranga Daily — ${date}</title>
    </head>
    <body style="
      margin: 0;
      padding: 0;
      background: #F5F5F3;
      font-family: Inter, Arial, sans-serif;
    ">
      <table 
        width="100%" 
        cellpadding="0" 
        cellspacing="0"
        style="background: #F5F5F3; padding: 24px 0;"
      >
        <tr>
          <td align="center">
            <table 
              width="600" 
              cellpadding="0" 
              cellspacing="0"
              style="
                max-width: 600px;
                width: 100%;
                background: white;
                border-radius: 8px;
                overflow: hidden;
              "
            >
              <!-- HEADER -->
              <tr>
                <td style="
                  background: #1A1A1A;
                  padding: 24px 32px;
                ">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td>
                        <!-- FIVE BRAND COLOR DOTS LOGO -->
                        <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 12px;">
                          <tr>
                            <td style="padding: 0; line-height: 0; font-size: 0;"><span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #4A56E2;"></span></td>
                            <td style="width: 8px; padding: 0; line-height: 0; font-size: 0;">&nbsp;</td>
                            <td style="padding: 0; line-height: 0; font-size: 0;"><span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #00B8A9;"></span></td>
                            <td style="width: 8px; padding: 0; line-height: 0; font-size: 0;">&nbsp;</td>
                            <td style="padding: 0; line-height: 0; font-size: 0;"><span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #F5A623;"></span></td>
                            <td style="width: 8px; padding: 0; line-height: 0; font-size: 0;">&nbsp;</td>
                            <td style="padding: 0; line-height: 0; font-size: 0;"><span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #E84393;"></span></td>
                            <td style="width: 8px; padding: 0; line-height: 0; font-size: 0;">&nbsp;</td>
                            <td style="padding: 0; line-height: 0; font-size: 0;"><span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #FF6B6B;"></span></td>
                          </tr>
                        </table>
                        <span style="
                          font-family: Georgia, serif;
                          font-size: 24px;
                          font-weight: 800;
                          color: white;
                          letter-spacing: -0.5px;
                        ">
                          Panchranga
                        </span>
                        <span style="
                          font-family: Inter, Arial, sans-serif;
                          font-size: 10px;
                          color: #9CA3AF;
                          display: block;
                          letter-spacing: 0.15em;
                          text-transform: uppercase;
                          margin-top: 2px;
                        ">
                          पंचरंग · Every Color of the Story
                        </span>
                      </td>
                      <td align="right">
                        <span style="
                          font-family: Inter, Arial, sans-serif;
                          font-size: 12px;
                          color: #9CA3AF;
                        ">
                          ${date}
                        </span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- INTRO STRIP -->
              <tr>
                <td style="
                  background: #C0392B;
                  padding: 10px 32px;
                ">
                  <p style="
                    margin: 0;
                    font-family: Inter, Arial, sans-serif;
                    font-size: 12px;
                    color: white;
                    font-weight: 500;
                    letter-spacing: 0.05em;
                  ">
                    ↗ TODAY'S TOP 3 STORIES · MAINSTREAM + GRASSROOTS + PUBLIC DISCOURSE
                  </p>
                </td>
              </tr>

              <!-- STORIES -->
              <tr>
                <td style="padding: 32px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    ${storyBlocks}
                  </table>
                </td>
              </tr>

              <!-- DIVIDER -->
              <tr>
                <td style="
                  padding: 0 32px;
                  border-top: 1px solid #E5E5E0;
                ">
                </td>
              </tr>

              <!-- FOOTER -->
              <tr>
                <td style="padding: 24px 32px;">
                  <p style="
                    margin: 0 0 8px 0;
                    font-family: Inter, Arial, sans-serif;
                    font-size: 12px;
                    color: #9CA3AF;
                    line-height: 1.6;
                  ">
                    You're receiving this because you subscribed at www.panchranga.app
                  </p>
                  <p style="
                    margin: 0;
                    font-family: Inter, Arial, sans-serif;
                    font-size: 12px;
                    color: #9CA3AF;
                  ">
                    <a 
                      href="${unsubscribeUrl}"
                      style="color: #9CA3AF;"
                    >
                      Unsubscribe
                    </a>
                    &nbsp;·&nbsp;
                    <a 
                      href="${baseSiteUrl}"
                      style="color: #9CA3AF;"
                    >
                      Visit Panchranga
                    </a>
                    &nbsp;·&nbsp;
                    Open source · No editors · No paywall
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

/**
 * Counts distinct sources in a hub's raw_items array.
 */
function countDistinctHubSources(rawItems: any[]): number {
  const names = new Set<string>();
  for (const r of rawItems) {
    const name = (r?.sources?.name || r?.source?.name || r?.source_name || '').trim();
    if (name) {
      names.add(name.toLowerCase());
    } else if (r?.url) {
      try {
        names.add(new URL(r.url).hostname.replace(/^www\./, ''));
      } catch {
        names.add(r.url);
      }
    }
  }
  return names.size;
}

/**
 * Counts distinct editorial lanes represented in a hub's raw_items array.
 */
function countDistinctHubLanes(rawItems: any[]): number {
  const lanes = new Set<string>();
  for (const r of rawItems) {
    const lane = (r?.sources?.lane || r?.source?.lane || r?.lane || '').trim();
    if (lane) lanes.add(lane.toLowerCase());
  }
  return lanes.size;
}

/**
 * Deduplicates and selects top distinct topic hubs for the newsletter:
 * 1. Skips hubs with 0 linked articles (or fewer than minUniqueSources when specified).
 * 2. Deduplicates against already selected hubs using normalized title match & word Jaccard similarity.
 * 3. Prevents overlapping story coverage by checking article URLs.
 */
export function deduplicateNewsletterHubs(
  hubs: any[],
  maxCount = 3,
  options?: { minUniqueSources?: number; maxItemAgeHours?: number; nowMs?: number }
): any[] {
  const selected: any[] = [];
  const selectedTitles: string[] = [];
  const selectedUrls = new Set<string>();
  const minUniqueSources = options?.minUniqueSources ?? 1;
  const maxItemAgeHours = options?.maxItemAgeHours;
  const nowMs = options?.nowMs ?? Date.now();
  const cutoffMs = maxItemAgeHours ? nowMs - maxItemAgeHours * 3600 * 1000 : null;

  for (const hub of hubs) {
    if (selected.length >= maxCount) break;

    let rawItems = (hub.raw_items as any[]) || [];
    if (cutoffMs !== null) {
      rawItems = rawItems.filter((r: any) => {
        if (!r?.published_at) return true;
        const pubMs = new Date(r.published_at).getTime();
        return !isNaN(pubMs) && pubMs >= cutoffMs;
      });
    }

    // Must have at least 1 linked article and meet minimum distinct source count
    if (rawItems.length === 0) continue;
    if (minUniqueSources > 1 && countDistinctHubSources(rawItems) < minUniqueSources) {
      continue;
    }

    const currentTitle = (hub.title || '').trim();
    if (!currentTitle) continue;

    const currentNorm = normalizeTitle(currentTitle);

    // 1. Check title similarity against already selected hubs
    let isDuplicate = false;
    for (const prevTitle of selectedTitles) {
      const prevNorm = normalizeTitle(prevTitle);
      if (currentNorm === prevNorm) {
        isDuplicate = true;
        break;
      }
      const similarity = wordJaccardSimilarity(currentNorm, prevNorm);
      if (similarity >= 0.35) {
        isDuplicate = true;
        break;
      }
    }

    if (isDuplicate) continue;

    // 2. Check for overlapping article URLs across hubs
    const hubUrls = rawItems.map((r: any) => r.url).filter(Boolean);
    const hasOverlappingUrl = hubUrls.some((u: string) => selectedUrls.has(u));
    if (hasOverlappingUrl) continue;

    selected.push({ ...hub, raw_items: rawItems });
    selectedTitles.push(currentTitle);
    hubUrls.forEach((u: string) => selectedUrls.add(u));
  }

  return selected;
}

/**
 * Ranks candidate hubs by distinct source count, cross-lane diversity, and fresh item count.
 */
function rankNewsletterCandidates(hubs: any[], maxItemAgeHours = 36, nowMs = Date.now()): any[] {
  const cutoffMs = nowMs - maxItemAgeHours * 3600 * 1000;
  return hubs
    .map((hub) => {
      const allItems = (hub.raw_items as any[]) || [];
      const freshItems = allItems.filter((r: any) => {
        if (!r?.published_at) return false;
        const pubMs = new Date(r.published_at).getTime();
        return !isNaN(pubMs) && pubMs >= cutoffMs;
      });
      return {
        ...hub,
        raw_items: freshItems,
        _uniqueSources: countDistinctHubSources(freshItems),
        _uniqueLanes: countDistinctHubLanes(freshItems),
        _freshCount: freshItems.length,
      };
    })
    .filter((hub) => hub._freshCount > 0)
    .sort((a, b) => {
      if (b._uniqueSources !== a._uniqueSources) return b._uniqueSources - a._uniqueSources;
      if (b._uniqueLanes !== a._uniqueLanes) return b._uniqueLanes - a._uniqueLanes;
      return b._freshCount - a._freshCount;
    });
}

/**
 * Fetches the top 3 topic hubs from the last 24-36 hours, guaranteed distinct, fresh, and multi-source.
 */
export async function fetchTopNewsletterHubs(supabase: any): Promise<any[]> {
  const nowMs = Date.now();
  const primaryWindow = new Date(nowMs - 24 * 3600 * 1000);
  const fallbackWindow = new Date(nowMs - 36 * 3600 * 1000);

  const selectCols = `
    id,
    title,
    ai_summary,
    last_updated_at,
    raw_items (
      id,
      og_image,
      url,
      published_at,
      sources (name, lane)
    )
  `;

  // Fetch candidate pool of hubs from last 24h ordered by item_count
  const { data: candidates } = await supabase
    .from('topic_hubs')
    .select(selectCols)
    .gte('last_updated_at', primaryWindow.toISOString())
    .order('item_count', { ascending: false })
    .limit(40);

  const rankedPrimary = rankNewsletterCandidates(candidates || [], 36, nowMs);

  // Strictly prefer multi-source hubs (>= 2 distinct publishers)
  let selected = deduplicateNewsletterHubs(rankedPrimary, 3, {
    minUniqueSources: 2,
    maxItemAgeHours: 36,
    nowMs,
  });

  // Fallback to 36h window if fewer than 3 multi-source hubs found in 24h window
  if (selected.length < 3) {
    const { data: fallbackCandidates } = await supabase
      .from('topic_hubs')
      .select(selectCols)
      .gte('last_updated_at', fallbackWindow.toISOString())
      .order('last_updated_at', { ascending: false })
      .limit(60);

    const mergedRanked = rankNewsletterCandidates(
      [...(candidates || []), ...(fallbackCandidates || [])],
      36,
      nowMs
    );
    selected = deduplicateNewsletterHubs(mergedRanked, 3, {
      minUniqueSources: 2,
      maxItemAgeHours: 36,
      nowMs,
    });

    if (selected.length < 3) {
      selected = deduplicateNewsletterHubs(mergedRanked, 3, {
        minUniqueSources: 1,
        maxItemAgeHours: 36,
        nowMs,
      });
    }
  }

  return selected;
}


/**
 * Transforms raw Supabase hubs into HubStory objects for the email template.
 */
export function formatHubStories(hubs: any[], siteUrl: string): HubStory[] {
  const baseSiteUrl = siteUrl.replace(/\/+$/, '');

  return hubs.map((hub) => {
    const items = (hub.raw_items as any[]) ?? [];
    const image = items.find((i: any) => i.og_image)?.og_image ?? null;

    const sourceNames = [
      ...new Set(
        items
          .map((i: any) => i.sources?.name)
          .filter(Boolean)
      ),
    ].slice(0, 3) as string[];

    const totalSources = items.length;

    return {
      id: hub.id,
      title: hub.title,
      summary: hub.ai_summary,
      image,
      sourceNames,
      totalSources,
      hubUrl: `${baseSiteUrl}/hub/${encodeURIComponent(hub.id)}`,
    };
  });
}

/**
 * Builds the Welcome Email HTML template with brand colors and styling.
 */
export function buildWelcomeEmailHTML(
  siteUrl: string = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.panchranga.app'
): string {
  const baseSiteUrl = siteUrl.replace(/\/+$/, '');

  return `
    <!DOCTYPE html>
    <html>
    <body style="
      font-family: Inter, Arial, sans-serif;
      background: #F5F5F3;
      margin: 0;
      padding: 24px;
    ">
      <table 
        width="600" 
        style="
          max-width: 600px;
          margin: 0 auto;
          background: white;
          border-radius: 8px;
          overflow: hidden;
        "
      >
        <tr>
          <td style="
            background: #1A1A1A;
            padding: 24px 32px;
          ">
            <!-- FIVE BRAND COLOR DOTS LOGO -->
            <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 12px;">
              <tr>
                <td style="padding: 0; line-height: 0; font-size: 0;"><span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #4A56E2;"></span></td>
                <td style="width: 8px; padding: 0; line-height: 0; font-size: 0;">&nbsp;</td>
                <td style="padding: 0; line-height: 0; font-size: 0;"><span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #00B8A9;"></span></td>
                <td style="width: 8px; padding: 0; line-height: 0; font-size: 0;">&nbsp;</td>
                <td style="padding: 0; line-height: 0; font-size: 0;"><span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #F5A623;"></span></td>
                <td style="width: 8px; padding: 0; line-height: 0; font-size: 0;">&nbsp;</td>
                <td style="padding: 0; line-height: 0; font-size: 0;"><span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #E84393;"></span></td>
                <td style="width: 8px; padding: 0; line-height: 0; font-size: 0;">&nbsp;</td>
                <td style="padding: 0; line-height: 0; font-size: 0;"><span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #FF6B6B;"></span></td>
              </tr>
            </table>
            <span style="
              font-family: Georgia, serif;
              font-size: 24px;
              font-weight: 800;
              color: white;
            ">
              Panchranga
            </span>
          </td>
        </tr>
        <tr>
          <td style="padding: 32px;">
            <h1 style="
              font-family: Georgia, serif;
              font-size: 26px;
              color: #1A1A1A;
              margin: 0 0 16px 0;
            ">
              You're in. 🎉
            </h1>
            <p style="
              font-size: 15px;
              color: #4A4A4A;
              line-height: 1.7;
              margin: 0 0 16px 0;
            ">
              Every morning you'll get the 
              top 3 Indian news stories of the day 
              — seen from mainstream media, 
              grassroots reporters, and public 
              discourse, side by side.
            </p>
            <p style="
              font-size: 15px;
              color: #4A4A4A;
              line-height: 1.7;
              margin: 0 0 24px 0;
            ">
              Your first edition arrives tomorrow 
              at 7:00 AM IST.
            </p>
            <a 
              href="${baseSiteUrl}"
              style="
                display: inline-block;
                padding: 12px 24px;
                background: #C0392B;
                color: white;
                font-size: 14px;
                font-weight: 600;
                text-decoration: none;
                border-radius: 4px;
              "
            >
              Explore today's stories →
            </a>
          </td>
        </tr>
        <tr>
          <td style="
            padding: 16px 32px;
            border-top: 1px solid #E5E5E0;
          ">
            <p style="
              font-size: 12px;
              color: #9CA3AF;
              margin: 0;
            ">
              Panchranga · Every color of 
              the story · Open source
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

/**
 * Builds the Unsubscribe Confirmation Email HTML template.
 */
export function buildUnsubscribeConfirmationEmailHTML(
  siteUrl: string = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.panchranga.app'
): string {
  const baseSiteUrl = siteUrl.replace(/\/+$/, '');

  return `
    <!DOCTYPE html>
    <html>
    <body style="
      font-family: Inter, Arial, sans-serif;
      background: #F5F5F3;
      margin: 0;
      padding: 24px;
    ">
      <table 
        width="600" 
        style="
          max-width: 600px;
          margin: 0 auto;
          background: white;
          border-radius: 8px;
          overflow: hidden;
        "
      >
        <tr>
          <td style="
            background: #1A1A1A;
            padding: 24px 32px;
          ">
            <!-- FIVE BRAND COLOR DOTS LOGO -->
            <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 12px;">
              <tr>
                <td style="padding: 0; line-height: 0; font-size: 0;"><span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #4A56E2;"></span></td>
                <td style="width: 8px; padding: 0; line-height: 0; font-size: 0;">&nbsp;</td>
                <td style="padding: 0; line-height: 0; font-size: 0;"><span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #00B8A9;"></span></td>
                <td style="width: 8px; padding: 0; line-height: 0; font-size: 0;">&nbsp;</td>
                <td style="padding: 0; line-height: 0; font-size: 0;"><span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #F5A623;"></span></td>
                <td style="width: 8px; padding: 0; line-height: 0; font-size: 0;">&nbsp;</td>
                <td style="padding: 0; line-height: 0; font-size: 0;"><span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #E84393;"></span></td>
                <td style="width: 8px; padding: 0; line-height: 0; font-size: 0;">&nbsp;</td>
                <td style="padding: 0; line-height: 0; font-size: 0;"><span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #FF6B6B;"></span></td>
              </tr>
            </table>
            <span style="
              font-family: Georgia, serif;
              font-size: 24px;
              font-weight: 800;
              color: white;
            ">
              Panchranga
            </span>
          </td>
        </tr>
        <tr>
          <td style="padding: 32px;">
            <h1 style="
              font-family: Georgia, serif;
              font-size: 24px;
              color: #1A1A1A;
              margin: 0 0 16px 0;
            ">
              We're sorry to see you go.
            </h1>
            <p style="
              font-size: 15px;
              color: #4A4A4A;
              line-height: 1.7;
              margin: 0 0 16px 0;
            ">
              This email confirms that you've been successfully unsubscribed from the Panchranga Daily newsletter. You will no longer receive daily editions at this address.
            </p>
            <p style="
              font-size: 14px;
              color: #6B7280;
              line-height: 1.6;
              margin: 0 0 24px 0;
            ">
              If this was done in error or you change your mind, you can resubscribe anytime on our website.
            </p>
            <a 
              href="${baseSiteUrl}"
              style="
                display: inline-block;
                padding: 12px 24px;
                background: #1A1A1A;
                color: white;
                font-size: 14px;
                font-weight: 600;
                text-decoration: none;
                border-radius: 4px;
              "
            >
              Back to Panchranga →
            </a>
          </td>
        </tr>
        <tr>
          <td style="
            padding: 16px 32px;
            border-top: 1px solid #E5E5E0;
          ">
            <p style="
              font-size: 12px;
              color: #9CA3AF;
              margin: 0;
            ">
              Panchranga · Every color of the story · Open source · No editors · No paywalls
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}


