import fs from 'fs';
import path from 'path';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { TopicHub, RawItem } from '@/lib/types';
import { checkSensitiveBypass } from '@/lib/summarizer';
import CoverageBar from '@/components/CoverageBar';
import SafeImage from '@/components/SafeImage';
import HubAiOverview from '@/components/HubAiOverview';
import { timeAgo } from '@/lib/utils';
import { supabase } from '@/lib/supabase/client';

export const revalidate = 60;

interface PageProps {
  params: {
    id: string;
  };
}

async function getHubData(id: string): Promise<TopicHub | null> {
  // 1. Try querying Supabase Postgres if configured
  if (supabase) {
    try {
      const [{ data: dbHub, error: hubErr }, { data: dbItems, error: itemsErr }] = await Promise.all([
        supabase.from('topic_hubs').select('*').eq('id', id).maybeSingle(),
        supabase
          .from('raw_items')
          .select(`
            id,
            title,
            url,
            published_at,
            og_image,
            og_description,
            raw_summary,
            fetched_at,
            sources:source_id (
              id,
              name,
              lane,
              type,
              language,
              region
            )
          `)
          .eq('cluster_id', id)
          .order('published_at', { ascending: false }),
      ]);

      if (hubErr) console.warn('Supabase topic_hubs query error:', hubErr);
      if (itemsErr) console.warn('Supabase raw_items query error:', itemsErr);

      if (dbHub) {
        const normalizedItems: RawItem[] = (dbItems || []).map((item: any) => {
          const src = Array.isArray(item.sources) ? item.sources[0] : (item.sources || item.source);
          return {
            ...item,
            lane: src?.lane || item.lane || 'mainstream',
            source_name: src?.name || item.source_name || 'Unknown',
            sources: src,
            source: src,
          };
        });

        return {
          ...dbHub,
          items: normalizedItems,
        };
      }
    } catch (err) {
      console.warn('Supabase getHubData failed, falling back to local files:', err);
    }
  }

  // 2. Fallback to local JSON files
  try {
    const hubsPath = path.resolve(process.cwd(), 'data', 'topic-hubs.json');
    if (fs.existsSync(hubsPath)) {
      const hubs: TopicHub[] = JSON.parse(fs.readFileSync(hubsPath, 'utf-8'));
      const hub = hubs.find((h) => h.id === id || encodeURIComponent(h.id) === id);
      if (hub) {
        const normalizedItems: RawItem[] = (hub.items || []).map((item: any) => {
          const src = Array.isArray(item.sources) ? item.sources[0] : (item.sources || item.source);
          return {
            ...item,
            lane: src?.lane || item.lane || 'mainstream',
            source_name: src?.name || item.source_name || 'Unknown',
            sources: src,
            source: src,
          };
        });
        return {
          ...hub,
          items: normalizedItems,
        };
      }
    }
  } catch (e) {
    console.error('Error fetching hub data:', e);
  }
  return null;
}

function getYouTubeEmbedUrl(url: string): string | null {
  if (!url) return null;
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/
  );
  return match ? `https://www.youtube.com/embed/${match[1]}` : null;
}

export default async function HubDetailPage({ params }: PageProps) {
  const hub = await getHubData(params.id);

  if (!hub || !hub.items || hub.items.length === 0) {
    redirect('/');
  }

  const safeItems: RawItem[] = (hub.items ?? []).map((item) => {
    const rawLane = (item.lane || item.sources?.lane || item.source?.lane || '').toLowerCase();
    const lane = rawLane === 'grassroots' ? 'grassroots' : rawLane === 'discourse' ? 'discourse' : 'mainstream';
    return {
      ...item,
      lane,
    };
  });
  const mainstreamItems = safeItems.filter((i) => i.lane === 'mainstream');
  const grassrootsItems = safeItems.filter((i) => i.lane === 'grassroots');
  const discourseItems = safeItems.filter((i) => i.lane === 'discourse');

  const isSensitive = checkSensitiveBypass(hub);

  return (
    <div className="max-w-[1320px] mx-auto space-y-6 pb-12">
      {/* Top Back Navigation Link */}
      <Link
        href="/"
        className="inline-flex items-center space-x-1.5 text-xs text-[#6B6B6B] hover:text-[#C0392B] transition-colors"
      >
        <span>←</span>
        <span>Back to Topic Hubs</span>
      </Link>

      {/* 1. Hub Title (h1) */}
      <div className="space-y-2 border-b border-[#E5E5E0] pb-4">
        <div className="text-[11px] font-mono tracking-wider uppercase text-[#6B6B6B]">
          Topic Hub · {safeItems.length} {safeItems.length === 1 ? 'Source' : 'Sources'} · First seen {timeAgo(hub.first_seen_at)}
        </div>
        <h1 className="font-serif-title text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight text-[#1A1A1A]">
          {hub.title ?? 'Untitled Topic Hub'}
        </h1>
      </div>

      {/* 2. Coverage Bar */}
      <div className="bg-white p-4 rounded-lg border border-[#E5E5E0] shadow-xs space-y-2">
        <div className="text-xs font-mono uppercase tracking-wider text-[#6B6B6B] font-semibold">
          CROSS-MEDIA COVERAGE SPLIT
        </div>
        <CoverageBar
          mainstreamCount={mainstreamItems.length}
          grassrootsCount={grassrootsItems.length}
          discourseCount={discourseItems.length}
        />
      </div>

      {/* 3. AI Overview Box (On-demand or cached) */}
      <HubAiOverview
        hubId={hub.id}
        initialSummary={hub.ai_summary}
        isSensitive={isSensitive}
        itemCount={safeItems.length}
      />

      {/* 4. Three Lane Columns Side by Side */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 divide-y md:divide-y-0 md:divide-x divide-[#E5E5E0]">
        {/* Mainstream Column */}
        <div className="space-y-6 pt-6 md:pt-0 md:pr-4">
          <div className="text-xs font-mono tracking-wider uppercase text-[#6B6B6B] font-semibold border-b border-[#E5E5E0] pb-2">
            MAINSTREAM ({mainstreamItems.length})
          </div>

          <div className="space-y-6 divide-y divide-[#E5E5E0]">
            {mainstreamItems.length === 0 ? (
              <p className="text-xs text-[#6B6B6B] italic py-4">
                No mainstream reports in this hub.
              </p>
            ) : (
              mainstreamItems.map((item, idx) => (
                <ArticleCard key={item.id || idx} item={item} />
              ))
            )}
          </div>
        </div>

        {/* Grassroots Column */}
        <div className="space-y-6 pt-6 md:pt-0 md:pl-4 md:pr-4">
          <div className="text-xs font-mono tracking-wider uppercase text-[#6B6B6B] font-semibold border-b border-[#E5E5E0] pb-2">
            GRASSROOTS ({grassrootsItems.length})
          </div>

          <div className="space-y-6 divide-y divide-[#E5E5E0]">
            {grassrootsItems.length === 0 ? (
              <p className="text-xs text-[#6B6B6B] italic py-4">
                No grassroots reports in this hub.
              </p>
            ) : (
              grassrootsItems.map((item, idx) => (
                <ArticleCard key={item.id || idx} item={item} />
              ))
            )}
          </div>
        </div>

        {/* Public Discourse Column */}
        <div className="space-y-6 pt-6 md:pt-0 md:pl-4">
          <div className="text-xs font-mono tracking-wider uppercase text-[#6B6B6B] font-semibold border-b border-[#E5E5E0] pb-2">
            PUBLIC DISCOURSE ({discourseItems.length})
          </div>

          <div className="space-y-6 divide-y divide-[#E5E5E0]">
            {discourseItems.length === 0 ? (
              <p className="text-xs text-[#6B6B6B] italic py-4">
                No discourse threads in this hub.
              </p>
            ) : (
              discourseItems.map((item, idx) => (
                <ArticleCard key={item.id || idx} item={item} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Article Item Renderer with SafeImage 80x80 Thumbnail
 */
function ArticleCard({ item }: { item: RawItem }) {
  const ytEmbedUrl = getYouTubeEmbedUrl(item.url);
  const isReddit = (item.lane || item.sources?.lane || item.source?.lane) === 'discourse' || item.url?.includes('reddit.com');

  const imageUrl = item.og_image
    ? `/api/og-image?url=${encodeURIComponent(item.og_image)}`
    : null;

  const sourceName = item.sources?.name || item.source?.name || item.source_name || (isReddit ? 'Reddit' : ytEmbedUrl ? 'YouTube' : 'Publisher');
  const lane = item.sources?.lane || item.source?.lane || item.lane || 'mainstream';
  const laneLabel =
    lane === 'mainstream'
      ? '· Mainstream'
      : lane === 'grassroots'
      ? '· Grassroots'
      : '· Public Discourse';

  const sourceHeader = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '6px',
      }}
    >
      <span
        style={{
          fontSize: '11px',
          fontFamily: 'Inter, sans-serif',
          fontWeight: 700,
          color: '#C0392B',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {sourceName}
      </span>
      <span
        style={{
          fontSize: '11px',
          color: '#9CA3AF',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        {laneLabel}
      </span>
      <span
        style={{
          fontSize: '11px',
          color: '#9CA3AF',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        · {timeAgo(item.published_at || item.fetched_at)}
      </span>
    </div>
  );

  // YouTube Video Embed (Full embed player)
  if (ytEmbedUrl) {
    return (
      <div className="pt-6 first:pt-0 space-y-3">
        <div className="relative aspect-video w-full overflow-hidden rounded-[4px] bg-[#E5E5E0]">
          <iframe
            src={ytEmbedUrl}
            title={item.title ?? 'Video'}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
        {sourceHeader}
        <h4 className="font-serif-title text-[17px] font-bold text-[#1A1A1A] leading-snug">
          {item.title ?? 'Untitled Video'}
        </h4>
        <div className="pt-1">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#C0392B] hover:underline font-semibold"
          >
            Watch at {sourceName} →
          </a>
        </div>
      </div>
    );
  }

  // Reddit Thread Card
  if (isReddit) {
    return (
      <div className="pt-6 first:pt-0 space-y-2">
        {sourceHeader}
        <h4 className="font-serif-title text-[17px] font-bold text-[#1A1A1A] leading-snug">
          {item.title ?? 'Untitled Thread'}
        </h4>
        {item.og_description && (
          <p className="text-[13px] text-[#6B6B6B] line-clamp-2 leading-relaxed">
            {item.og_description}
          </p>
        )}
        <div className="pt-1">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#C0392B] hover:underline font-semibold"
          >
            Read at {sourceName} →
          </a>
        </div>
      </div>
    );
  }

  // Standard Publisher Article Preview with 80x80 SafeImage Thumbnail
  return (
    <div className="pt-6 first:pt-0">
      <div className="flex gap-3 items-start">
        <div className="w-20 h-20 shrink-0 rounded overflow-hidden">
          <SafeImage
            src={imageUrl}
            alt={item.title ?? 'Article image'}
            className="w-20 h-20 object-cover rounded"
            fallbackText={sourceName}
          />
        </div>

        <div className="space-y-1.5 flex-1 min-w-0">
          {sourceHeader}

          <h4 className="font-serif-title text-[17px] font-bold text-[#1A1A1A] leading-snug">
            {item.title ?? 'Untitled Article'}
          </h4>

          {(item.og_description || item.raw_summary) && (
            <p className="text-[13px] text-[#6B6B6B] line-clamp-2 leading-relaxed">
              {item.og_description || item.raw_summary}
            </p>
          )}

          <div className="pt-1">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#C0392B] hover:underline font-semibold"
            >
              Read at {sourceName} →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
