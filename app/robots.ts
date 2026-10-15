import { MetadataRoute } from 'next';
import { SITE_URL, isProduction } from '@/lib/config/site';

export default function robots(): MetadataRoute.Robots {
  const prod = isProduction();

  if (!prod) {
    // Non-production deployment contexts (e.g. Netlify deploy-preview, branch-deploy, staging, localhost)
    return {
      rules: {
        userAgent: '*',
        disallow: '/',
      },
    };
  }

  // Canonical production environment
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/loader-demo'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
