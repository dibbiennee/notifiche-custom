import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/deliver/route';
import { UnauthorizedError } from '@/lib/auth';
import { createMemoryStore, setStoreForTesting } from '@/lib/store';
import type { Store } from '@/lib/store';

// vi.hoisted è obbligatorio: vi.mock viene issato sopra queste dichiarazioni,
// e la factory non può riferirsi a const che non esistono ancora.
const { verifyQstashSignature, sent } = vi.hoisted(() => ({
  verifyQstashSignature: vi.fn(),
  sent: [] as string[],
}));

vi.mock('@/lib/qstash', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/qstash')>();
  return { ...actual, verifyQstashSignature };
});

vi.mock('@/lib/push', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/push')>();
  return {
    ...actual,
    webPushSender: async (_sub: unknown, payload: string) => {
      sent.push(payload);
    },
  };
});

let store: Store;

beforeEach(async () => {
  sent.length = 0;
  verifyQstashSignature.mockReset();
  verifyQstashSignature.mockResolvedValue(undefined);

  store = createMemoryStore();
  setStoreForTesting(store);
  await store.createPreset(
    { slug: 'test-a', name: 'Test A', defaultBody: '', createdAt: 1 },
    { 192: 'a', 512: 'b' },
  );
  await store.addSubscription('test-a', {
    endpoint: 'https://push.example/1',
    keys: { p256dh: 'p', auth: 'a' },
    ua: 'iPhone',
    createdAt: 1,
  });
  await store.addScheduled({
    id: 'id-1',
    slug: 'test-a',
    body: 'B',
    sendAt: 1,
    messageId: 'msg-1',
  });
});

afterEach(() => setStoreForTesting(null));

const call = (body: unknown) =>
  POST(
    new Request('https://x.test/api/deliver/', {
      method: 'POST',
      headers: { 'upstash-signature': 'firma' },
      body: JSON.stringify(body),
    }),
  );

describe('POST /api/deliver/', () => {
  it('consegna e rimuove il record programmato', async () => {
    const res = await call({ id: 'id-1', slug: 'test-a', body: 'B' });
    expect(res.status).toBe(200);
    expect(JSON.parse(sent[0]!)).toMatchObject({ title: 'B' });
    expect(await store.getScheduled('id-1')).toBeNull();
  });

  it('risponde 401 e non consegna se la firma non è valida', async () => {
    verifyQstashSignature.mockRejectedValueOnce(new UnauthorizedError());

    const res = await call({ id: 'id-1', slug: 'test-a', body: 'B' });
    expect(res.status).toBe(401);
    expect(sent).toEqual([]);
    expect(await store.getScheduled('id-1')).not.toBeNull();
  });

  it('non fallisce se il record era già stato rimosso', async () => {
    await store.removeScheduled('id-1');
    const res = await call({ id: 'id-1', slug: 'test-a', body: 'B' });
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
  });

  it('risponde 400 su un payload malformato', async () => {
    expect((await call({ id: 'id-1' })).status).toBe(400);
  });
});
