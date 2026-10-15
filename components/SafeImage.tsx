'use client';

import { useState } from 'react';

interface SafeImageProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  fallbackText?: string;
}

export default function SafeImage({
  src,
  alt,
  className,
  style,
  fallbackText,
}: SafeImageProps) {
  const [error, setError] = useState(false);

  // If the src was passed as /api/og-image?url=..., extract the actual remote image URL
  // so the client requests it directly from the publisher, bypassing origin server transfer.
  let resolvedSrc = src;
  if (src && src.includes('/api/og-image?url=')) {
    try {
      const idx = src.indexOf('url=');
      if (idx !== -1) {
        resolvedSrc = decodeURIComponent(src.substring(idx + 4));
      }
    } catch {
      // keep as is if decoding fails
    }
  }

  if (!resolvedSrc || error) {
    const label = (fallbackText || alt || 'Panchranga News').trim();
    const monogram = label.slice(0, 2).toUpperCase();

    return (
      <div
        className={className}
        style={{
          ...style,
          backgroundColor: '#F5F5F3',
          border: '1px solid #E5E5E0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#6B6B6B',
          fontSize: '11px',
          fontFamily: 'Inter, -apple-system, sans-serif',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          fontWeight: 600,
          padding: '12px',
          textAlign: 'center',
          userSelect: 'none',
        }}
        aria-label={alt}
      >
        {/* Panchranga Five Dots Brand Indicator */}
        <div className="flex items-center gap-1 mb-1.5 opacity-70">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4A56E2]" />
          <span className="w-1.5 h-1.5 rounded-full bg-[#00B8A9]" />
          <span className="w-1.5 h-1.5 rounded-full bg-[#F5A623]" />
          <span className="w-1.5 h-1.5 rounded-full bg-[#E84393]" />
          <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B6B]" />
        </div>
        <span className="font-mono text-xs text-[#8A8A8A] font-bold tracking-wider">{monogram}</span>
        <span className="line-clamp-1 text-[10px] text-[#A0A09C] mt-0.5 max-w-[90%]">{label}</span>
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      style={style}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setError(true)}
    />
  );
}
