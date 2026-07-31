import { Redis } from '@upstash/redis';
import type { IconSet, IconSize, Preset, ScheduledSend, SubscriptionRecord } from './types';

export type { IconSet, IconSize, Preset, ScheduledSend, SubscriptionRecord } from './types';

export class PresetExistsError extends Error {
  constructor(slug: string) {
    super(`Esiste già un preset con lo slug "${slug}"`);
    this.name = 'PresetExistsError';
  }
}

export interface Store {
  listPresets(): Promise<Preset[]>;
  getPreset(slug: string): Promise<Preset | null>;
  createPreset(preset: Preset, icons: IconSet): Promise<void>;
  deletePreset(slug: string): Promise<void>;
  getIcon(slug: string, size: IconSize): Promise<string | null>;

  listSubscriptions(slug: string): Promise<SubscriptionRecord[]>;
  addSubscription(slug: string, sub: SubscriptionRecord): Promise<void>;
  removeSubscription(slug: string, endpoint: string): Promise<void>;

  listScheduled(): Promise<ScheduledSend[]>;
  getScheduled(id: string): Promise<ScheduledSend | null>;
  addScheduled(send: ScheduledSend): Promise<void>;
  removeScheduled(id: string): Promise<void>;
}

const byCreatedAt = (a: Preset, b: Preset) => a.createdAt - b.createdAt;
const bySendAt = (a: ScheduledSend, b: ScheduledSend) => a.sendAt - b.sendAt;

/** Implementazione in memoria, usata dai test. */
export function createMemoryStore(): Store {
  const presets = new Map<string, Preset>();
  const iconsBySlug = new Map<string, IconSet>();
  const subs = new Map<string, SubscriptionRecord[]>();
  const scheduled = new Map<string, ScheduledSend>();

  return {
    async listPresets() {
      return [...presets.values()].sort(byCreatedAt);
    },
    async getPreset(slug) {
      return presets.get(slug) ?? null;
    },
    async createPreset(preset, icons) {
      if (presets.has(preset.slug)) throw new PresetExistsError(preset.slug);
      presets.set(preset.slug, preset);
      iconsBySlug.set(preset.slug, icons);
    },
    async deletePreset(slug) {
      presets.delete(slug);
      iconsBySlug.delete(slug);
      subs.delete(slug);
    },
    async getIcon(slug, size) {
      return iconsBySlug.get(slug)?.[size] ?? null;
    },

    async listSubscriptions(slug) {
      return [...(subs.get(slug) ?? [])];
    },
    async addSubscription(slug, sub) {
      const current = (subs.get(slug) ?? []).filter((s) => s.endpoint !== sub.endpoint);
      current.push(sub);
      subs.set(slug, current);
    },
    async removeSubscription(slug, endpoint) {
      subs.set(
        slug,
        (subs.get(slug) ?? []).filter((s) => s.endpoint !== endpoint),
      );
    },

    async listScheduled() {
      return [...scheduled.values()].sort(bySendAt);
    },
    async getScheduled(id) {
      return scheduled.get(id) ?? null;
    },
    async addScheduled(send) {
      scheduled.set(send.id, send);
    },
    async removeScheduled(id) {
      scheduled.delete(id);
    },
  };
}

const PRESETS_KEY = 'presets';
const SCHEDULED_INDEX_KEY = 'sched:index';

/** Implementazione su Upstash Redis, usata in produzione. */
export function createRedisStore(): Store {
  const redis = Redis.fromEnv();

  const presetKey = (slug: string) => `preset:${slug}`;
  const iconKey = (slug: string, size: IconSize) => `icon:${slug}:${size}`;
  const subsKey = (slug: string) => `subs:${slug}`;
  const scheduledKey = (id: string) => `sched:${id}`;

  return {
    async listPresets() {
      const slugs = await redis.smembers(PRESETS_KEY);
      if (slugs.length === 0) return [];
      const raw = await redis.mget<(Preset | null)[]>(...slugs.map(presetKey));
      return raw.filter((p): p is Preset => p !== null).sort(byCreatedAt);
    },
    async getPreset(slug) {
      return (await redis.get<Preset>(presetKey(slug))) ?? null;
    },
    async createPreset(preset, icons) {
      const added = await redis.sadd(PRESETS_KEY, preset.slug);
      if (added === 0) throw new PresetExistsError(preset.slug);
      await Promise.all([
        redis.set(presetKey(preset.slug), preset),
        redis.set(iconKey(preset.slug, 192), icons[192]),
        redis.set(iconKey(preset.slug, 512), icons[512]),
      ]);
    },
    async deletePreset(slug) {
      await Promise.all([
        redis.srem(PRESETS_KEY, slug),
        redis.del(presetKey(slug), iconKey(slug, 192), iconKey(slug, 512), subsKey(slug)),
      ]);
    },
    async getIcon(slug, size) {
      return (await redis.get<string>(iconKey(slug, size))) ?? null;
    },

    async listSubscriptions(slug) {
      return (await redis.get<SubscriptionRecord[]>(subsKey(slug))) ?? [];
    },
    async addSubscription(slug, sub) {
      const current = (await redis.get<SubscriptionRecord[]>(subsKey(slug))) ?? [];
      const next = current.filter((s) => s.endpoint !== sub.endpoint);
      next.push(sub);
      await redis.set(subsKey(slug), next);
    },
    async removeSubscription(slug, endpoint) {
      const current = (await redis.get<SubscriptionRecord[]>(subsKey(slug))) ?? [];
      await redis.set(
        subsKey(slug),
        current.filter((s) => s.endpoint !== endpoint),
      );
    },

    async listScheduled() {
      const ids = await redis.zrange<string[]>(SCHEDULED_INDEX_KEY, 0, -1);
      if (ids.length === 0) return [];
      const raw = await redis.mget<(ScheduledSend | null)[]>(...ids.map(scheduledKey));
      return raw.filter((s): s is ScheduledSend => s !== null).sort(bySendAt);
    },
    async getScheduled(id) {
      return (await redis.get<ScheduledSend>(scheduledKey(id))) ?? null;
    },
    async addScheduled(send) {
      await Promise.all([
        redis.set(scheduledKey(send.id), send),
        redis.zadd(SCHEDULED_INDEX_KEY, { score: send.sendAt, member: send.id }),
      ]);
    },
    async removeScheduled(id) {
      await Promise.all([redis.del(scheduledKey(id)), redis.zrem(SCHEDULED_INDEX_KEY, id)]);
    },
  };
}

let override: Store | null = null;
let cached: Store | null = null;

/** Sostituisce lo store globale nei test. Passare `null` per ripristinare. */
export function setStoreForTesting(store: Store | null): void {
  override = store;
}

export function getStore(): Store {
  if (override) return override;
  cached ??= createRedisStore();
  return cached;
}
