import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/subscribe/route';
import { createMemoryStore, setStoreForTesting } from '@/lib/store';
import type { Store } from '@/lib/store';

let store: Store;

beforeEach(async () => {
  vi.stubEnv('APP_TOKEN', 'segreto');
  store = createMemoryStore();
  setStoreForTesting(store);
  await store.createPreset(
    { slug: 'test-a', name: 'Test A', defaultBody: '', createdAt: 1 },
    { 192: 'a', 512: 'b' },
  );
});

afterEach(() => {
  setStoreForTesting(null);
  vi.unstubAllEnvs();
});

const call = (body: unknown, token = 'segreto') =>
  POST(
    new Request('https://x.test/api/subscribe/', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'user-agent': 'iPhone' },
      body: JSON.stringify(body),
    }),
  );

const validBody = {
  slug: 'test-a',
  subscription: {
    endpoint: 'https://push.example/1',
    keys: { p256dh: 'p', auth: 'a' },
  },
};

describe('POST /api/subscribe/', () => {
  it('registra la subscription sul preset', async () => {
    const res = await call(validBody);
    expect(res.status).toBe(200);

    const subs = await store.listSubscriptions('test-a');
    expect(subs).toHaveLength(1);
    expect(subs[0]!.endpoint).toBe('https://push.example/1');
    expect(subs[0]!.ua).toBe('iPhone');
  });

  it('è idempotente sullo stesso endpoint', async () => {
    await call(validBody);
    await call(validBody);
    expect(await store.listSubscriptions('test-a')).toHaveLength(1);
  });

  it('risponde 404 su un preset inesistente', async () => {
    expect((await call({ ...validBody, slug: 'boh' })).status).toBe(404);
  });

  it('risponde 400 su una subscription malformata', async () => {
    expect((await call({ slug: 'test-a', subscription: { endpoint: 'x' } })).status).toBe(400);
    expect((await call({ slug: 'test-a' })).status).toBe(400);
  });

  it('risponde 401 con token sbagliato', async () => {
    expect((await call(validBody, 'altro00')).status).toBe(401);
  });
});
