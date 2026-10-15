import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'Panchranga — Every Color of the Story';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#1A1A1A',
          color: '#FFFFFF',
          padding: '60px',
        }}
      >
        {/* Panchranga Brand Wave Dots */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '18px',
            marginBottom: '32px',
          }}
        >
          <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: '#4A56E2' }} />
          <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: '#00B8A9' }} />
          <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: '#F5A623' }} />
          <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: '#E84393' }} />
          <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: '#FF6B6B' }} />
        </div>

        {/* Wordmark */}
        <div
          style={{
            fontSize: 78,
            fontWeight: 800,
            letterSpacing: '-2px',
            color: '#FFFFFF',
            marginBottom: '12px',
          }}
        >
          Panchranga
        </div>

        {/* Subtitle / Devanagari */}
        <div
          style={{
            fontSize: 26,
            fontWeight: 600,
            color: '#9CA3AF',
            letterSpacing: '4px',
            textTransform: 'uppercase',
            marginBottom: '36px',
          }}
        >
          पंचरंग · Every Color of the Story
        </div>

        {/* Three Lanes Indicator */}
        <div
          style={{
            display: 'flex',
            gap: '16px',
            marginTop: '8px',
          }}
        >
          <div
            style={{
              padding: '10px 24px',
              borderRadius: '9999px',
              backgroundColor: '#1E293B',
              border: '2px solid #2563EB',
              color: '#93C5FD',
              fontSize: 18,
              fontWeight: 600,
            }}
          >
            Mainstream Media
          </div>
          <div
            style={{
              padding: '10px 24px',
              borderRadius: '9999px',
              backgroundColor: '#1E293B',
              border: '2px solid #16A34A',
              color: '#86EFAC',
              fontSize: 18,
              fontWeight: 600,
            }}
          >
            Grassroots Reporters
          </div>
          <div
            style={{
              padding: '10px 24px',
              borderRadius: '9999px',
              backgroundColor: '#1E293B',
              border: '2px solid #D97706',
              color: '#FDE68A',
              fontSize: 18,
              fontWeight: 600,
            }}
          >
            Public Discourse
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
