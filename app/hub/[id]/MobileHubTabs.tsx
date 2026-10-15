'use client';

import { useState } from 'react';
import { RawItem } from '@/lib/types';
import SafeImage from '@/components/SafeImage';
import { timeAgo } from '@/lib/utils';

interface MobileHubTabsProps {
  mainstream: RawItem[];
  grassroots: RawItem[];
  discourse: RawItem[];
}

function getYouTubeEmbedUrl(url: string): string | null {
  if (!url) return null;
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/
  );
  return match ? `https://www.youtube.com/embed/${match[1]}` : null;
}

export default function MobileHubTabs({
  mainstream,
  grassroots,
  discourse,
}: MobileHubTabsProps) {
  const initialTab: 'mainstream' | 'grassroots' | 'discourse' =
    mainstream.length > 0 ? 'mainstream' : grassroots.length > 0 ? 'grassroots' : 'discourse';
  const [activeTab, setActiveTab] = useState<'mainstream' | 'grassroots' | 'discourse'>(initialTab);

  const currentItems =
    activeTab === 'mainstream'
      ? mainstream
      : activeTab === 'grassroots'
      ? grassroots
      : discourse;

  return (
    <div className="space-y-6">
      {/* Mobile Tab Buttons */}
      <div className="grid grid-cols-3 border-b border-[#E5E5E0] text-xs font-mono uppercase tracking-wider">
        <button
          onClick={() => setActiveTab('mainstream')}
          className={`py-2.5 font-semibold transition-colors border-b-2 ${
            activeTab === 'mainstream'
              ? 'border-[#C0392B] text-[#C0392B]'
              : 'border-transparent text-[#6B6B6B]'
          }`}
        >
          MAINSTREAM ({mainstream.length})
        </button>
        <button
          onClick={() => setActiveTab('grassroots')}
          className={`py-2.5 font-semibold transition-colors border-b-2 ${
            activeTab === 'grassroots'
              ? 'border-[#C0392B] text-[#C0392B]'
              : 'border-transparent text-[#6B6B6B]'
          }`}
        >
          GRASSROOTS ({grassroots.length})
        </button>
        <button
          onClick={() => setActiveTab('discourse')}
          className={`py-2.5 font-semibold transition-colors border-b-2 ${
            activeTab === 'discourse'
              ? 'border-[#C0392B] text-[#C0392B]'
              : 'border-transparent text-[#6B6B6B]'
          }`}
        >
          DISCOURSE ({discourse.length})
        </button>
      </div>

      {/* Mobile Stream Cards */}
      <div className="space-y-6 divide-y divide-[#E5E5E0]">
        {currentItems.length === 0 ? (
          <p className="text-xs text-[#6B6B6B] italic py-4">No reports in this lane.</p>
        ) : (
          currentItems.map((item, idx) => {
            const ytEmbedUrl = getYouTubeEmbedUrl(item.url);
            const isReddit = (item.lane || item.sources?.lane || item.source?.lane) === 'discourse' || item.url?.includes('reddit.com');
            const imageUrl = item.og_image || null;

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

            if (ytEmbedUrl) {
              return (
                <div key={item.id || idx} className="pt-6 first:pt-0 space-y-3">
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

            if (isReddit) {
              return (
                <div key={item.id || idx} className="pt-6 first:pt-0 space-y-2">
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

            return (
              <div key={item.id || idx} className="pt-6 first:pt-0">
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
          })
        )}
      </div>
    </div>
  );
}
