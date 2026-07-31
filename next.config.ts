import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Serve perché start_url del manifest stia dentro scope. Vedi lo spec.
  // Attenzione: fa redirigere in 308 anche le route /api senza slash finale.
  trailingSlash: true,
};

export default nextConfig;
