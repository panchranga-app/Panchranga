import type { Metadata } from 'next';
import './globals.css';
import { Suspense } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import SiteLoader from '@/components/SiteLoader';
import CloudflareAnalytics from '@/components/CloudflareAnalytics';
import { SITE_NAME, SITE_DESCRIPTION, SITE_URL, isProduction } from '@/lib/config/site';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Panchranga — Every Color of the Story',
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: 'Panchranga Team', url: SITE_URL }],
  creator: 'Panchranga Open Source Contributors',
  publisher: SITE_NAME,
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Panchranga — Every Color of the Story',
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    locale: 'en_IN',
    type: 'website',
    images: [
      {
        url: `${SITE_URL}/opengraph-image.png`,
        width: 1200,
        height: 630,
        alt: 'Panchranga — Multi-Perspective Indian News Aggregator',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Panchranga — Every Color of the Story',
    description: SITE_DESCRIPTION,
    images: [`${SITE_URL}/opengraph-image.png`],
  },
  robots: {
    index: isProduction(),
    follow: isProduction(),
    googleBot: {
      index: isProduction(),
      follow: isProduction(),
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  manifest: '/manifest.json',
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION || undefined,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_NAME,
      alternateName: ['पंचरंग', 'Panchranga News'],
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      inLanguage: ['en-IN', 'hi', 'bn', 'te', 'mr', 'ta', 'ur', 'gu', 'kn', 'ml', 'pa'],
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${SITE_URL}/?q={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'NewsMediaOrganization',
      name: SITE_NAME,
      alternateName: 'पंचरंग',
      url: SITE_URL,
      logo: `${SITE_URL}/icon.svg`,
      sameAs: ['https://github.com/panchranga-app/Panchranga'],
      description: SITE_DESCRIPTION,
      publishingPrinciples: `${SITE_URL}/about#how-it-works`,
      correctionsPolicy: `${SITE_URL}/about#contact`,
      knowsAbout: [
        'Indian News',
        'Current Affairs',
        'Media Literacy',
        'Grassroots Journalism',
        'Fact Checking',
      ],
    },
  ];

  return (
    <html lang="en-IN">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body className="min-h-screen bg-[#FAFAF8] text-[#1A1A1A] antialiased flex flex-col font-sans">
        {/* Site-wide Loading & Route Transition */}
        <Suspense fallback={null}>
          <SiteLoader />
        </Suspense>

        {/* Top Navbar, Announcement Banner & Trending Bar */}
        <Suspense fallback={<div className="h-24 bg-[#FAFAF8] border-b border-[#E5E5E0]" />}>
          <Navbar />
        </Suspense>

        {/* Main Content Area */}
        <main className="flex-1 w-full box-border">
          {children}
        </main>

        {/* Full-width Ground News Footer */}
        <Footer />

        {/* Cloudflare Web Analytics */}
        <CloudflareAnalytics />
      </body>
    </html>
  );
}
