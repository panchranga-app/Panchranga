'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { TopicHub } from '@/lib/types';
import CoverageBar from '@/components/CoverageBar';
import SafeImage from '@/components/SafeImage';
import { timeAgo } from '@/lib/utils';

interface HomeClientProps {
  initialHubs: TopicHub[];
}

export default function HomeClient({ initialHubs }: HomeClientProps) {
  const searchParams = useSearchParams();
  const selectedTopic = searchParams.get('topic') || 'All';
  const searchQuery = searchParams.get('q') || '';

  const filteredHubs = useMemo(() => {
    return initialHubs.filter((hub) => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = hub.title.toLowerCase().includes(query);
        const matchesSummary = hub.ai_summary?.toLowerCase().includes(query);
        const matchesItem = hub.items?.some(
          (i) =>
            i.title.toLowerCase().includes(query) ||
            i.source_name?.toLowerCase().includes(query)
        );
        if (!matchesTitle && !matchesSummary && !matchesItem) return false;
      }

      if (selectedTopic === 'All') return true;
      const topicLower = selectedTopic.toLowerCase();

      return hub.title.toLowerCase().includes(topicLower);
    });
  }, [initialHubs, selectedTopic, searchQuery]);

  const heroHub = useMemo(() => {
    if (initialHubs.length === 0) return null;
    return [...initialHubs].sort(
      (a, b) =>
        new Date(b.last_updated_at).getTime() -
        new Date(a.last_updated_at).getTime()
    )[0];
  }, [initialHubs]);

  const gridHubs = useMemo(() => {
    if (!heroHub) return filteredHubs;
    if (selectedTopic !== 'All' || searchQuery.trim() !== '') {
      return filteredHubs;
    }
    return filteredHubs.filter((h) => h.id !== heroHub.id);
  }, [filteredHubs, heroHub, selectedTopic, searchQuery]);

  return (
    <div className="space-y-8 pb-8">
      {heroHub && selectedTopic === 'All' && !searchQuery.trim() && (
        <HeroCard hub={heroHub} />
      )}

      {gridHubs.length === 0 ? (
        <div className="py-16 text-center text-[#6B6B6B] space-y-2 bg-white rounded-lg border border-[#E5E5E0]">
          <p className="font-serif-title text-xl text-[#1A1A1A]">
            No stories match your filter criteria
          </p>
          <p className="text-xs">
            Try selecting a different topic or clearing your search.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {gridHubs.map((hub) => (
            <StoryCard key={hub.id} hub={hub} />
          ))}
        </div>
      )}
    </div>
  );
}

function HeroCard({ hub }: { hub: TopicHub }) {
  const items = hub.items || [];
  const mainstreamCount = items.filter((i) => i.lane === 'mainstream').length;
  const grassrootsCount = items.filter((i) => i.lane === 'grassroots').length;
  const discourseCount = items.filter((i) => i.lane === 'discourse').length;

  const firstOgImage = items.find((i) => i.og_image)?.og_image;
  const imageUrl = firstOgImage || null;

  return (
    <article className="relative w-full h-[420px] rounded-xl overflow-hidden shadow-md group">
      <SafeImage
        src={imageUrl}
        alt={hub.title}
        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        fallbackText="Featured Story"
      />

      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/10 pointer-events-none" />

      <div className="absolute inset-0 p-6 sm:p-8 flex flex-col justify-between z-10 pointer-events-none">
        <div className="flex flex-wrap items-center justify-between gap-2 pointer-events-auto">
          <span className="px-2.5 py-1 bg-[#C0392B] text-white text-[11px] font-mono uppercase tracking-wider rounded-md font-semibold">
            BREAKING FEATURED
          </span>

          <div className="flex items-center gap-2">
            {mainstreamCount > 0 && (
              <span className="px-2.5 py-1 bg-white/20 backdrop-blur-md text-white text-xs font-mono rounded-full border border-white/20">
                {mainstreamCount} Mainstream
              </span>
            )}
            {grassrootsCount > 0 && (
              <span className="px-2.5 py-1 bg-white/20 backdrop-blur-md text-white text-xs font-mono rounded-full border border-white/20">
                {grassrootsCount} Grassroots
              </span>
            )}
            {discourseCount > 0 && (
              <span className="px-2.5 py-1 bg-white/20 backdrop-blur-md text-white text-xs font-mono rounded-full border border-white/20">
                {discourseCount} Discourse
              </span>
            )}
          </div>
        </div>

        <div className="space-y-4 max-w-4xl pointer-events-auto">
          <Link href={`/hub/${encodeURIComponent(hub.id)}`} className="block group">
            <h1 className="font-serif-title text-2xl sm:text-3xl lg:text-4xl font-bold text-white leading-tight group-hover:text-gray-200 transition-colors line-clamp-3">
              {hub.title}
            </h1>
          </Link>

          {hub.ai_summary && (
            <p className="text-xs sm:text-sm text-gray-300 italic line-clamp-2 max-w-3xl">
              "{hub.ai_summary}"
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-white/20">
            <span className="text-xs font-mono text-gray-300">
              Updated {timeAgo(hub.last_updated_at)}
            </span>

            <Link
              href={`/hub/${encodeURIComponent(hub.id)}`}
              className="px-4 py-2 rounded-full border border-white text-white hover:bg-white hover:text-black transition-all text-xs font-medium inline-flex items-center gap-1.5 shadow-sm"
            >
              <span>Explore full hub</span>
              <span>→</span>
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function StoryCard({ hub }: { hub: TopicHub }) {
  const items = hub.items || [];
  const mainstreamCount = items.filter((i) => i.lane === 'mainstream').length;
  const grassrootsCount = items.filter((i) => i.lane === 'grassroots').length;
  const discourseCount = items.filter((i) => i.lane === 'discourse').length;

  const firstOgItem = items.find((i) => i.og_image);
  const imageUrl = firstOgItem?.og_image || null;
  const fallbackSourceName =
    firstOgItem?.source_name || items[0]?.source_name || 'Panchranga Hub';

  return (
    <article className="bg-white rounded-lg border border-[#E5E5E0] shadow-[0_1px_4px_rgba(0,0,0,0.08)] overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow group">
      <Link href={`/hub/${encodeURIComponent(hub.id)}`} className="block">
        <div className="relative h-[180px] w-full bg-[#E8E4DF] overflow-hidden">
          <SafeImage
            src={imageUrl}
            alt={hub.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            fallbackText={fallbackSourceName}
          />
        </div>
      </Link>

      <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
        <div className="space-y-2.5">
          <Link href={`/hub/${encodeURIComponent(hub.id)}`}>
            <h2 className="font-serif-title text-[18px] font-bold text-[#1A1A1A] leading-snug group-hover:text-[#C0392B] transition-colors line-clamp-2">
              {hub.title}
            </h2>
          </Link>

          <CoverageBar
            mainstreamCount={mainstreamCount}
            grassrootsCount={grassrootsCount}
            discourseCount={discourseCount}
          />

          {hub.ai_summary && (
            <p className="text-xs text-[#6B6B6B] italic line-clamp-1 leading-relaxed">
              "{hub.ai_summary}"
            </p>
          )}
        </div>

        <div className="pt-2 border-t border-[#E5E5E0] flex items-center justify-between text-xs text-[#6B6B6B]">
          <span>{timeAgo(hub.first_seen_at)}</span>
          <Link
            href={`/hub/${encodeURIComponent(hub.id)}`}
            className="text-[#C0392B] font-medium hover:underline text-xs"
          >
            Explore hub →
          </Link>
        </div>
      </div>
    </article>
  );
}
