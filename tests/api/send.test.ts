import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { POST } from '@/app/api/send/route';
import { setQstashClientForTesting } from '@/lib/qstash';
import type { QstashClient } from '@/lib/qstash';
import { createMemoryStore, setStoreForTesting } from '@/lib/store';
import type { Store } from '@/lib/store';

// vi.mock viene issato sopra le const del modulo: senza vi.hoisted, `sent`
// non esisterebbe ancora quando la factory viene valutata.
const { sent, deferred } = vi.hoisted(() => ({
  sent: [] as string[],
  deferred: [] as Array<() => Promise<void>>,
}));

// after() di Next funziona solo dentro lo scope di una richiesta, che chiamando
// la route direttamente non esiste. Qui raccogliamo il callback invece di
// eseguirlo: quello che conta è che la route risponda 202 e registri la consegna,
// non che il test resti fermo ad aspettare il ritardo.
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return {
    ...actual,
    after: (callback: () => Promise<void>) => {
      deferred.push(callback);
    },
  };
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
let publishJSON: Mock<QstashClient['publishJSON']>;

beforeEach(async () => {
  sent.length = 0;
  deferred.length = 0;
  vi.stubEnv('APP_TOKEN', 'segreto');
  vi.stubEnv('PUBLIC_BASE_URL', 'https://app.test');

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

  publishJSON = vi.fn<QstashClient['publishJSON']>(async () => ({ messageId: 'msg-1' }));
  setQstashClientForTesting({ publishJSON, messages: { delete: vi.fn() } });
});

afterEach(() => {
  setStoreForTesting(null);
  setQstashClientForTesting(null);
  vi.unstubAllEnvs();
});

const call = (body: unknown, token = 'segreto') =>
  POST(
    new Request('https://x.test/api/send/', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
  );

describe('POST /api/send/ — ramo immediato', () => {
  it('consegna subito con delaySeconds 0', async () => {
    const res = await call({ slug: 'test-a', body: 'B', delaySeconds: 0 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ mode: 'immediate', sent: 1, removed: 0 });
    expect(JSON.parse(sent[0]!)).toMatchObject({ title: 'B' });
    expect(publishJSON).not.toHaveBeenCalled();
  });
});

describe('POST /api/send/ — ramo inline ritardato', () => {
  it('accetta un ritardo entro la soglia senza passare da QStash', async () => {
    const res = await call({ slug: 'test-a', body: 'B', delaySeconds: 30 });
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ mode: 'inline', delaySeconds: 30 });
    expect(publishJSON).not.toHaveBeenCalled();

    // La consegna è rimandata a dopo la risposta, non persa.
    expect(deferred).toHaveLength(1);
    expect(sent).toEqual([]);
  });

  it('consegna davvero quando il callback rimandato viene eseguito', async () => {
    vi.useFakeTimers();
    try {
      await call({ slug: 'test-a', body: 'B', delaySeconds: 10 });

      const run = deferred[0]!();
      await vi.advanceTimersByTimeAsync(10_000);
      await run;

      expect(JSON.parse(sent[0]!)).toMatchObject({ title: 'B' });
    } finally {
      vi.useRealTimers();
    }
  });

  it("rifiuta se non c'è nessun device registrato", async () => {
    await store.removeSubscription('test-a', 'https://push.example/1');
    const res = await call({ slug: 'test-a', body: 'B', delaySeconds: 10 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/device/i);
  });
});

describe('POST /api/send/ — ramo QStash', () => {
  it('programma oltre la soglia e salva il record', async () => {
    const res = await call({ slug: 'test-a', body: 'B', delaySeconds: 3600 });
    expect(res.status).toBe(202);

    const json = await res.json();
    expect(json.mode).toBe('scheduled');

    expect(publishJSON).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://app.test/api/deliver/', delay: '3600s' }),
    );

    const scheduled = await store.listScheduled();
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]).toMatchObject({
      slug: 'test-a',
      body: 'B',
      messageId: 'msg-1',
    });
    expect(scheduled[0]!.id).toBe(json.id);
  });

  it('non lascia record fantasma se QStash fallisce', async () => {
    publishJSON.mockRejectedValueOnce(new Error('qstash down'));
    const res = await call({ slug: 'test-a', body: 'B', delaySeconds: 3600 });

    expect(res.status).toBe(500);
    expect(await store.listScheduled()).toEqual([]);
  });
});

describe('POST /api/send/ — validazione', () => {
  it('risponde 401 con token sbagliato', async () => {
    const res = await call({ slug: 'test-a', body: 'B', delaySeconds: 0 }, 'altro00');
    expect(res.status).toBe(401);
  });

  it('risponde 404 su preset inesistente', async () => {
    expect((await call({ slug: 'boh', body: 'B', delaySeconds: 0 })).status).toBe(404);
  });

  it('risponde 400 su testo vuoto o ritardo fuori range', async () => {
    expect((await call({ slug: 'test-a', body: '  ', delaySeconds: 0 })).status).toBe(400);
    expect((await call({ slug: 'test-a', body: 'B', delaySeconds: -1 })).status).toBe(
      400,
    );
    expect(
      (await call({ slug: 'test-a', body: 'B', delaySeconds: 604801 })).status,
    ).toBe(400);
  });
});

describe('POST /api/send/ — serie', () => {
  const serie = (extra: Record<string, unknown>) =>
    call({
      slug: 'test-a',
      body: 'You received a payment of €|importo| EUR',
      delaySeconds: 60,
      amounts: ['9.99', '1890.00'],
      ...extra,
    });

  it('programma una notifica per ogni istante calcolato', async () => {
    const res = await serie({
      series: { limit: { kind: 'count', count: 3 }, cadence: { kind: 'fixed', seconds: 60 } },
    });

    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.mode).toBe('series');
    expect(json.count).toBe(3);
    expect(publishJSON).toHaveBeenCalledTimes(3);
    expect(publishJSON.mock.calls.map((c) => c[0]!.delay)).toEqual(['60s', '120s', '180s']);

    const scheduled = await store.listScheduled();
    expect(scheduled).toHaveLength(3);
    expect(new Set(scheduled.map((s) => s.seriesId)).size).toBe(1);
  });

  it('sostituisce il segnaposto con uno degli importi scelti', async () => {
    await serie({
      series: { limit: { kind: 'count', count: 3 }, cadence: { kind: 'fixed', seconds: 60 } },
    });

    for (const chiamata of publishJSON.mock.calls) {
      const inviato = (chiamata[0]!.body as { body: string }).body;
      expect([
        'You received a payment of €9.99 EUR',
        'You received a payment of €1890.00 EUR',
      ]).toContain(inviato);
    }
  });

  it('rifiuta il segnaposto senza importi scelti', async () => {
    const res = await serie({
      amounts: [],
      series: { limit: { kind: 'count', count: 2 }, cadence: { kind: 'fixed', seconds: 60 } },
    });

    expect(res.status).toBe(400);
    expect(publishJSON).not.toHaveBeenCalled();
  });

  it('rifiuta una serie oltre le cento notifiche senza pubblicare niente', async () => {
    const res = await serie({
      series: { limit: { kind: 'count', count: 101 }, cadence: { kind: 'fixed', seconds: 60 } },
    });

    expect(res.status).toBe(400);
    expect(publishJSON).not.toHaveBeenCalled();
    expect(await store.listScheduled()).toHaveLength(0);
  });

  it('annulla quelle già pubblicate se una pubblicazione fallisce', async () => {
    const del = vi.fn<QstashClient['messages']['delete']>(async () => undefined);
    let n = 0;
    publishJSON.mockImplementation(async () => {
      n += 1;
      if (n === 3) throw new Error('QStash giù');
      return { messageId: `msg-${n}` };
    });
    setQstashClientForTesting({ publishJSON, messages: { delete: del } });

    const res = await serie({
      series: { limit: { kind: 'count', count: 4 }, cadence: { kind: 'fixed', seconds: 60 } },
    });

    expect(res.status).toBe(500);
    expect(del).toHaveBeenCalledTimes(2);
    expect(await store.listScheduled()).toHaveLength(0);
  });

  it('consegna inline le notifiche entro i trenta secondi', async () => {
    const res = await serie({
      delaySeconds: 0,
      series: { limit: { kind: 'count', count: 3 }, cadence: { kind: 'fixed', seconds: 10 } },
    });

    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json).toMatchObject({ mode: 'series', count: 3, scheduled: 0, inline: 3 });
    expect(publishJSON).not.toHaveBeenCalled();
  });
});
