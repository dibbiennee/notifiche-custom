import type { Preset } from './store';

export type WebManifest = {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: 'standalone';
  background_color: string;
  theme_color: string;
  icons: Array<{ src: string; sizes: string; type: string; purpose: string }>;
};

export function buildManifest(preset: Preset): WebManifest {
  const scope = `/p/${preset.slug}/`;

  return {
    name: preset.name,
    short_name: preset.name,
    start_url: scope,
    scope,
    display: 'standalone',
    background_color: '#0b0b0f',
    theme_color: '#0b0b0f',
    icons: [
      { src: `/api/icon/${preset.slug}/192/`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `/api/icon/${preset.slug}/512/`, sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
