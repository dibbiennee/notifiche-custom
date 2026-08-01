import { describe, expect, it } from 'vitest';
import { buildManifest } from '@/lib/manifest';
import type { Preset } from '@/lib/store';

const preset: Preset = {
  slug: 'test-a',
  name: 'Test A',
  defaultBody: '',
  createdAt: 1,
};

describe('buildManifest', () => {
  const manifest = buildManifest(preset);

  it('usa il nome del preset', () => {
    expect(manifest.name).toBe('Test A');
    expect(manifest.short_name).toBe('Test A');
  });

  it('è standalone, senza cui iOS non abilita le push', () => {
    expect(manifest.display).toBe('standalone');
  });

  it('ha start_url e scope con lo slash finale', () => {
    expect(manifest.start_url).toBe('/p/test-a/');
    expect(manifest.scope).toBe('/p/test-a/');
  });

  it('tiene start_url dentro scope', () => {
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
  });

  it('dichiara le due icone PNG', () => {
    expect(manifest.icons).toEqual([
      { src: '/api/icon/test-a/192/', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/api/icon/test-a/512/', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ]);
  });
});
