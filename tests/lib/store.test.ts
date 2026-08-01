import { beforeEach, describe, expect, it } from 'vitest';
import { PresetExistsError, createMemoryStore } from '@/lib/store';
import type { Preset, ScheduledSend, Store, SubscriptionRecord } from '@/lib/store';

const preset: Preset = {
  slug: 'test-a',
  name: 'Test A',
  defaultBody: 'Corpo',
  createdAt: 1,
};

const icons = { 192: 'aaa', 512: 'bbb' } as const;

const sub: SubscriptionRecord = {
  endpoint: 'https://push.example/1',
  keys: { p256dh: 'p', auth: 'a' },
  ua: 'iPhone',
  createdAt: 2,
};

let store: Store;

beforeEach(() => {
  store = createMemoryStore();
});

describe('preset', () => {
  it('crea, legge ed elenca', async () => {
    await store.createPreset(preset, icons);
    expect(await store.getPreset('test-a')).toEqual(preset);
    expect(await store.listPresets()).toEqual([preset]);
  });

  it('restituisce null per uno slug inesistente', async () => {
    expect(await store.getPreset('boh')).toBeNull();
  });

  it('rifiuta uno slug già usato', async () => {
    await store.createPreset(preset, icons);
    await expect(store.createPreset(preset, icons)).rejects.toBeInstanceOf(PresetExistsError);
  });

  it('elimina preset, icone e subscription insieme', async () => {
    await store.createPreset(preset, icons);
    await store.addSubscription('test-a', sub);
    await store.deletePreset('test-a');

    expect(await store.getPreset('test-a')).toBeNull();
    expect(await store.getIcon('test-a', 192)).toBeNull();
    expect(await store.listSubscriptions('test-a')).toEqual([]);
    expect(await store.listPresets()).toEqual([]);
  });

  it('salva e rilegge le due icone', async () => {
    await store.createPreset(preset, icons);
    expect(await store.getIcon('test-a', 192)).toBe('aaa');
    expect(await store.getIcon('test-a', 512)).toBe('bbb');
  });
});

describe('subscription', () => {
  it('aggiunge senza duplicare lo stesso endpoint', async () => {
    await store.addSubscription('test-a', sub);
    await store.addSubscription('test-a', { ...sub, createdAt: 99 });
    const all = await store.listSubscriptions('test-a');
    expect(all).toHaveLength(1);
    expect(all[0]!.createdAt).toBe(99);
  });

  it('rimuove per endpoint', async () => {
    await store.addSubscription('test-a', sub);
    await store.removeSubscription('test-a', sub.endpoint);
    expect(await store.listSubscriptions('test-a')).toEqual([]);
  });
});

describe('invii programmati', () => {
  const scheduled: ScheduledSend = {
    id: 'id-1',
    slug: 'test-a',
    body: 'B',
    sendAt: 2000,
    messageId: 'msg-1',
  };

  it('aggiunge, legge, elenca in ordine di consegna e rimuove', async () => {
    await store.addScheduled({ ...scheduled, id: 'id-2', sendAt: 1000 });
    await store.addScheduled(scheduled);

    expect((await store.listScheduled()).map((s) => s.id)).toEqual(['id-2', 'id-1']);
    expect(await store.getScheduled('id-1')).toEqual(scheduled);

    await store.removeScheduled('id-1');
    expect(await store.getScheduled('id-1')).toBeNull();
    expect((await store.listScheduled()).map((s) => s.id)).toEqual(['id-2']);
  });
});
