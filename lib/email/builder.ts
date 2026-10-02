import { HubStory } from './types';

/**
 * Builds the newsletter HTML email.
 * Preserves the exact layout, colors, and typography of the Panchranga newsletter.
 */
export function buildEmailHTML(
  stories: HubStory[],
  date: string,
  unsubscribeToken?: string,
  siteUrl: string = process.env.NEXT_PUBLIC_SITE_URL || 'https://panchranga.vercel.app'
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
                    You're receiving this because you subscribed at panchranga.vercel.app
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
 * Fetches the top 3 topic hubs from the last 24 hours (with fallback to latest 3).
 */
export async function fetchTopNewsletterHubs(supabase: any): Promise<any[]> {
  const yesterday = new Date();
  yesterday.setHours(yesterday.getHours() - 24);

  let { data: hubs } = await supabase
    .from('topic_hubs')
    .select(`
      id,
      title,
      ai_summary,
      last_updated_at,
      raw_items (
        id,
        og_image,
        url,
        sources (name, lane)
      )
    `)
    .gte('last_updated_at', yesterday.toISOString())
    .order('item_count', { ascending: false })
    .limit(3);

  // Fallback if no hubs in last 24 hours
  if (!hubs || hubs.length === 0) {
    const fallback = await supabase
      .from('topic_hubs')
      .select(`
        id,
        title,
        ai_summary,
        last_updated_at,
        raw_items (
          id,
          og_image,
          url,
          sources (name, lane)
        )
      `)
      .order('last_updated_at', { ascending: false })
      .limit(3);
    hubs = fallback.data || [];
  }

  return hubs || [];
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
  siteUrl: string = process.env.NEXT_PUBLIC_SITE_URL || 'https://panchranga.vercel.app'
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
  siteUrl: string = process.env.NEXT_PUBLIC_SITE_URL || 'https://panchranga.vercel.app'
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


