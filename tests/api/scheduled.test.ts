import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { DELETE, GET } from '@/app/api/scheduled/route';
import { setQstashClientForTesting } from '@/lib/qstash';
import type { QstashClient } from '@/lib/qstash';
import { createMemoryStore, setStoreForTesting } from '@/lib/store';
import type { Store } from '@/lib/store';

let store: Store;
let del: Mock<QstashClient['messages']['delete']>;

beforeEach(async () => {
  vi.stubEnv('APP_TOKEN', 'segreto');
  store = createMemoryStore();
  setStoreForTesting(store);
  await store.addScheduled({
    id: 'id-1',
    slug: 'test-a',
    title: 'T',
    body: 'B',
    sendAt: 2000,
    messageId: 'msg-1',
  });

  del = vi.fn<QstashClient['messages']['delete']>(async () => undefined);
  setQstashClientForTesting({ publishJSON: vi.fn(), messages: { delete: del } });
});

afterEach(() => {
  setStoreForTesting(null);
  setQstashClientForTesting(null);
  vi.unstubAllEnvs();
});

const authed = (url: string, method: string) =>
  new Request(url, { method, headers: { authorization: 'Bearer segreto' } });

describe('GET /api/scheduled/', () => {
  it('elenca i programmati', async () => {
    const res = await GET(authed('https://x.test/api/scheduled/', 'GET'));
    expect(res.status).toBe(200);
    expect((await res.json()).scheduled).toHaveLength(1);
  });

  it('risponde 401 senza token', async () => {
    const res = await GET(new Request('https://x.test/api/scheduled/'));
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/scheduled/', () => {
  it('cancella su QStash e rimuove il record', async () => {
    const res = await DELETE(authed('https://x.test/api/scheduled/?id=id-1', 'DELETE'));
    expect(res.status).toBe(200);
    expect(del).toHaveBeenCalledWith('msg-1');
    expect(await store.getScheduled('id-1')).toBeNull();
  });

  it('risponde 404 su un id inesistente', async () => {
    const res = await DELETE(authed('https://x.test/api/scheduled/?id=boh', 'DELETE'));
    expect(res.status).toBe(404);
  });

  it('risponde 400 senza id', async () => {
    const res = await DELETE(authed('https://x.test/api/scheduled/', 'DELETE'));
    expect(res.status).toBe(400);
  });

  it('rimuove comunque il record se QStash risponde 404', async () => {
    del.mockRejectedValueOnce(Object.assign(new Error('not found'), { status: 404 }));
    const res = await DELETE(authed('https://x.test/api/scheduled/?id=id-1', 'DELETE'));
    expect(res.status).toBe(200);
    expect(await store.getScheduled('id-1')).toBeNull();
  });
});
