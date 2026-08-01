import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET } from '@/app/api/icon/[slug]/[size]/route';
import { createMemoryStore, setStoreForTesting } from '@/lib/store';
import type { Store } from '@/lib/store';

// PNG 1x1 trasparente.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

let store: Store;

beforeEach(async () => {
  store = createMemoryStore();
  setStoreForTesting(store);
  await store.createPreset(
    { slug: 'test-a', name: 'Test A', defaultBody: '', createdAt: 1 },
    { 192: PNG_BASE64, 512: PNG_BASE64 },
  );
});

afterEach(() => setStoreForTesting(null));

const call = (slug: string, size: string) =>
  GET(new Request(`https://x.test/api/icon/${slug}/${size}/`), {
    params: Promise.resolve({ slug, size }),
  });

describe('GET /api/icon/[slug]/[size]/', () => {
  it('serve il PNG con il content type giusto', async () => {
    const res = await call('test-a', '192');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it("risponde 404 se il preset non c'è", async () => {
    expect((await call('boh', '192')).status).toBe(404);
  });

  it('risponde 400 su una dimensione non ammessa', async () => {
    expect((await call('test-a', '256')).status).toBe(400);
  });

  it('non richiede autenticazione: le icone servono al manifest', async () => {
    expect((await call('test-a', '512')).status).toBe(200);
  });
});
