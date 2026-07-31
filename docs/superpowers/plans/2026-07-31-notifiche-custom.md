# Notifiche push personalizzate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una PWA installabile su iPhone che fa arrivare una push con testo scelto al momento, sotto un nome e un logo scelti da chi la installa, subito o dopo un ritardo arbitrario.

**Architecture:** Next.js su Vercel. Un *preset* (nome + logo) diventa un manifest generato al volo, quindi un'icona sulla Home iOS; ogni preset registra lo stesso service worker statico con uno scope proprio, ottenendo una push subscription isolata. L'invio ha due rami: ritardi ≤ 30s gestiti dentro la function, ritardi maggiori delegati a QStash che richiama `/api/deliver/`. Tutto lo stato sta su Upstash Redis.

**Tech Stack:** Next.js 15 (App Router, TypeScript), `web-push`, `@upstash/redis`, `@upstash/qstash`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-31-notifiche-custom-design.md`

## Global Constraints

- **`trailingSlash: true`** in `next.config.ts`. Ogni URL interno usato in `fetch`, in `href`, o passato a QStash **deve già finire con `/`** — altrimenti Next risponde `308` e si aggiunge un hop inutile. Esempio: `/api/send/`, non `/api/send`.
- **Il service worker è un file statico in `public/sw.js`.** Mai una route dinamica: la specifica Service Worker rifiuta uno script che risponde con un redirect. Si registra sempre con scope esplicito: `navigator.serviceWorker.register('/sw.js', { scope: '/p/<slug>/' })`.
- **`display: "standalone"`** nel manifest è obbligatorio: senza, iOS non abilita le push.
- **Le icone vengono appiattite su un colore di sfondo opaco** prima dell'upload. La trasparenza sulla Home di iOS diventa nera.
- **Ritardo massimo: 604800 secondi (7 giorni)**, limite di QStash. **Soglia inline/QStash: 30 secondi.**
- **`Notification.requestPermission()` va chiamata dentro un handler di click**, mai all'avvio della pagina: iOS la ignora se non c'è un gesto utente.
- **Il client non vede mai `QSTASH_TOKEN`, `VAPID_PRIVATE_KEY`, `UPSTASH_*`.** L'unica cosa che arriva al browser è `VAPID_PUBLIC_KEY`, passata come prop da un server component.
- Testi utente e commenti in italiano; identificatori di codice in inglese.

---

## Struttura dei file

| File | Responsabilità |
|---|---|
| `next.config.ts` | `trailingSlash`, header per `/sw.js` |
| `vitest.config.ts` | test runner, alias `@/` |
| `public/sw.js` | service worker: eventi `push` e `notificationclick` |
| `src/lib/slug.ts` | `slugify` |
| `src/lib/delay.ts` | conversione unità → secondi, validazione, scelta del ramo di consegna |
| `src/lib/types.ts` | `Preset`, `SubscriptionRecord`, `ScheduledSend` |
| `src/lib/store.ts` | interfaccia `Store` + `createMemoryStore` + `createRedisStore` + `getStore` |
| `src/lib/auth.ts` | verifica `Authorization: Bearer` contro `APP_TOKEN` |
| `src/lib/push.ts` | consegna a tutte le subscription di un preset, pulizia dei morti |
| `src/lib/qstash.ts` | `publishDelayed`, `cancelMessage`, `verifySignature` |
| `src/lib/manifest.ts` | costruzione dell'oggetto manifest |
| `src/lib/image.ts` | crop/resize/appiattimento dell'icona (solo browser) |
| `src/lib/client.ts` | wrapper `fetch` autenticato (solo browser) |
| `src/app/api/presets/route.ts` | `GET` `POST` `DELETE` preset |
| `src/app/api/icon/[slug]/[size]/route.ts` | serve il PNG |
| `src/app/api/subscribe/route.ts` | registra la subscription |
| `src/app/api/send/route.ts` | invio, entrambi i rami |
| `src/app/api/deliver/route.ts` | callback QStash |
| `src/app/api/scheduled/route.ts` | lista e annullamento programmati |
| `src/app/p/[slug]/manifest/route.ts` | manifest generato |
| `src/app/p/[slug]/page.tsx` | server component: carica il preset, passa la chiave VAPID |
| `src/app/p/[slug]/PresetApp.tsx` | client component: standalone check, attivazione, composer, programmati |
| `src/app/page.tsx` | admin: lista e creazione preset |
| `src/app/AdminApp.tsx` | client component dell'admin |

---

## Task 1: Scaffolding del progetto

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.gitignore`, `.env.example`, `src/app/layout.tsx`, `src/app/globals.css`
- Test: `tests/setup.test.ts`

**Interfaces:**
- Consumes: niente
- Produces: `npm test` funzionante, alias `@/` verso `src/`

> La cartella contiene già `docs/` e `.git`, quindi `create-next-app` rifiuterebbe di partire. Lo scaffolding è manuale e completo qui sotto.

- [ ] **Step 1: Installare le dipendenze**

```bash
npm init -y
npm install next@^15 react@^19 react-dom@^19 web-push@^3 @upstash/redis@^1 @upstash/qstash@^2
npm install -D typescript @types/node @types/react @types/react-dom @types/web-push vitest @playwright/test
```

- [ ] **Step 2: Scrivere `package.json`**

Sostituire il contenuto generato da `npm init` mantenendo i blocchi `dependencies` e `devDependencies` appena creati:

```json
{
  "name": "notifiche-custom",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
}
```

- [ ] **Step 3: Scrivere `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Scrivere `next.config.ts`**

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Serve perché start_url del manifest stia dentro scope. Vedi lo spec.
  // Attenzione: fa redirigere in 308 anche le route /api senza slash finale.
  trailingSlash: true,
};

export default nextConfig;
```

- [ ] **Step 5: Scrivere `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
```

- [ ] **Step 6: Scrivere `.gitignore`**

```
node_modules/
.next/
next-env.d.ts
.env*.local
.vercel
test-results/
playwright-report/
```

- [ ] **Step 7: Scrivere `.env.example`**

```
# Chiavi VAPID: generale con `npx web-push generate-vapid-keys`
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:tu@esempio.it

# Token unico di accesso all'app: `openssl rand -hex 32`
APP_TOKEN=

# Upstash Redis
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Upstash QStash
QSTASH_TOKEN=
QSTASH_CURRENT_SIGNING_KEY=
QSTASH_NEXT_SIGNING_KEY=

# URL pubblico di produzione, senza slash finale. Es. https://mio-progetto.vercel.app
PUBLIC_BASE_URL=
```

- [ ] **Step 8: Scrivere `src/app/globals.css`**

```css
:root {
  color-scheme: dark;
  --bg: #0b0b0f;
  --panel: #16161d;
  --border: #2a2a36;
  --text: #f2f2f7;
  --muted: #9a9aae;
  --accent: #5b7cfa;
  --danger: #f2545b;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--text);
  font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}

main { max-width: 34rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; }

h1 { font-size: 1.4rem; margin: 0 0 1.25rem; }
h2 { font-size: 1.05rem; margin: 2rem 0 0.75rem; }

label { display: block; font-size: 0.85rem; color: var(--muted); margin-bottom: 0.35rem; }

input, select, textarea, button {
  font: inherit;
  color: inherit;
  border-radius: 0.6rem;
  border: 1px solid var(--border);
  background: var(--panel);
  padding: 0.65rem 0.75rem;
  width: 100%;
}

button {
  background: var(--accent);
  border-color: transparent;
  font-weight: 600;
  cursor: pointer;
}

button:disabled { opacity: 0.5; cursor: default; }
button.secondary { background: var(--panel); border-color: var(--border); font-weight: 400; }
button.danger { background: transparent; border-color: var(--danger); color: var(--danger); }

.field { margin-bottom: 1rem; }
.row { display: flex; gap: 0.5rem; }
.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 0.9rem;
  padding: 1rem;
  margin-bottom: 0.75rem;
}
.muted { color: var(--muted); font-size: 0.85rem; }
.error { color: var(--danger); font-size: 0.9rem; margin-top: 0.5rem; }
.ok { color: #4ec9a0; font-size: 0.9rem; margin-top: 0.5rem; }
.chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.chips button { width: auto; padding: 0.35rem 0.7rem; font-size: 0.85rem; }
```

- [ ] **Step 9: Scrivere `src/app/layout.tsx`**

```tsx
import type { ReactNode } from 'react';
import './globals.css';

export const metadata = { title: 'Notifiche' };

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 10: Scrivere il test di smoke `tests/setup.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config';

describe('configurazione del progetto', () => {
  it('ha trailingSlash attivo, senza cui il manifest non è installabile su iOS', () => {
    expect(nextConfig.trailingSlash).toBe(true);
  });
});
```

- [ ] **Step 11: Eseguire i test**

Run: `npm test`
Expected: PASS, 1 test.

- [ ] **Step 12: Verificare che la build parta**

Run: `npm run build`
Expected: build completata senza errori.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "chore: scaffolding Next.js, TypeScript e Vitest"
```

---

## Task 2: Utility pure — slug e ritardo

**Files:**
- Create: `src/lib/slug.ts`, `src/lib/delay.ts`
- Test: `tests/lib/slug.test.ts`, `tests/lib/delay.test.ts`

**Interfaces:**
- Consumes: niente
- Produces:
  - `slugify(name: string): string` — lancia `RangeError` se il nome non produce nulla di valido
  - `MAX_DELAY_SECONDS: 604800`, `INLINE_THRESHOLD_SECONDS: 30`
  - `type DelayUnit = 'seconds' | 'minutes' | 'hours'`
  - `toDelaySeconds(value: number, unit: DelayUnit): number` — lancia `RangeError`
  - `type DeliveryMode = 'inline' | 'scheduled'`
  - `deliveryMode(delaySeconds: number): DeliveryMode`

- [ ] **Step 1: Scrivere i test falliti di `slugify`**

`tests/lib/slug.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { slugify } from '@/lib/slug';

describe('slugify', () => {
  it('mette in minuscolo e sostituisce gli spazi', () => {
    expect(slugify('Test A')).toBe('test-a');
  });

  it('toglie gli accenti', () => {
    expect(slugify('Città Perù')).toBe('citta-peru');
  });

  it('comprime la punteggiatura e non lascia trattini ai bordi', () => {
    expect(slugify('  Test!!  A??  ')).toBe('test-a');
  });

  it('tronca a 48 caratteri senza lasciare un trattino finale', () => {
    const slug = slugify('a'.repeat(40) + ' ' + 'b'.repeat(20));
    expect(slug.length).toBeLessThanOrEqual(48);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('rifiuta un nome che non produce caratteri utili', () => {
    expect(() => slugify('🎉 ✨')).toThrow(RangeError);
    expect(() => slugify('   ')).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Eseguire e verificare il fallimento**

Run: `npx vitest run tests/lib/slug.test.ts`
Expected: FAIL — impossibile risolvere `@/lib/slug`.

- [ ] **Step 3: Implementare `src/lib/slug.ts`**

```ts
const MAX_SLUG_LENGTH = 48;

/** Trasforma il nome di un preset in uno slug utilizzabile come segmento di URL. */
export function slugify(name: string): string {
  const slug = name
    // U+0300-U+036F è il blocco dei segni diacritici combinanti che NFD separa.
    // Va scritto con gli escape: i caratteri letterali sono invisibili e si perdono
    // in copia-incolla.
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');

  if (!slug) {
    throw new RangeError('Il nome deve contenere almeno una lettera o una cifra');
  }

  return slug;
}
```

- [ ] **Step 4: Eseguire e verificare il successo**

Run: `npx vitest run tests/lib/slug.test.ts`
Expected: PASS, 5 test.

- [ ] **Step 5: Scrivere i test falliti del ritardo**

`tests/lib/delay.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  INLINE_THRESHOLD_SECONDS,
  MAX_DELAY_SECONDS,
  deliveryMode,
  toDelaySeconds,
} from '@/lib/delay';

describe('toDelaySeconds', () => {
  it('converte le tre unità', () => {
    expect(toDelaySeconds(45, 'seconds')).toBe(45);
    expect(toDelaySeconds(5, 'minutes')).toBe(300);
    expect(toDelaySeconds(2, 'hours')).toBe(7200);
  });

  it('accetta zero', () => {
    expect(toDelaySeconds(0, 'seconds')).toBe(0);
  });

  it('accetta esattamente 7 giorni', () => {
    expect(toDelaySeconds(168, 'hours')).toBe(MAX_DELAY_SECONDS);
  });

  it('rifiuta oltre 7 giorni', () => {
    expect(() => toDelaySeconds(169, 'hours')).toThrow(RangeError);
  });

  it('rifiuta valori negativi o non interi', () => {
    expect(() => toDelaySeconds(-1, 'seconds')).toThrow(RangeError);
    expect(() => toDelaySeconds(1.5, 'minutes')).toThrow(RangeError);
    expect(() => toDelaySeconds(Number.NaN, 'seconds')).toThrow(RangeError);
  });

  it("rifiuta un'unità sconosciuta", () => {
    expect(() => toDelaySeconds(1, 'days' as never)).toThrow(RangeError);
  });
});

describe('deliveryMode', () => {
  it('resta inline fino alla soglia compresa', () => {
    expect(deliveryMode(0)).toBe('inline');
    expect(deliveryMode(INLINE_THRESHOLD_SECONDS)).toBe('inline');
  });

  it('passa a QStash oltre la soglia', () => {
    expect(deliveryMode(INLINE_THRESHOLD_SECONDS + 1)).toBe('scheduled');
    expect(deliveryMode(3600)).toBe('scheduled');
  });
});
```

- [ ] **Step 6: Eseguire e verificare il fallimento**

Run: `npx vitest run tests/lib/delay.test.ts`
Expected: FAIL — impossibile risolvere `@/lib/delay`.

- [ ] **Step 7: Implementare `src/lib/delay.ts`**

```ts
/** Limite di QStash per la consegna ritardata. */
export const MAX_DELAY_SECONDS = 7 * 24 * 60 * 60;

/** Fino a questa soglia l'invio resta dentro la function, senza passare da QStash. */
export const INLINE_THRESHOLD_SECONDS = 30;

export type DelayUnit = 'seconds' | 'minutes' | 'hours';

const MULTIPLIERS: Record<DelayUnit, number> = {
  seconds: 1,
  minutes: 60,
  hours: 3600,
};

export function toDelaySeconds(value: number, unit: DelayUnit): number {
  const multiplier = MULTIPLIERS[unit];
  if (multiplier === undefined) {
    throw new RangeError(`Unità di ritardo non valida: ${unit}`);
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError('Il ritardo deve essere un numero intero maggiore o uguale a zero');
  }

  const seconds = value * multiplier;
  if (seconds > MAX_DELAY_SECONDS) {
    throw new RangeError('Il ritardo massimo è 7 giorni');
  }

  return seconds;
}

export type DeliveryMode = 'inline' | 'scheduled';

export function deliveryMode(delaySeconds: number): DeliveryMode {
  return delaySeconds <= INLINE_THRESHOLD_SECONDS ? 'inline' : 'scheduled';
}
```

- [ ] **Step 8: Eseguire tutti i test**

Run: `npm test`
Expected: PASS, 14 test.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: utility per slug e ritardo di invio"
```

---

## Task 3: Store

**Files:**
- Create: `src/lib/types.ts`, `src/lib/store.ts`
- Test: `tests/lib/store.test.ts`

**Interfaces:**
- Consumes: niente
- Produces:
  - `type Preset = { slug: string; name: string; defaultTitle: string; defaultBody: string; createdAt: number }`
  - `type SubscriptionRecord = { endpoint: string; keys: { p256dh: string; auth: string }; ua: string; createdAt: number }`
  - `type ScheduledSend = { id: string; slug: string; title: string; body: string; sendAt: number; messageId: string }`
  - `type IconSize = 192 | 512`
  - `class PresetExistsError extends Error`
  - `interface Store` (metodi elencati sotto)
  - `createMemoryStore(): Store`
  - `createRedisStore(): Store`
  - `getStore(): Store`
  - `setStoreForTesting(store: Store | null): void`

- [ ] **Step 1: Scrivere `src/lib/types.ts`**

```ts
export type Preset = {
  slug: string;
  name: string;
  defaultTitle: string;
  defaultBody: string;
  createdAt: number;
};

export type SubscriptionRecord = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  ua: string;
  createdAt: number;
};

export type ScheduledSend = {
  id: string;
  slug: string;
  title: string;
  body: string;
  /** Epoch in millisecondi. */
  sendAt: number;
  messageId: string;
};

export type IconSize = 192 | 512;

/** Le due icone di un preset, in base64 senza prefisso data URI. */
export type IconSet = Record<IconSize, string>;
```

- [ ] **Step 2: Scrivere il test fallito dello store**

`tests/lib/store.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { PresetExistsError, createMemoryStore } from '@/lib/store';
import type { Preset, ScheduledSend, Store, SubscriptionRecord } from '@/lib/store';

const preset: Preset = {
  slug: 'test-a',
  name: 'Test A',
  defaultTitle: 'Ciao',
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
    title: 'T',
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
```

- [ ] **Step 3: Eseguire e verificare il fallimento**

Run: `npx vitest run tests/lib/store.test.ts`
Expected: FAIL — impossibile risolvere `@/lib/store`.

- [ ] **Step 4: Implementare `src/lib/store.ts`**

```ts
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
      subs.set(slug, (subs.get(slug) ?? []).filter((s) => s.endpoint !== endpoint));
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
      await redis.set(subsKey(slug), current.filter((s) => s.endpoint !== endpoint));
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
      await Promise.all([
        redis.del(scheduledKey(id)),
        redis.zrem(SCHEDULED_INDEX_KEY, id),
      ]);
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
```

- [ ] **Step 5: Eseguire i test**

Run: `npm test`
Expected: PASS, 22 test.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: store dei preset su Redis, con implementazione in memoria per i test"
```

---

## Task 4: Auth, API preset e API icona

**Files:**
- Create: `src/lib/auth.ts`, `src/app/api/presets/route.ts`, `src/app/api/icon/[slug]/[size]/route.ts`
- Test: `tests/lib/auth.test.ts`, `tests/api/presets.test.ts`, `tests/api/icon.test.ts`

**Interfaces:**
- Consumes: `slugify`, `getStore`, `setStoreForTesting`, `PresetExistsError`, `Preset`, `IconSet`
- Produces:
  - `class UnauthorizedError extends Error`
  - `assertAuthorized(request: Request): void`
  - `errorResponse(error: unknown): Response` — mappa gli errori noti su status HTTP
  - `POST /api/presets/` body `{ name, defaultTitle?, defaultBody?, icons: { "192": string, "512": string } }` → `201 { preset }`
  - `GET /api/presets/` → `200 { presets }`
  - `DELETE /api/presets/?slug=<slug>` → `200 { ok: true }`
  - `GET /api/icon/<slug>/<192|512>/` → `200 image/png`

- [ ] **Step 1: Scrivere il test fallito dell'auth**

`tests/lib/auth.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UnauthorizedError, assertAuthorized } from '@/lib/auth';

afterEach(() => vi.unstubAllEnvs());

const request = (header?: string) =>
  new Request('https://x.test/api/presets/', {
    headers: header ? { authorization: header } : {},
  });

describe('assertAuthorized', () => {
  it('passa con il token giusto', () => {
    vi.stubEnv('APP_TOKEN', 'segreto');
    expect(() => assertAuthorized(request('Bearer segreto'))).not.toThrow();
  });

  it('rifiuta un token sbagliato, mancante o di lunghezza diversa', () => {
    vi.stubEnv('APP_TOKEN', 'segreto');
    expect(() => assertAuthorized(request('Bearer altro00'))).toThrow(UnauthorizedError);
    expect(() => assertAuthorized(request('Bearer segret'))).toThrow(UnauthorizedError);
    expect(() => assertAuthorized(request())).toThrow(UnauthorizedError);
  });

  it("rifiuta uno schema diverso da Bearer", () => {
    vi.stubEnv('APP_TOKEN', 'segreto');
    expect(() => assertAuthorized(request('Basic segreto'))).toThrow(UnauthorizedError);
  });

  it('fallisce forte se APP_TOKEN non è configurato', () => {
    vi.stubEnv('APP_TOKEN', '');
    expect(() => assertAuthorized(request('Bearer x'))).toThrow(/APP_TOKEN/);
  });
});
```

- [ ] **Step 2: Eseguire e verificare il fallimento**

Run: `npx vitest run tests/lib/auth.test.ts`
Expected: FAIL — impossibile risolvere `@/lib/auth`.

- [ ] **Step 3: Implementare `src/lib/auth.ts`**

```ts
import { timingSafeEqual } from 'node:crypto';
import { PresetExistsError } from './store';

export class UnauthorizedError extends Error {
  constructor() {
    super('Token non valido');
    this.name = 'UnauthorizedError';
  }
}

export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

function equals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function assertAuthorized(request: Request): void {
  const expected = process.env.APP_TOKEN;
  if (!expected) {
    throw new Error('APP_TOKEN non è configurato sul server');
  }

  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';

  if (!equals(token, expected)) {
    throw new UnauthorizedError();
  }
}

/** Traduce gli errori noti in risposte HTTP. Tutto il resto diventa 500. */
export function errorResponse(error: unknown): Response {
  if (error instanceof UnauthorizedError) {
    return Response.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof PresetExistsError) {
    return Response.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof NotFoundError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof BadRequestError || error instanceof RangeError) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
  console.error(error);
  return Response.json({ error: 'Errore interno' }, { status: 500 });
}
```

- [ ] **Step 4: Eseguire e verificare il successo**

Run: `npx vitest run tests/lib/auth.test.ts`
Expected: PASS, 4 test.

- [ ] **Step 5: Scrivere il test fallito delle API preset**

`tests/api/presets.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE, GET, POST } from '@/app/api/presets/route';
import { createMemoryStore, setStoreForTesting } from '@/lib/store';
import type { Store } from '@/lib/store';

let store: Store;

beforeEach(() => {
  vi.stubEnv('APP_TOKEN', 'segreto');
  store = createMemoryStore();
  setStoreForTesting(store);
});

afterEach(() => {
  setStoreForTesting(null);
  vi.unstubAllEnvs();
});

const authed = (body?: unknown, method = 'POST') =>
  new Request('https://x.test/api/presets/', {
    method,
    headers: { authorization: 'Bearer segreto', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const validBody = {
  name: 'Test A',
  defaultTitle: 'Ciao',
  defaultBody: 'Corpo',
  icons: { '192': 'aaa', '512': 'bbb' },
};

describe('POST /api/presets/', () => {
  it('crea il preset e ne deriva lo slug', async () => {
    const res = await POST(authed(validBody));
    expect(res.status).toBe(201);
    const { preset } = await res.json();
    expect(preset.slug).toBe('test-a');
    expect(preset.name).toBe('Test A');
    expect(await store.getIcon('test-a', 512)).toBe('bbb');
  });

  it('risponde 409 su slug duplicato', async () => {
    await POST(authed(validBody));
    const res = await POST(authed(validBody));
    expect(res.status).toBe(409);
  });

  it('risponde 401 senza token', async () => {
    const res = await POST(
      new Request('https://x.test/api/presets/', { method: 'POST', body: JSON.stringify(validBody) }),
    );
    expect(res.status).toBe(401);
  });

  it('risponde 400 se manca il nome o le icone', async () => {
    expect((await POST(authed({ ...validBody, name: '' }))).status).toBe(400);
    expect((await POST(authed({ ...validBody, icons: { '192': 'aaa' } }))).status).toBe(400);
  });

  it('risponde 400 se il nome non produce uno slug', async () => {
    const res = await POST(authed({ ...validBody, name: '🎉' }));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/presets/', () => {
  it('elenca i preset creati', async () => {
    await POST(authed(validBody));
    const res = await GET(authed(undefined, 'GET'));
    expect(res.status).toBe(200);
    const { presets } = await res.json();
    expect(presets).toHaveLength(1);
  });
});

describe('DELETE /api/presets/', () => {
  it('elimina per slug', async () => {
    await POST(authed(validBody));
    const res = await DELETE(
      new Request('https://x.test/api/presets/?slug=test-a', {
        method: 'DELETE',
        headers: { authorization: 'Bearer segreto' },
      }),
    );
    expect(res.status).toBe(200);
    expect(await store.getPreset('test-a')).toBeNull();
  });

  it('risponde 400 senza slug', async () => {
    const res = await DELETE(authed(undefined, 'DELETE'));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 6: Eseguire e verificare il fallimento**

Run: `npx vitest run tests/api/presets.test.ts`
Expected: FAIL — impossibile risolvere `@/app/api/presets/route`.

- [ ] **Step 7: Implementare `src/app/api/presets/route.ts`**

```ts
import { BadRequestError, assertAuthorized, errorResponse } from '@/lib/auth';
import { slugify } from '@/lib/slug';
import { getStore } from '@/lib/store';
import type { IconSet, Preset } from '@/lib/store';

const MAX_ICON_BASE64_LENGTH = 400_000;

type CreateBody = {
  name?: unknown;
  defaultTitle?: unknown;
  defaultBody?: unknown;
  icons?: { '192'?: unknown; '512'?: unknown };
};

function readString(value: unknown, field: string, { required = false } = {}): string {
  if (value === undefined || value === null) {
    if (required) throw new BadRequestError(`Campo obbligatorio mancante: ${field}`);
    return '';
  }
  if (typeof value !== 'string') throw new BadRequestError(`Campo non valido: ${field}`);
  const trimmed = value.trim();
  if (required && !trimmed) throw new BadRequestError(`Campo obbligatorio mancante: ${field}`);
  return trimmed;
}

function readIcons(icons: CreateBody['icons']): IconSet {
  const at192 = readString(icons?.['192'], 'icons.192', { required: true });
  const at512 = readString(icons?.['512'], 'icons.512', { required: true });
  for (const value of [at192, at512]) {
    if (value.length > MAX_ICON_BASE64_LENGTH) {
      throw new BadRequestError('Icona troppo grande');
    }
  }
  return { 192: at192, 512: at512 };
}

export async function GET(request: Request): Promise<Response> {
  try {
    assertAuthorized(request);
    const presets = await getStore().listPresets();
    return Response.json({ presets });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertAuthorized(request);
    const body = (await request.json()) as CreateBody;

    const name = readString(body.name, 'name', { required: true });
    const preset: Preset = {
      slug: slugify(name),
      name,
      defaultTitle: readString(body.defaultTitle, 'defaultTitle'),
      defaultBody: readString(body.defaultBody, 'defaultBody'),
      createdAt: Date.now(),
    };

    await getStore().createPreset(preset, readIcons(body.icons));
    return Response.json({ preset }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    assertAuthorized(request);
    const slug = new URL(request.url).searchParams.get('slug');
    if (!slug) throw new BadRequestError('Parametro slug mancante');

    await getStore().deletePreset(slug);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 8: Eseguire e verificare il successo**

Run: `npx vitest run tests/api/presets.test.ts`
Expected: PASS, 8 test.

- [ ] **Step 9: Scrivere il test fallito dell'API icona**

`tests/api/icon.test.ts`:

```ts
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
    { slug: 'test-a', name: 'Test A', defaultTitle: '', defaultBody: '', createdAt: 1 },
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
```

- [ ] **Step 10: Eseguire e verificare il fallimento**

Run: `npx vitest run tests/api/icon.test.ts`
Expected: FAIL — impossibile risolvere la route.

- [ ] **Step 11: Implementare `src/app/api/icon/[slug]/[size]/route.ts`**

```ts
import { BadRequestError, NotFoundError, errorResponse } from '@/lib/auth';
import { getStore } from '@/lib/store';
import type { IconSize } from '@/lib/store';

const ALLOWED_SIZES = [192, 512] as const;

type Params = { params: Promise<{ slug: string; size: string }> };

// Nessuna autenticazione: il manifest e la Home di iOS caricano queste URL
// senza poter mandare header.
export async function GET(_request: Request, { params }: Params): Promise<Response> {
  try {
    const { slug, size } = await params;
    const parsed = Number(size) as IconSize;

    if (!ALLOWED_SIZES.includes(parsed as (typeof ALLOWED_SIZES)[number])) {
      throw new BadRequestError('Dimensione icona non ammessa');
    }

    const base64 = await getStore().getIcon(slug, parsed);
    if (!base64) throw new NotFoundError('Icona non trovata');

    return new Response(Buffer.from(base64, 'base64'), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 12: Eseguire tutti i test**

Run: `npm test`
Expected: PASS, 38 test.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: autenticazione a token, CRUD dei preset e servizio delle icone"
```

---

## Task 5: Manifest e service worker

**Files:**
- Create: `src/lib/manifest.ts`, `src/app/p/[slug]/manifest/route.ts`, `public/sw.js`
- Modify: `next.config.ts`
- Test: `tests/lib/manifest.test.ts`, `tests/api/manifest-route.test.ts`

**Interfaces:**
- Consumes: `getStore`, `Preset`, `errorResponse`, `NotFoundError`
- Produces:
  - `type WebManifest` e `buildManifest(preset: Preset): WebManifest`
  - `GET /p/<slug>/manifest/` → `200 application/manifest+json`
  - `/sw.js` statico, che mostra la notifica ricevuta

- [ ] **Step 1: Scrivere il test fallito del manifest**

`tests/lib/manifest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildManifest } from '@/lib/manifest';
import type { Preset } from '@/lib/store';

const preset: Preset = {
  slug: 'test-a',
  name: 'Test A',
  defaultTitle: '',
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
```

- [ ] **Step 2: Eseguire e verificare il fallimento**

Run: `npx vitest run tests/lib/manifest.test.ts`
Expected: FAIL — impossibile risolvere `@/lib/manifest`.

- [ ] **Step 3: Implementare `src/lib/manifest.ts`**

```ts
import type { Preset } from './store';

export type WebManifest = {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: 'standalone';
  background_color: string;
  theme_color: string;
  icons: Array<{ src: string; sizes: string; type: string; purpose: string }>;
};

export function buildManifest(preset: Preset): WebManifest {
  const scope = `/p/${preset.slug}/`;

  return {
    name: preset.name,
    short_name: preset.name,
    start_url: scope,
    scope,
    display: 'standalone',
    background_color: '#0b0b0f',
    theme_color: '#0b0b0f',
    icons: [
      { src: `/api/icon/${preset.slug}/192/`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `/api/icon/${preset.slug}/512/`, sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
```

- [ ] **Step 4: Scrivere il test fallito della route manifest**

`tests/api/manifest-route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET } from '@/app/p/[slug]/manifest/route';
import { createMemoryStore, setStoreForTesting } from '@/lib/store';

beforeEach(async () => {
  const store = createMemoryStore();
  setStoreForTesting(store);
  await store.createPreset(
    { slug: 'test-a', name: 'Test A', defaultTitle: '', defaultBody: '', createdAt: 1 },
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
```

- [ ] **Step 5: Eseguire e verificare il fallimento**

Run: `npx vitest run tests/api/manifest-route.test.ts`
Expected: FAIL — impossibile risolvere la route.

- [ ] **Step 6: Implementare `src/app/p/[slug]/manifest/route.ts`**

```ts
import { NotFoundError, errorResponse } from '@/lib/auth';
import { buildManifest } from '@/lib/manifest';
import { getStore } from '@/lib/store';

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Params): Promise<Response> {
  try {
    const { slug } = await params;
    const preset = await getStore().getPreset(slug);
    if (!preset) throw new NotFoundError('Preset non trovato');

    return new Response(JSON.stringify(buildManifest(preset)), {
      headers: {
        'Content-Type': 'application/manifest+json',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 7: Scrivere `public/sw.js`**

```js
// Service worker unico per tutti i preset: ognuno lo registra con uno scope
// proprio (/p/<slug>/), ottenendo così una push subscription isolata.
// Sta in public/ e non in una route perché la specifica Service Worker rifiuta
// uno script che risponde con un redirect, e trailingSlash: true ne creerebbe uno.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    data = {};
  }

  const title = data.title || 'Notifica';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      // Su iOS icon e badge vengono ignorati: contano quelli della PWA installata.
      // Restano qui perché su Android e desktop funzionano.
      icon: data.icon,
      badge: data.icon,
      tag: data.tag,
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
```

- [ ] **Step 8: Aggiungere gli header per `/sw.js` in `next.config.ts`**

Sostituire il contenuto con:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Serve perché start_url del manifest stia dentro scope. Vedi lo spec.
  // Attenzione: fa redirigere in 308 anche le route /api senza slash finale.
  trailingSlash: true,

  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 9: Eseguire tutti i test**

Run: `npm test`
Expected: PASS, 45 test.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: manifest per preset e service worker delle push"
```

---

## Task 6: Consegna delle push e registrazione della subscription

**Files:**
- Create: `src/lib/push.ts`, `src/app/api/subscribe/route.ts`
- Test: `tests/lib/push.test.ts`, `tests/api/subscribe.test.ts`

**Interfaces:**
- Consumes: `Store`, `SubscriptionRecord`, `assertAuthorized`, `errorResponse`, `BadRequestError`, `NotFoundError`
- Produces:
  - `type NotificationPayload = { title: string; body: string; icon: string; tag: string; url: string }`
  - `buildPayload(slug: string, title: string, body: string, now: number): NotificationPayload`
  - `class PushGoneError extends Error` con `statusCode: number`
  - `type Sender = (sub: SubscriptionRecord, payload: string) => Promise<void>`
  - `webPushSender: Sender`
  - `deliver(store: Store, slug: string, payload: NotificationPayload, send?: Sender): Promise<{ sent: number; removed: number }>`
  - `POST /api/subscribe/` body `{ slug, subscription: { endpoint, keys } }` → `200 { ok: true }`

- [ ] **Step 1: Scrivere il test fallito della consegna**

`tests/lib/push.test.ts`:

```ts
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
  it('punta l\'icona al preset e usa un tag univoco', () => {
    const payload = buildPayload('test-a', 'T', 'B', 1700000000000);
    expect(payload).toEqual({
      title: 'T',
      body: 'B',
      icon: '/api/icon/test-a/192/',
      tag: 'test-a-1700000000000',
      url: '/p/test-a/',
    });
  });
});

describe('deliver', () => {
  it('manda a tutte le subscription del preset', async () => {
    const send = vi.fn(async () => {});
    const result = await deliver(store, 'test-a', buildPayload('test-a', 'T', 'B', 1), send);

    expect(send).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ sent: 2, removed: 0 });
  });

  it('rimuove le subscription morte e continua con le altre', async () => {
    const send = vi.fn(async (s: SubscriptionRecord) => {
      if (s.endpoint.endsWith('/1')) throw new PushGoneError(410);
    });

    const result = await deliver(store, 'test-a', buildPayload('test-a', 'T', 'B', 1), send);

    expect(result).toEqual({ sent: 1, removed: 1 });
    const left = await store.listSubscriptions('test-a');
    expect(left.map((s) => s.endpoint)).toEqual(['https://push.example/2']);
  });

  it('non rimuove nulla su un errore transitorio', async () => {
    const send = vi.fn(async () => {
      throw new PushGoneError(500);
    });

    const result = await deliver(store, 'test-a', buildPayload('test-a', 'T', 'B', 1), send);

    expect(result).toEqual({ sent: 0, removed: 0 });
    expect(await store.listSubscriptions('test-a')).toHaveLength(2);
  });

  it('senza subscription registrate restituisce zero', async () => {
    const send = vi.fn(async () => {});
    const result = await deliver(store, 'vuoto', buildPayload('vuoto', 'T', 'B', 1), send);

    expect(send).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: 0, removed: 0 });
  });
});
```

- [ ] **Step 2: Eseguire e verificare il fallimento**

Run: `npx vitest run tests/lib/push.test.ts`
Expected: FAIL — impossibile risolvere `@/lib/push`.

- [ ] **Step 3: Implementare `src/lib/push.ts`**

```ts
import webpush from 'web-push';
import type { Store, SubscriptionRecord } from './store';

export type NotificationPayload = {
  title: string;
  body: string;
  icon: string;
  tag: string;
  url: string;
};

export function buildPayload(
  slug: string,
  title: string,
  body: string,
  now: number,
): NotificationPayload {
  return {
    title,
    body,
    icon: `/api/icon/${slug}/192/`,
    tag: `${slug}-${now}`,
    url: `/p/${slug}/`,
  };
}

export class PushGoneError extends Error {
  constructor(public readonly statusCode: number) {
    super(`Il push service ha risposto ${statusCode}`);
    this.name = 'PushGoneError';
  }
}

export type Sender = (sub: SubscriptionRecord, payload: string) => Promise<void>;

let vapidConfigured = false;

function configureVapid(): void {
  if (vapidConfigured) return;
  const { VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  if (!VAPID_SUBJECT || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    throw new Error('Chiavi VAPID non configurate sul server');
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidConfigured = true;
}

export const webPushSender: Sender = async (sub, payload) => {
  configureVapid();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      payload,
      { TTL: 60 * 60 },
    );
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (typeof statusCode === 'number') throw new PushGoneError(statusCode);
    throw error;
  }
};

/**
 * Manda la notifica a tutte le subscription del preset.
 * Le subscription che il push service dichiara morte (404/410) vengono rimosse.
 */
export async function deliver(
  store: Store,
  slug: string,
  payload: NotificationPayload,
  send: Sender = webPushSender,
): Promise<{ sent: number; removed: number }> {
  const subs = await store.listSubscriptions(slug);
  const serialized = JSON.stringify(payload);

  let sent = 0;
  let removed = 0;

  for (const sub of subs) {
    try {
      await send(sub, serialized);
      sent += 1;
    } catch (error) {
      const statusCode = error instanceof PushGoneError ? error.statusCode : 0;
      if (statusCode === 404 || statusCode === 410) {
        await store.removeSubscription(slug, sub.endpoint);
        removed += 1;
      } else {
        console.error(`Invio fallito verso ${sub.endpoint}`, error);
      }
    }
  }

  return { sent, removed };
}
```

- [ ] **Step 4: Eseguire e verificare il successo**

Run: `npx vitest run tests/lib/push.test.ts`
Expected: PASS, 5 test.

- [ ] **Step 5: Scrivere il test fallito di `/api/subscribe/`**

`tests/api/subscribe.test.ts`:

```ts
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
    { slug: 'test-a', name: 'Test A', defaultTitle: '', defaultBody: '', createdAt: 1 },
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
```

- [ ] **Step 6: Eseguire e verificare il fallimento**

Run: `npx vitest run tests/api/subscribe.test.ts`
Expected: FAIL — impossibile risolvere la route.

- [ ] **Step 7: Implementare `src/app/api/subscribe/route.ts`**

```ts
import { BadRequestError, NotFoundError, assertAuthorized, errorResponse } from '@/lib/auth';
import { getStore } from '@/lib/store';
import type { SubscriptionRecord } from '@/lib/store';

type Body = {
  slug?: unknown;
  subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
};

function readSubscription(body: Body, ua: string): SubscriptionRecord {
  const endpoint = body.subscription?.endpoint;
  const p256dh = body.subscription?.keys?.p256dh;
  const auth = body.subscription?.keys?.auth;

  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://')) {
    throw new BadRequestError('Endpoint della subscription non valido');
  }
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || !p256dh || !auth) {
    throw new BadRequestError('Chiavi della subscription mancanti');
  }

  return { endpoint, keys: { p256dh, auth }, ua, createdAt: Date.now() };
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertAuthorized(request);
    const body = (await request.json()) as Body;

    if (typeof body.slug !== 'string' || !body.slug) {
      throw new BadRequestError('Parametro slug mancante');
    }

    const store = getStore();
    if (!(await store.getPreset(body.slug))) {
      throw new NotFoundError('Preset non trovato');
    }

    const ua = request.headers.get('user-agent') ?? 'sconosciuto';
    await store.addSubscription(body.slug, readSubscription(body, ua));

    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 8: Eseguire tutti i test**

Run: `npm test`
Expected: PASS, 55 test.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: consegna delle push con pulizia delle subscription morte"
```

---

## Task 7: QStash e API di invio

**Files:**
- Create: `src/lib/qstash.ts`, `src/app/api/send/route.ts`
- Test: `tests/lib/qstash.test.ts`, `tests/api/send.test.ts`

**Interfaces:**
- Consumes: `MAX_DELAY_SECONDS`, `deliveryMode`, `deliver`, `buildPayload`, `webPushSender`, `getStore`, `assertAuthorized`, `errorResponse` (la conversione unità → secondi la fa il client con `toDelaySeconds`; l'API riceve già `delaySeconds`)
- Produces:
  - `deliverCallbackUrl(): string` — sempre con lo slash finale
  - `publishDelayed(params: { url: string; delaySeconds: number; body: unknown }): Promise<string>` → `messageId`
  - `cancelMessage(messageId: string): Promise<void>` — un `404` non è un errore
  - `verifyQstashSignature(signature: string | null, rawBody: string): Promise<void>`
  - `setQstashClientForTesting(client: QstashClient | null): void`
  - `POST /api/send/` body `{ slug, title, body, delaySeconds }` → `200 { mode, sent, removed }` oppure `202 { mode, id, sendAt }`

- [ ] **Step 1: Scrivere il test fallito di QStash**

`tests/lib/qstash.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cancelMessage, deliverCallbackUrl, publishDelayed, setQstashClientForTesting } from '@/lib/qstash';

afterEach(() => {
  setQstashClientForTesting(null);
  vi.unstubAllEnvs();
});

describe('deliverCallbackUrl', () => {
  it('finisce con lo slash, altrimenti trailingSlash rimanda in 308', () => {
    vi.stubEnv('PUBLIC_BASE_URL', 'https://app.test');
    expect(deliverCallbackUrl()).toBe('https://app.test/api/deliver/');
  });

  it('tollera uno slash finale già presente in PUBLIC_BASE_URL', () => {
    vi.stubEnv('PUBLIC_BASE_URL', 'https://app.test/');
    expect(deliverCallbackUrl()).toBe('https://app.test/api/deliver/');
  });

  it('fallisce forte se PUBLIC_BASE_URL non è configurato', () => {
    vi.stubEnv('PUBLIC_BASE_URL', '');
    expect(() => deliverCallbackUrl()).toThrow(/PUBLIC_BASE_URL/);
  });
});

describe('publishDelayed', () => {
  it('passa url, ritardo in secondi e body al client', async () => {
    const publishJSON = vi.fn(async () => ({ messageId: 'msg-1' }));
    setQstashClientForTesting({ publishJSON, messages: { delete: vi.fn() } });

    const id = await publishDelayed({
      url: 'https://app.test/api/deliver/',
      delaySeconds: 300,
      body: { id: 'x' },
    });

    expect(id).toBe('msg-1');
    expect(publishJSON).toHaveBeenCalledWith({
      url: 'https://app.test/api/deliver/',
      body: { id: 'x' },
      delay: '300s',
    });
  });
});

describe('cancelMessage', () => {
  it('cancella il messaggio', async () => {
    const del = vi.fn(async () => {});
    setQstashClientForTesting({ publishJSON: vi.fn(), messages: { delete: del } });

    await cancelMessage('msg-1');
    expect(del).toHaveBeenCalledWith('msg-1');
  });

  it('ignora un 404: il messaggio era già partito o già cancellato', async () => {
    const del = vi.fn(async () => {
      throw Object.assign(new Error('not found'), { status: 404 });
    });
    setQstashClientForTesting({ publishJSON: vi.fn(), messages: { delete: del } });

    await expect(cancelMessage('msg-1')).resolves.toBeUndefined();
  });

  it('propaga gli altri errori', async () => {
    const del = vi.fn(async () => {
      throw Object.assign(new Error('boom'), { status: 500 });
    });
    setQstashClientForTesting({ publishJSON: vi.fn(), messages: { delete: del } });

    await expect(cancelMessage('msg-1')).rejects.toThrow('boom');
  });
});
```

- [ ] **Step 2: Eseguire e verificare il fallimento**

Run: `npx vitest run tests/lib/qstash.test.ts`
Expected: FAIL — impossibile risolvere `@/lib/qstash`.

- [ ] **Step 3: Implementare `src/lib/qstash.ts`**

```ts
import { Client, Receiver } from '@upstash/qstash';
import { UnauthorizedError } from './auth';

/** La parte di client QStash che usiamo, così i test possono sostituirla. */
export type QstashClient = {
  publishJSON: (params: { url: string; body: unknown; delay: string }) => Promise<{ messageId: string }>;
  messages: { delete: (messageId: string) => Promise<unknown> };
};

let override: QstashClient | null = null;
let cached: QstashClient | null = null;

export function setQstashClientForTesting(client: QstashClient | null): void {
  override = client;
  if (client) cached = null;
}

function getClient(): QstashClient {
  if (override) return override;
  if (!cached) {
    const token = process.env.QSTASH_TOKEN;
    if (!token) throw new Error('QSTASH_TOKEN non è configurato sul server');
    cached = new Client({ token }) as unknown as QstashClient;
  }
  return cached;
}

/** URL che QStash richiamerà. Lo slash finale è obbligatorio: vedi trailingSlash. */
export function deliverCallbackUrl(): string {
  const base = process.env.PUBLIC_BASE_URL;
  if (!base) throw new Error('PUBLIC_BASE_URL non è configurato sul server');
  return `${base.replace(/\/+$/, '')}/api/deliver/`;
}

export async function publishDelayed(params: {
  url: string;
  delaySeconds: number;
  body: unknown;
}): Promise<string> {
  const result = await getClient().publishJSON({
    url: params.url,
    body: params.body,
    delay: `${params.delaySeconds}s`,
  });
  return result.messageId;
}

export async function cancelMessage(messageId: string): Promise<void> {
  try {
    await getClient().messages.delete(messageId);
  } catch (error) {
    // Già consegnato o già cancellato: per noi l'annullamento è comunque riuscito.
    if ((error as { status?: number }).status === 404) return;
    throw error;
  }
}

export async function verifyQstashSignature(
  signature: string | null,
  rawBody: string,
): Promise<void> {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentSigningKey || !nextSigningKey) {
    throw new Error('Chiavi di firma QStash non configurate sul server');
  }
  if (!signature) throw new UnauthorizedError();

  const receiver = new Receiver({ currentSigningKey, nextSigningKey });
  const valid = await receiver.verify({ signature, body: rawBody }).catch(() => false);
  if (!valid) throw new UnauthorizedError();
}
```

- [ ] **Step 4: Eseguire e verificare il successo**

Run: `npx vitest run tests/lib/qstash.test.ts`
Expected: PASS, 7 test.

- [ ] **Step 5: Scrivere il test fallito di `/api/send/`**

`tests/api/send.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/send/route';
import { setQstashClientForTesting } from '@/lib/qstash';
import { createMemoryStore, setStoreForTesting } from '@/lib/store';
import type { Store } from '@/lib/store';

// vi.mock viene issato sopra le const del modulo: senza vi.hoisted, `sent`
// non esisterebbe ancora quando la factory viene valutata.
const { sent } = vi.hoisted(() => ({ sent: [] as string[] }));

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
let publishJSON: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  sent.length = 0;
  vi.stubEnv('APP_TOKEN', 'segreto');
  vi.stubEnv('PUBLIC_BASE_URL', 'https://app.test');

  store = createMemoryStore();
  setStoreForTesting(store);
  await store.createPreset(
    { slug: 'test-a', name: 'Test A', defaultTitle: '', defaultBody: '', createdAt: 1 },
    { 192: 'a', 512: 'b' },
  );
  await store.addSubscription('test-a', {
    endpoint: 'https://push.example/1',
    keys: { p256dh: 'p', auth: 'a' },
    ua: 'iPhone',
    createdAt: 1,
  });

  publishJSON = vi.fn(async () => ({ messageId: 'msg-1' }));
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
    const res = await call({ slug: 'test-a', title: 'T', body: 'B', delaySeconds: 0 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ mode: 'immediate', sent: 1, removed: 0 });
    expect(JSON.parse(sent[0]!)).toMatchObject({ title: 'T', body: 'B' });
    expect(publishJSON).not.toHaveBeenCalled();
  });
});

describe('POST /api/send/ — ramo inline ritardato', () => {
  it('accetta un ritardo entro la soglia senza passare da QStash', async () => {
    const res = await call({ slug: 'test-a', title: 'T', body: 'B', delaySeconds: 30 });
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ mode: 'inline', delaySeconds: 30 });
    expect(publishJSON).not.toHaveBeenCalled();
  });

  it('rifiuta se non c\'è nessun device registrato', async () => {
    await store.removeSubscription('test-a', 'https://push.example/1');
    const res = await call({ slug: 'test-a', title: 'T', body: 'B', delaySeconds: 10 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/device/i);
  });
});

describe('POST /api/send/ — ramo QStash', () => {
  it('programma oltre la soglia e salva il record', async () => {
    const res = await call({ slug: 'test-a', title: 'T', body: 'B', delaySeconds: 3600 });
    expect(res.status).toBe(202);

    const json = await res.json();
    expect(json.mode).toBe('scheduled');

    expect(publishJSON).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://app.test/api/deliver/', delay: '3600s' }),
    );

    const scheduled = await store.listScheduled();
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]).toMatchObject({ slug: 'test-a', title: 'T', body: 'B', messageId: 'msg-1' });
    expect(scheduled[0]!.id).toBe(json.id);
  });

  it('non lascia record fantasma se QStash fallisce', async () => {
    publishJSON.mockRejectedValueOnce(new Error('qstash down'));
    const res = await call({ slug: 'test-a', title: 'T', body: 'B', delaySeconds: 3600 });

    expect(res.status).toBe(500);
    expect(await store.listScheduled()).toEqual([]);
  });
});

describe('POST /api/send/ — validazione', () => {
  it('risponde 401 con token sbagliato', async () => {
    expect((await call({ slug: 'test-a', title: 'T', body: 'B', delaySeconds: 0 }, 'altro00')).status).toBe(401);
  });

  it('risponde 404 su preset inesistente', async () => {
    expect((await call({ slug: 'boh', title: 'T', body: 'B', delaySeconds: 0 })).status).toBe(404);
  });

  it('risponde 400 su titolo vuoto o ritardo fuori range', async () => {
    expect((await call({ slug: 'test-a', title: '  ', body: 'B', delaySeconds: 0 })).status).toBe(400);
    expect((await call({ slug: 'test-a', title: 'T', body: 'B', delaySeconds: -1 })).status).toBe(400);
    expect((await call({ slug: 'test-a', title: 'T', body: 'B', delaySeconds: 604801 })).status).toBe(400);
  });
});
```

- [ ] **Step 6: Eseguire e verificare il fallimento**

Run: `npx vitest run tests/api/send.test.ts`
Expected: FAIL — impossibile risolvere la route.

- [ ] **Step 7: Implementare `src/app/api/send/route.ts`**

```ts
import { randomUUID } from 'node:crypto';
import { after } from 'next/server';
import { BadRequestError, NotFoundError, assertAuthorized, errorResponse } from '@/lib/auth';
import { MAX_DELAY_SECONDS, deliveryMode } from '@/lib/delay';
import { buildPayload, deliver, webPushSender } from '@/lib/push';
import { deliverCallbackUrl, publishDelayed } from '@/lib/qstash';
import { getStore } from '@/lib/store';

export const maxDuration = 60;

const MAX_TEXT_LENGTH = 500;

type Body = { slug?: unknown; title?: unknown; body?: unknown; delaySeconds?: unknown };

function readText(value: unknown, field: string, { required }: { required: boolean }): string {
  if (typeof value !== 'string') {
    if (required) throw new BadRequestError(`Campo obbligatorio mancante: ${field}`);
    return '';
  }
  const trimmed = value.trim();
  if (required && !trimmed) throw new BadRequestError(`Campo obbligatorio mancante: ${field}`);
  if (trimmed.length > MAX_TEXT_LENGTH) {
    throw new BadRequestError(`Campo troppo lungo: ${field}`);
  }
  return trimmed;
}

function readDelay(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new BadRequestError('Il ritardo deve essere un numero intero di secondi maggiore o uguale a zero');
  }
  if (value > MAX_DELAY_SECONDS) {
    throw new BadRequestError('Il ritardo massimo è 7 giorni');
  }
  return value;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request: Request): Promise<Response> {
  try {
    assertAuthorized(request);
    const raw = (await request.json()) as Body;

    const slug = readText(raw.slug, 'slug', { required: true });
    const title = readText(raw.title, 'title', { required: true });
    const body = readText(raw.body, 'body', { required: false });
    const delaySeconds = readDelay(raw.delaySeconds);

    const store = getStore();
    if (!(await store.getPreset(slug))) throw new NotFoundError('Preset non trovato');

    const subs = await store.listSubscriptions(slug);
    if (subs.length === 0) {
      throw new BadRequestError(
        'Nessun device registrato per questo preset: apri la PWA dalla Home e attiva le notifiche',
      );
    }

    // Ramo immediato: consegniamo e riportiamo l'esito vero.
    // webPushSender va passato esplicito, non lasciato al valore di default di
    // deliver: solo così i test possono sostituirlo mockando il modulo.
    if (delaySeconds === 0) {
      const result = await deliver(
        store,
        slug,
        buildPayload(slug, title, body, Date.now()),
        webPushSender,
      );
      return Response.json({ mode: 'immediate', ...result });
    }

    // Ramo inline: rispondiamo subito e consegniamo dopo la risposta, così la
    // consegna sopravvive anche se il telefono viene bloccato e la connessione cade.
    if (deliveryMode(delaySeconds) === 'inline') {
      after(async () => {
        await sleep(delaySeconds * 1000);
        await deliver(store, slug, buildPayload(slug, title, body, Date.now()), webPushSender);
      });
      return Response.json({ mode: 'inline', delaySeconds }, { status: 202 });
    }

    // Ramo QStash: il messaggio va pubblicato prima di salvare il record, così
    // un fallimento non lascia programmati fantasma.
    const id = randomUUID();
    const messageId = await publishDelayed({
      url: deliverCallbackUrl(),
      delaySeconds,
      body: { id, slug, title, body },
    });

    const sendAt = Date.now() + delaySeconds * 1000;
    await store.addScheduled({ id, slug, title, body, sendAt, messageId });

    return Response.json({ mode: 'scheduled', id, sendAt }, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 8: Eseguire tutti i test**

Run: `npm test`
Expected: PASS, 70 test.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: API di invio con ramo inline e ramo QStash"
```

---

## Task 8: Callback QStash e gestione dei programmati

**Files:**
- Create: `src/app/api/deliver/route.ts`, `src/app/api/scheduled/route.ts`
- Test: `tests/api/deliver.test.ts`, `tests/api/scheduled.test.ts`

**Interfaces:**
- Consumes: `verifyQstashSignature`, `cancelMessage`, `deliver`, `buildPayload`, `getStore`, `assertAuthorized`
- Produces:
  - `POST /api/deliver/` — autenticato dalla firma QStash → `200 { ok: true, sent, removed }`
  - `GET /api/scheduled/` → `200 { scheduled }`
  - `DELETE /api/scheduled/?id=<id>` → `200 { ok: true }`

- [ ] **Step 1: Scrivere il test fallito di `/api/deliver/`**

`tests/api/deliver.test.ts`:

```ts
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
    { slug: 'test-a', name: 'Test A', defaultTitle: '', defaultBody: '', createdAt: 1 },
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
    title: 'T',
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
    const res = await call({ id: 'id-1', slug: 'test-a', title: 'T', body: 'B' });
    expect(res.status).toBe(200);
    expect(JSON.parse(sent[0]!)).toMatchObject({ title: 'T', body: 'B' });
    expect(await store.getScheduled('id-1')).toBeNull();
  });

  it('risponde 401 e non consegna se la firma non è valida', async () => {
    verifyQstashSignature.mockRejectedValueOnce(new UnauthorizedError());

    const res = await call({ id: 'id-1', slug: 'test-a', title: 'T', body: 'B' });
    expect(res.status).toBe(401);
    expect(sent).toEqual([]);
    expect(await store.getScheduled('id-1')).not.toBeNull();
  });

  it('non fallisce se il record era già stato rimosso', async () => {
    await store.removeScheduled('id-1');
    const res = await call({ id: 'id-1', slug: 'test-a', title: 'T', body: 'B' });
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
  });

  it('risponde 400 su un payload malformato', async () => {
    expect((await call({ id: 'id-1' })).status).toBe(400);
  });
});
```

- [ ] **Step 2: Eseguire e verificare il fallimento**

Run: `npx vitest run tests/api/deliver.test.ts`
Expected: FAIL — impossibile risolvere la route.

- [ ] **Step 3: Implementare `src/app/api/deliver/route.ts`**

```ts
import { BadRequestError, errorResponse } from '@/lib/auth';
import { buildPayload, deliver, webPushSender } from '@/lib/push';
import { verifyQstashSignature } from '@/lib/qstash';
import { getStore } from '@/lib/store';

export const maxDuration = 60;

type Body = { id?: unknown; slug?: unknown; title?: unknown; body?: unknown };

// Non usa APP_TOKEN: chi chiama è QStash, e si autentica con la firma.
export async function POST(request: Request): Promise<Response> {
  try {
    const raw = await request.text();
    await verifyQstashSignature(request.headers.get('upstash-signature'), raw);

    const payload = JSON.parse(raw) as Body;
    if (
      typeof payload.id !== 'string' ||
      typeof payload.slug !== 'string' ||
      typeof payload.title !== 'string'
    ) {
      throw new BadRequestError('Payload di consegna malformato');
    }
    const body = typeof payload.body === 'string' ? payload.body : '';

    const store = getStore();
    const result = await deliver(
      store,
      payload.slug,
      buildPayload(payload.slug, payload.title, body, Date.now()),
      webPushSender,
    );

    await store.removeScheduled(payload.id);

    return Response.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 4: Eseguire e verificare il successo**

Run: `npx vitest run tests/api/deliver.test.ts`
Expected: PASS, 4 test.

- [ ] **Step 5: Scrivere il test fallito di `/api/scheduled/`**

`tests/api/scheduled.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE, GET } from '@/app/api/scheduled/route';
import { setQstashClientForTesting } from '@/lib/qstash';
import { createMemoryStore, setStoreForTesting } from '@/lib/store';
import type { Store } from '@/lib/store';

let store: Store;
let del: ReturnType<typeof vi.fn>;

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

  del = vi.fn(async () => {});
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
```

- [ ] **Step 6: Eseguire e verificare il fallimento**

Run: `npx vitest run tests/api/scheduled.test.ts`
Expected: FAIL — impossibile risolvere la route.

- [ ] **Step 7: Implementare `src/app/api/scheduled/route.ts`**

```ts
import { BadRequestError, NotFoundError, assertAuthorized, errorResponse } from '@/lib/auth';
import { cancelMessage } from '@/lib/qstash';
import { getStore } from '@/lib/store';

export async function GET(request: Request): Promise<Response> {
  try {
    assertAuthorized(request);
    const scheduled = await getStore().listScheduled();
    return Response.json({ scheduled });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    assertAuthorized(request);
    const id = new URL(request.url).searchParams.get('id');
    if (!id) throw new BadRequestError('Parametro id mancante');

    const store = getStore();
    const record = await store.getScheduled(id);
    if (!record) throw new NotFoundError('Invio programmato non trovato');

    // Prima QStash, poi il record: un 404 da QStash non è un errore.
    await cancelMessage(record.messageId);
    await store.removeScheduled(id);

    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 8: Eseguire tutti i test**

Run: `npm test`
Expected: PASS, 80 test.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: callback QStash e annullamento degli invii programmati"
```

---

## Task 9: Interfaccia admin

**Files:**
- Create: `src/lib/image.ts`, `src/lib/client.ts`, `src/app/AdminApp.tsx`, `src/app/page.tsx`
- Test: verifica manuale in questa task, E2E nella Task 11

**Interfaces:**
- Consumes: `Preset`, `GET/POST/DELETE /api/presets/`
- Produces:
  - `processIcon(file: File, background: string): Promise<{ 192: string; 512: string }>`
  - `getToken(): string | null`, `setToken(token: string): void`
  - `apiFetch<T>(path: string, init?: RequestInit): Promise<T>` — aggiunge il token, lancia `Error` con il messaggio del server

- [ ] **Step 1: Implementare `src/lib/image.ts`**

```ts
'use client';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/jpeg'];

/**
 * Ritaglia al centro in quadrato, appiattisce su un colore opaco e produce le due
 * dimensioni richieste dal manifest. L'appiattimento serve perché la trasparenza
 * sulla Home di iOS viene resa nera.
 */
export async function processIcon(
  file: File,
  background: string,
): Promise<{ 192: string; 512: string }> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Serve un PNG o un JPEG');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('Immagine troppo grande: massimo 5 MB');
  }

  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const render = (size: number): string => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas non disponibile in questo browser');

    ctx.fillStyle = background;
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);

    return canvas.toDataURL('image/png').split(',')[1]!;
  };

  const result = { 192: render(192), 512: render(512) };
  bitmap.close();
  return result;
}
```

- [ ] **Step 2: Implementare `src/lib/client.ts`**

```ts
'use client';

const TOKEN_KEY = 'notifiche:token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  if (!token) throw new Error('Token mancante');

  const response = await fetch(path, {
    ...init,
    headers: {
      ...init.headers,
      authorization: `Bearer ${token}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
  });

  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? `Errore ${response.status}`);
  }
  return data;
}
```

- [ ] **Step 3: Implementare `src/app/AdminApp.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, getToken, setToken } from '@/lib/client';
import { processIcon } from '@/lib/image';
import type { Preset } from '@/lib/types';

export default function AdminApp() {
  const [tokenReady, setTokenReady] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [presets, setPresets] = useState<Preset[]>([]);
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [background, setBackground] = useState('#ffffff');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ presets: Preset[] }>('/api/presets/');
      setPresets(data.presets);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (getToken()) {
      setTokenReady(true);
      void load();
    }
  }, [load]);

  const saveToken = () => {
    setToken(tokenInput.trim());
    setTokenReady(true);
    void load();
  };

  const create = async () => {
    if (!file) {
      setError('Serve un logo');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const icons = await processIcon(file, background);
      await apiFetch('/api/presets/', {
        method: 'POST',
        body: JSON.stringify({ name, icons: { '192': icons[192], '512': icons[512] } }),
      });
      setName('');
      setFile(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (slug: string) => {
    if (!confirm(`Eliminare il preset "${slug}"?`)) return;
    try {
      await apiFetch(`/api/presets/?slug=${encodeURIComponent(slug)}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!tokenReady) {
    return (
      <main>
        <h1>Accesso</h1>
        <div className="field">
          <label htmlFor="token">Token</label>
          <input
            id="token"
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
          />
        </div>
        <button onClick={saveToken} disabled={!tokenInput.trim()}>
          Entra
        </button>
      </main>
    );
  }

  return (
    <main>
      <h1>Preset</h1>

      {presets.length === 0 && <p className="muted">Nessun preset. Creane uno qui sotto.</p>}

      {presets.map((preset) => (
        <div className="card" key={preset.slug}>
          <div className="row" style={{ alignItems: 'center', marginBottom: '0.75rem' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/icon/${preset.slug}/192/`}
              alt=""
              width={44}
              height={44}
              style={{ borderRadius: '0.6rem' }}
            />
            <div>
              <strong>{preset.name}</strong>
              <div className="muted">/p/{preset.slug}/</div>
            </div>
          </div>
          <div className="row">
            <a href={`/p/${preset.slug}/`} style={{ flex: 1 }}>
              <button className="secondary">Apri</button>
            </a>
            <button className="danger" onClick={() => remove(preset.slug)} style={{ width: 'auto' }}>
              Elimina
            </button>
          </div>
        </div>
      ))}

      <h2>Nuovo preset</h2>

      <div className="field">
        <label htmlFor="name">Nome — è quello che iOS mostra sopra la notifica</label>
        <input id="name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="logo">Logo — PNG o JPEG, max 5 MB, ritagliato al centro in quadrato</label>
        <input
          id="logo"
          type="file"
          accept="image/png,image/jpeg"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <div className="field">
        <label htmlFor="bg">Sfondo — la trasparenza sulla Home di iOS diventa nera</label>
        <input id="bg" type="color" value={background} onChange={(e) => setBackground(e.target.value)} />
      </div>

      <button onClick={create} disabled={busy || !name.trim() || !file}>
        {busy ? 'Creazione…' : 'Crea preset'}
      </button>

      {error && <p className="error">{error}</p>}

      <h2>Come si installa</h2>
      <ol className="muted">
        <li>Apri il link del preset su iPhone, in Safari.</li>
        <li>Condividi → Aggiungi alla schermata Home.</li>
        <li>Apri l&apos;icona appena creata e attiva le notifiche.</li>
      </ol>
    </main>
  );
}
```

- [ ] **Step 4: Implementare `src/app/page.tsx`**

```tsx
import AdminApp from './AdminApp';

export const dynamic = 'force-dynamic';

export default function Page() {
  return <AdminApp />;
}
```

- [ ] **Step 5: Verificare la build**

Run: `npm run build`
Expected: build completata senza errori di tipo.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: interfaccia admin per creare e gestire i preset"
```

---

## Task 10: Interfaccia della PWA

**Files:**
- Create: `src/app/p/[slug]/PresetApp.tsx`, `src/app/p/[slug]/page.tsx`
- Test: verifica manuale in questa task, E2E nella Task 11

**Interfaces:**
- Consumes: `apiFetch`, `getToken`, `setToken`, `Preset`, `ScheduledSend`, `POST /api/subscribe/`, `POST /api/send/`, `GET /api/scheduled/`, `DELETE /api/scheduled/`
- Produces: la pagina installabile

- [ ] **Step 1: Implementare `src/app/p/[slug]/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import { getStore } from '@/lib/store';
import PresetApp from './PresetApp';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const preset = await getStore().getPreset(slug);
  return {
    title: preset?.name ?? 'Notifiche',
    manifest: `/p/${slug}/manifest/`,
    appleWebApp: { capable: true, statusBarStyle: 'black-translucent' as const, title: preset?.name },
  };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const preset = await getStore().getPreset(slug);
  if (!preset) notFound();

  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) throw new Error('VAPID_PUBLIC_KEY non è configurata sul server');

  // La chiave pubblica arriva al client da qui: nessuna variabile NEXT_PUBLIC_ da duplicare.
  return <PresetApp preset={preset} vapidPublicKey={vapidPublicKey} />;
}
```

- [ ] **Step 2: Implementare `src/app/p/[slug]/PresetApp.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, getToken, setToken } from '@/lib/client';
import type { Preset, ScheduledSend } from '@/lib/types';

type Props = { preset: Preset; vapidPublicKey: string };

type Unit = 'seconds' | 'minutes' | 'hours';

const QUICK: Array<{ label: string; value: number; unit: Unit }> = [
  { label: 'Subito', value: 0, unit: 'seconds' },
  { label: '5s', value: 5, unit: 'seconds' },
  { label: '10s', value: 10, unit: 'seconds' },
  { label: '30s', value: 30, unit: 'seconds' },
  { label: '1m', value: 1, unit: 'minutes' },
  { label: '5m', value: 5, unit: 'minutes' },
  { label: '30m', value: 30, unit: 'minutes' },
  { label: '1h', value: 1, unit: 'hours' },
];

const MULTIPLIERS: Record<Unit, number> = { seconds: 1, minutes: 60, hours: 3600 };

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export default function PresetApp({ preset, vapidPublicKey }: Props) {
  const [ready, setReady] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [supported, setSupported] = useState(true);
  const [tokenReady, setTokenReady] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const [title, setTitle] = useState(preset.defaultTitle);
  const [body, setBody] = useState(preset.defaultBody);
  const [value, setValue] = useState(10);
  const [unit, setUnit] = useState<Unit>('seconds');

  const [scheduled, setScheduled] = useState<ScheduledSend[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadScheduled = useCallback(async () => {
    try {
      const data = await apiFetch<{ scheduled: ScheduledSend[] }>('/api/scheduled/');
      setScheduled(data.scheduled.filter((s) => s.slug === preset.slug));
    } catch {
      // La lista è accessoria: un errore qui non deve bloccare l'invio.
    }
  }, [preset.slug]);

  useEffect(() => {
    setStandalone(isStandalone());
    setSupported('serviceWorker' in navigator && 'PushManager' in window);
    setSubscribed(typeof Notification !== 'undefined' && Notification.permission === 'granted');
    if (getToken()) {
      setTokenReady(true);
      void loadScheduled();
    }
    setReady(true);
  }, [loadScheduled]);

  const saveToken = () => {
    setToken(tokenInput.trim());
    setTokenReady(true);
    void loadScheduled();
  };

  // requestPermission deve stare dentro un handler di click: iOS la ignora altrimenti.
  const activate = async () => {
    setBusy(true);
    setError('');
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: `/p/${preset.slug}/`,
      });
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error(
          'Permesso negato. Riattivalo da Impostazioni → Notifiche, cerca il nome di questa app.',
        );
      }

      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        }));

      await apiFetch('/api/subscribe/', {
        method: 'POST',
        body: JSON.stringify({ slug: preset.slug, subscription: subscription.toJSON() }),
      });

      setSubscribed(true);
      setNotice('Notifiche attive su questo dispositivo.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const delaySeconds = value * MULTIPLIERS[unit];
      const result = await apiFetch<{ mode: string; sent?: number }>('/api/send/', {
        method: 'POST',
        body: JSON.stringify({ slug: preset.slug, title, body, delaySeconds }),
      });

      setNotice(
        result.mode === 'immediate'
          ? `Inviata a ${result.sent} dispositivo/i.`
          : `Programmata tra ${delaySeconds} secondi. Blocca lo schermo.`,
      );
      await loadScheduled();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: string) => {
    try {
      await apiFetch(`/api/scheduled/?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      await loadScheduled();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!ready) return <main />;

  if (!supported) {
    return (
      <main>
        <h1>{preset.name}</h1>
        <p>
          Questo browser non supporta le notifiche push. Su iPhone serve iOS 16.4 o successivo.
        </p>
      </main>
    );
  }

  if (!standalone) {
    return (
      <main>
        <h1>{preset.name}</h1>
        <p>Prima va aggiunta alla schermata Home, altrimenti iOS non permette le notifiche.</p>
        <ol>
          <li>Apri questa pagina in <strong>Safari</strong>.</li>
          <li>Tocca <strong>Condividi</strong>, l&apos;icona con la freccia in su.</li>
          <li>Scegli <strong>Aggiungi alla schermata Home</strong>.</li>
          <li>Apri l&apos;icona <strong>{preset.name}</strong> appena comparsa.</li>
        </ol>
        <p className="muted">
          Da computer questa schermata è normale: l&apos;invio funziona comunque dalla pagina
          admin.
        </p>
      </main>
    );
  }

  if (!tokenReady) {
    return (
      <main>
        <h1>{preset.name}</h1>
        <div className="field">
          <label htmlFor="token">Token</label>
          <input
            id="token"
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
          />
        </div>
        <button onClick={saveToken} disabled={!tokenInput.trim()}>
          Entra
        </button>
      </main>
    );
  }

  return (
    <main>
      <h1>{preset.name}</h1>

      {!subscribed && (
        <button onClick={activate} disabled={busy}>
          Attiva notifiche
        </button>
      )}

      {subscribed && (
        <>
          <div className="field">
            <label htmlFor="title">Titolo</label>
            <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="body">Testo</label>
            <textarea id="body" rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>

          <div className="field">
            <label>Ritardo</label>
            <div className="row" style={{ marginBottom: '0.5rem' }}>
              <input
                type="number"
                min={0}
                value={value}
                onChange={(e) => setValue(Math.max(0, Number(e.target.value)))}
              />
              <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
                <option value="seconds">secondi</option>
                <option value="minutes">minuti</option>
                <option value="hours">ore</option>
              </select>
            </div>
            <div className="chips">
              {QUICK.map((quick) => (
                <button
                  key={quick.label}
                  className="secondary"
                  onClick={() => {
                    setValue(quick.value);
                    setUnit(quick.unit);
                  }}
                >
                  {quick.label}
                </button>
              ))}
            </div>
          </div>

          <button onClick={send} disabled={busy || !title.trim()}>
            {busy ? 'Invio…' : 'Invia'}
          </button>

          <p className="muted" style={{ marginTop: '0.75rem' }}>
            Con l&apos;app in primo piano iOS non mostra il banner: dopo l&apos;invio blocca lo
            schermo.
          </p>
        </>
      )}

      {error && <p className="error">{error}</p>}
      {notice && <p className="ok">{notice}</p>}

      {scheduled.length > 0 && (
        <>
          <h2>Programmati</h2>
          {scheduled.map((item) => (
            <div className="card" key={item.id}>
              <strong>{item.title}</strong>
              <div className="muted">{new Date(item.sendAt).toLocaleString('it-IT')}</div>
              <button
                className="danger"
                onClick={() => cancel(item.id)}
                style={{ marginTop: '0.75rem' }}
              >
                Annulla
              </button>
            </div>
          ))}
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Verificare la build**

Run: `npm run build`
Expected: build completata senza errori di tipo.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: PWA per preset con attivazione, composer e programmati"
```

---

## Task 11: Test end-to-end

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/admin.spec.ts`
- Test: `tests/e2e/admin.spec.ts`

**Interfaces:**
- Consumes: l'app completa
- Produces: `npm run test:e2e`

> Il flusso push su iOS non è automatizzabile. Qui si copre ciò che è verificabile da desktop: creazione ed eliminazione di un preset, e la schermata di istruzioni fuori standalone.

- [ ] **Step 1: Installare i browser di Playwright**

```bash
npx playwright install chromium
```

- [ ] **Step 2: Scrivere `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 3: Scrivere `tests/e2e/admin.spec.ts`**

```ts
import { expect, test } from '@playwright/test';

const TOKEN = process.env.APP_TOKEN;

test.skip(!TOKEN, 'APP_TOKEN non impostato: servono le variabili in .env.local');

// PNG 1x1, il minimo per far passare la validazione lato client.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

test('crea un preset, lo mostra in lista e lo elimina', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Token').fill(TOKEN!);
  await page.getByRole('button', { name: 'Entra' }).click();

  const name = `E2E ${Date.now()}`;
  await page.getByLabel(/^Nome/).fill(name);
  await page.getByLabel(/^Logo/).setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });

  await page.getByRole('button', { name: 'Crea preset' }).click();

  await expect(page.getByText(name)).toBeVisible();

  // L'unica conferma nativa del flusso è quella sull'eliminazione.
  page.once('dialog', (dialog) => dialog.accept());
  await page
    .locator('.card', { hasText: name })
    .getByRole('button', { name: 'Elimina' })
    .click();

  await expect(page.getByText(name)).toHaveCount(0);
});

test('fuori standalone la PWA mostra le istruzioni di installazione, non il composer', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Token').fill(TOKEN!);
  await page.getByRole('button', { name: 'Entra' }).click();

  const name = `E2E Istruzioni ${Date.now()}`;
  await page.getByLabel(/^Nome/).fill(name);
  await page.getByLabel(/^Logo/).setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
  await page.getByRole('button', { name: 'Crea preset' }).click();
  await expect(page.getByText(name)).toBeVisible();

  const href = await page.locator('.card', { hasText: name }).locator('a').getAttribute('href');
  await page.goto(href!);

  await expect(page.getByText('Aggiungi alla schermata Home')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Invia' })).toHaveCount(0);

  await page.goto('/');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('.card', { hasText: name }).getByRole('button', { name: 'Elimina' }).click();
  await expect(page.getByText(name)).toHaveCount(0);
});
```

- [ ] **Step 4: Eseguire i test E2E**

Prerequisito: `.env.local` compilato con credenziali Upstash valide.

Run: `npm run test:e2e`
Expected: PASS, 2 test.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: copertura end-to-end del flusso admin"
```

---

## Task 12: Deploy e verifica su iPhone

**Files:**
- Create: `README.md`, `docs/checklist-iphone.md`

**Interfaces:**
- Consumes: tutto
- Produces: app in produzione e verificata sul device

- [ ] **Step 1: Creare le risorse Upstash**

Su console.upstash.com: creare un database Redis e attivare QStash. Copiare
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `QSTASH_TOKEN`,
`QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`.

- [ ] **Step 2: Generare le chiavi VAPID e il token**

```bash
npx web-push generate-vapid-keys
openssl rand -hex 32
```

- [ ] **Step 3: Scrivere `README.md`**

````markdown
# Notifiche personalizzate

PWA per iPhone che manda una push con testo scelto al momento, sotto un nome e un
logo scelti da te. Subito o dopo un ritardo, da secondi a giorni.

## Come funziona

Un **preset** è nome + logo. Diventa un'icona sulla Home di iOS. Il **testo** invece
è libero a ogni invio.

Sono separati per un motivo tecnico: Safari ignora i campi `icon` e `image` del payload
e mostra sempre nome e icona della PWA installata. Servono N loghi diversi → si
installano N icone.

## Setup

1. `npm install`
2. Copiare `.env.example` in `.env.local` e compilarlo:
   - `npx web-push generate-vapid-keys` per le chiavi VAPID
   - `openssl rand -hex 32` per `APP_TOKEN`
   - credenziali Redis e QStash da console.upstash.com
3. `npm run dev`

## Deploy su Vercel

```bash
npx vercel
npx vercel --prod
```

Impostare tutte le variabili di `.env.example` nel progetto Vercel.
`PUBLIC_BASE_URL` va messo **dopo** il primo deploy, con l'URL definitivo e senza
slash finale.

## Uso

1. Su `/` inserisci il token, crei un preset con nome e logo.
2. Apri `/p/<slug>/` **su iPhone, in Safari** → Condividi → Aggiungi alla schermata Home.
3. Apri l'icona, tocca *Attiva notifiche*, concedi il permesso.
4. Scrivi titolo e testo, scegli il ritardo, invia.

## Limiti noti

- Serve iOS 16.4+ e l'installazione sulla Home: le web push non funzionano in Safari.
- Nome e logo sono fissati all'installazione, non cambiano per singola notifica.
- Con l'app in primo piano iOS non mostra il banner: usa un ritardo e blocca lo schermo,
  oppure fai partire l'invio da un altro dispositivo.
- Ritardo massimo 7 giorni, limite di QStash.

## Test

```bash
npm test
npm run test:e2e
```
````

- [ ] **Step 4: Deploy su Vercel**

```bash
npx vercel --prod
```

Poi impostare `PUBLIC_BASE_URL` con l'URL di produzione e rifare il deploy.

- [ ] **Step 5: Scrivere `docs/checklist-iphone.md`**

```markdown
# Checklist di verifica su iPhone

Da eseguire a mano sul device: il flusso push iOS non è automatizzabile.

- [ ] `/` si apre, il token viene accettato e resta salvato dopo un refresh
- [ ] La creazione di un preset con un logo funziona e l'icona si vede in lista
- [ ] `/p/<slug>/` aperta in Safari mostra le istruzioni, non il composer
- [ ] Condividi → Aggiungi alla schermata Home crea l'icona con **nome e logo giusti**
- [ ] Aprendo l'icona la pagina parte in standalone e mostra *Attiva notifiche*
- [ ] *Attiva notifiche* fa comparire il prompt di iOS
- [ ] Negando il permesso compare il messaggio con le istruzioni per riattivarlo
- [ ] Invio con ritardo 10s: bloccando lo schermo la notifica arriva con nome e logo del preset
- [ ] Invio con ritardo 5 minuti: compare in *Programmati* e arriva puntuale
- [ ] *Annulla* su un programmato lo rimuove e la notifica non arriva
- [ ] Toccando la notifica si apre la PWA giusta
- [ ] Due preset installati insieme mostrano ognuno il proprio nome e logo
- [ ] L'invio da Mac su `/p/<slug>/` fa arrivare la notifica sull'iPhone bloccato
```

- [ ] **Step 6: Eseguire la checklist e annotare i risultati**

Spuntare le voci in `docs/checklist-iphone.md`. Se qualcosa fallisce, aprire un
task di fix prima di considerare chiusa la fase 1.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "docs: README e checklist di verifica su iPhone"
```

---

## Self-review

**Copertura dello spec**

| Sezione dello spec | Task |
|---|---|
| §2 separazione preset/invio | 3, 4, 9, 10 |
| §3 stack e setup | 1, 12 |
| §4 modello dati Redis | 3 |
| §5 route, trailingSlash, service worker statico, chiave VAPID da server component | 1, 4, 5, 10 |
| §6 ritardo, soglia, QStash, programmati e annullamento | 2, 7, 8, 10 |
| §7 flusso utente e invio da altro dispositivo | 9, 10, 12 |
| §8 sicurezza a token e firma QStash | 4, 7, 8 |
| §9 elaborazione icona | 9 |
| §10 tabella degli errori | 4, 6, 7, 8, 10 |
| §11 piano di test | 2–8 (unit e integration), 11 (E2E), 12 (manuale) |

**Coerenza dei tipi** — `Preset`, `SubscriptionRecord`, `ScheduledSend`, `IconSet`,
`IconSize` sono definiti una sola volta in `src/lib/types.ts` e riesportati da
`src/lib/store.ts`. `buildPayload` produce la forma che `public/sw.js` legge
(`title`, `body`, `icon`, `tag`, `url`). `deliver` ha la stessa firma nelle Task 6, 7 e 8.

**Scostamenti consapevoli dallo spec**

- Lo spec §10 prevede un errore dedicato per "nessuna subscription". Il piano lo colloca
  in `/api/send/` **prima** di scegliere il ramo, così vale per tutti e tre i casi.
- `/api/deliver/` non rifiuta un `id` già rimosso: consegna comunque. Una riconsegna di
  QStash non deve trasformarsi in una notifica persa.
