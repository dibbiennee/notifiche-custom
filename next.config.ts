import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Serve perché start_url del manifest stia dentro scope. Vedi lo spec.
  // Attenzione: fa redirigere in 308 anche le route /api senza slash finale.
  trailingSlash: true,

  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
    ];
  },
};

export default nextConfig;
