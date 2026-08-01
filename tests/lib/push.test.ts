import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PushGoneError, buildPayload, deliver } from '@/lib/push';
import { createMemoryStore } from '@/lib/store';
import type { Store, SubscriptionRecord } from '@/lib/store';

const sub = (n: number): SubscriptionRecord => ({
  endpoint: `https://push.example/${n}`,
  keys: { p256dh: 'p', auth: 'a' },
  ua: 'iPhone',
  createdAt: n,
});

let store: Store;

beforeEach(async () => {
  store = createMemoryStore();
  await store.addSubscription('test-a', sub(1));
  await store.addSubscription('test-a', sub(2));
});

describe('buildPayload', () => {
  it("punta l'icona al preset e usa un tag univoco", () => {
    const payload = buildPayload('test-a', 'B', 1700000000000);
    expect(payload).toEqual({
      title: 'B',
      icon: '/api/icon/test-a/192/',
      tag: 'test-a-1700000000000',
      url: '/p/test-a/',
    });
  });

  it('manda il testo come titolo e non manda il corpo', () => {
    expect(buildPayload('test-a', 'You received a payment of €9.99 EUR', 1700000000000)).toEqual({
      title: 'You received a payment of €9.99 EUR',
      icon: '/api/icon/test-a/192/',
      tag: 'test-a-1700000000000',
      url: '/p/test-a/',
    });
  });
});

describe('deliver', () => {
  it('manda a tutte le subscription del preset', async () => {
    const send = vi.fn(async () => {});
    const result = await deliver(store, 'test-a', buildPayload('test-a', 'B', 1), send);

    expect(send).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ sent: 2, removed: 0 });
  });

  it('rimuove le subscription morte e continua con le altre', async () => {
    const send = vi.fn(async (s: SubscriptionRecord) => {
      if (s.endpoint.endsWith('/1')) throw new PushGoneError(410);
    });

    const result = await deliver(store, 'test-a', buildPayload('test-a', 'B', 1), send);

    expect(result).toEqual({ sent: 1, removed: 1 });
    const left = await store.listSubscriptions('test-a');
    expect(left.map((s) => s.endpoint)).toEqual(['https://push.example/2']);
  });

  it('non rimuove nulla su un errore transitorio', async () => {
    const send = vi.fn(async () => {
      throw new PushGoneError(500);
    });

    const result = await deliver(store, 'test-a', buildPayload('test-a', 'B', 1), send);

    expect(result).toEqual({ sent: 0, removed: 0 });
    expect(await store.listSubscriptions('test-a')).toHaveLength(2);
  });

  it('senza subscription registrate restituisce zero', async () => {
    const send = vi.fn(async () => {});
    const result = await deliver(store, 'vuoto', buildPayload('vuoto', 'B', 1), send);

    expect(send).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: 0, removed: 0 });
  });
});
