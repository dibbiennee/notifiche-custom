import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET } from '@/app/p/[slug]/manifest/route';
import { createMemoryStore, setStoreForTesting } from '@/lib/store';

beforeEach(async () => {
  const store = createMemoryStore();
  setStoreForTesting(store);
  await store.createPreset(
    { slug: 'test-a', name: 'Test A', defaultBody: '', createdAt: 1 },
    { 192: 'a', 512: 'b' },
  );
});

afterEach(() => setStoreForTesting(null));

const call = (slug: string) =>
  GET(new Request(`https://x.test/p/${slug}/manifest/`), { params: Promise.resolve({ slug }) });

describe('GET /p/[slug]/manifest/', () => {
  it('serve il manifest del preset con il content type corretto', async () => {
    const res = await call('test-a');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/manifest+json');
    expect((await res.json()).name).toBe('Test A');
  });

  it("risponde 404 se il preset non c'è", async () => {
    expect((await call('boh')).status).toBe(404);
  });
});
