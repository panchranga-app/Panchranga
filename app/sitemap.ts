import { MetadataRoute } from 'next';
import { supabase } from '@/lib/supabase/client';
import { SITE_URL } from '@/lib/config/site';
import fs from 'fs';
import path from 'path';

export const revalidate = 3600; // Cache sitemap for 1 hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseRoutes: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/sources`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
  ];

  const hubRoutes: MetadataRoute.Sitemap = [];

  // 1. Try querying Supabase for up to 500 recent topic hubs
  if (supabase) {
    try {
      const { data: hubs, error } = await supabase
        .from('topic_hubs')
        .select('id, last_updated_at')
        .order('last_updated_at', { ascending: false })
        .limit(500);

      if (!error && hubs && hubs.length > 0) {
        for (const hub of hubs) {
          if (hub?.id) {
            hubRoutes.push({
              url: `${SITE_URL}/hub/${encodeURIComponent(hub.id)}`,
              lastModified: hub.last_updated_at ? new Date(hub.last_updated_at) : new Date(),
              changeFrequency: 'daily',
              priority: 0.7,
            });
          }
        }
        return [...baseRoutes, ...hubRoutes];
      }
      if (error) {
        console.warn('[SITEMAP] Supabase hubs fetch warning:', error.message);
      }
    } catch (err) {
      console.warn('[SITEMAP] Failed to query Supabase hubs:', err);
    }
  }

  // 2. Fallback to reading data/topic-hubs.json if Supabase is unavailable
  try {
    const hubsPath = path.resolve(process.cwd(), 'data', 'topic-hubs.json');
    if (fs.existsSync(hubsPath)) {
      const localHubs = JSON.parse(fs.readFileSync(hubsPath, 'utf-8'));
      if (Array.isArray(localHubs)) {
        for (const hub of localHubs.slice(0, 200)) {
          if (hub?.id) {
            hubRoutes.push({
              url: `${SITE_URL}/hub/${encodeURIComponent(hub.id)}`,
              lastModified: hub.last_updated_at ? new Date(hub.last_updated_at) : new Date(),
              changeFrequency: 'daily',
              priority: 0.6,
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn('[SITEMAP] Local fallback read failed:', err);
  }

  return [...baseRoutes, ...hubRoutes];
}
