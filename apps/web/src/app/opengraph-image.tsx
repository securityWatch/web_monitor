import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'PulseWatch — Uptime & website monitoring';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 64,
          background: 'linear-gradient(135deg, #0A0A0B 0%, #111827 50%, #1e3a5f 100%)',
          color: '#fff',
        }}
      >
        <div style={{ fontSize: 28, color: '#93c5fd', marginBottom: 16 }}>PulseWatch</div>
        <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.15, maxWidth: 900 }}>
          Uptime & website monitoring
        </div>
        <div style={{ fontSize: 28, color: '#a1a1aa', marginTop: 24, maxWidth: 800 }}>
          Free tier · 10 monitors · 5-minute checks · SSL, DNS & alerts
        </div>
      </div>
    ),
    { ...size },
  );
}
