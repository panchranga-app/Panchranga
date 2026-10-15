import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const size = {
  width: 180,
  height: 180,
};
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#1A1A1A',
          borderRadius: '36px',
          gap: '10px',
        }}
      >
        <div style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: '#4A56E2' }} />
        <div style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: '#00B8A9' }} />
        <div style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: '#F5A623' }} />
        <div style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: '#E84393' }} />
        <div style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: '#FF6B6B' }} />
      </div>
    ),
    {
      ...size,
    }
  );
}
