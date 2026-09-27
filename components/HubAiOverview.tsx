'use client';

import React, { useEffect, useState } from 'react';

interface HubAiOverviewProps {
  hubId: string;
  initialSummary?: string | null;
  fallbackHeadline?: string;
  isSensitive?: boolean;
  itemCount?: number;
}

export default function HubAiOverview({
  hubId,
  initialSummary,
  fallbackHeadline,
  isSensitive = false,
  itemCount = 2,
}: HubAiOverviewProps) {
  const [summary, setSummary] = useState<string | null>(initialSummary || null);
  const [loading, setLoading] = useState<boolean>(!initialSummary && !isSensitive && itemCount >= 2);
  const [isLiveGenerated, setIsLiveGenerated] = useState<boolean>(false);
  const [isCached, setIsCached] = useState<boolean>(Boolean(initialSummary));

  useEffect(() => {
    // If summary is already provided, or if topic is sensitive, or single item, no need to fetch
    if (summary || isSensitive || itemCount < 2) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    // Client-side 7-second timeout safeguard to prevent infinite loading spinners
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 7000);

    fetch(`/api/hub/${encodeURIComponent(hubId)}/summary`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (isMounted && data.summary) {
          setSummary(data.summary);
          setIsCached(Boolean(data.cached));
          if (!data.cached) {
            setIsLiveGenerated(true);
          }
        }
      })
      .catch((err) => {
        console.warn('⚠️ On-demand AI summary timed out or failed, falling back:', err);
        if (isMounted && !summary && fallbackHeadline) {
          setSummary(fallbackHeadline);
        }
      })
      .finally(() => {
        clearTimeout(timeoutId);
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [hubId, summary, isSensitive, itemCount, fallbackHeadline]);

  // High-stakes sensitive topic bypass
  if (isSensitive) {
    return (
      <div className="p-4 bg-[#F5F5F3] border-l-4 border-l-[#C0392B] text-xs text-[#1A1A1A] space-y-1 rounded-r-lg">
        <p className="font-semibold text-[#C0392B] uppercase text-[11px] font-mono">
          Sources-Only Mode Active
        </p>
        <p className="text-[#6B6B6B]">
          AI overview is bypassed for high-stakes sensitive topics. Displaying publisher reports directly below.
        </p>
      </div>
    );
  }

  // Not enough sources to warrant an AI overview
  if (itemCount < 2) {
    return null;
  }

  // Loading state (while generating on the fly, max 7 seconds before timeout fallback)
  if (loading && !summary) {
    return (
      <div className="p-5 bg-[#F5F5F3] border-l-4 border-l-[#C0392B] space-y-3 text-xs rounded-r-lg animate-pulse">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-[#C0392B] animate-ping" />
          <span className="text-[11px] font-mono tracking-wider uppercase text-[#6B6B6B] font-semibold">
            SYNTHESIZING CROSS-SOURCE BRIEFING...
          </span>
        </div>
        <div className="space-y-2">
          <div className="h-4 bg-[#E5E5E0] rounded-sm w-5/6" />
          <div className="h-4 bg-[#E5E5E0] rounded-sm w-3/4" />
        </div>
        <div className="h-3 bg-[#E5E5E0]/60 rounded-sm w-1/3" />
      </div>
    );
  }

  // Render finalized summary
  if (summary) {
    return (
      <div className="p-5 bg-[#F5F5F3] border-l-4 border-l-[#C0392B] space-y-2 text-xs rounded-r-lg transition-opacity duration-300">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono tracking-wider uppercase text-[#6B6B6B] font-semibold">
            AI OVERVIEW
          </span>
          {isLiveGenerated ? (
            <span className="text-[10px] font-mono text-[#27AE60] bg-[#E8F8F5] px-2 py-0.5 rounded-full border border-[#A3E4D7]">
              ● LIVE BRIEFING
            </span>
          ) : (
            <span className="text-[10px] font-mono text-[#6B7280] bg-[#F3F4F6] px-2 py-0.5 rounded-full border border-[#E5E7EB]">
              ● CACHED
            </span>
          )}
        </div>
        <p className="font-serif-title text-base sm:text-lg italic text-[#1A1A1A] leading-relaxed">
          "{summary}"
        </p>
        <p className="text-[11px] text-[#6B6B6B] pt-1">
          This is AI-generated from public headlines only. Read original sources to verify.
        </p>
      </div>
    );
  }

  return null;
}
