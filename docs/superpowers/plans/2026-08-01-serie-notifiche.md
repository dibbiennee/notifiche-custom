# Serie di notifiche — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettere di programmare in un solo invio N notifiche distanziate nel tempo, ognuna con un importo pescato a caso tra quelli scelti, ed eliminare il campo Titolo.

**Architecture:** Due moduli puri e testabili — `src/lib/amounts.ts` per gli importi e la sostituzione del segnaposto, `src/lib/series.ts` per il calcolo degli istanti — consumati da `POST /api/send/`, che calcola tutti gli istanti al momento dell'invio e li programma tutti insieme marcandoli con lo stesso `seriesId`. Le consegne entro 30 secondi restano dentro la function, le altre diventano un messaggio QStash ciascuna, riusando la regola già presente in `src/lib/delay.ts`.

**Tech Stack:** Next.js 15 (App Router), TypeScript, React 19, Vitest, Playwright, Upstash Redis, Upstash QStash, web-push.

## Global Constraints

- Spec di riferimento: `docs/superpowers/specs/2026-08-01-serie-notifiche-design.md`.
- Commenti, messaggi di errore, testi dell'interfaccia e messaggi di commit **in italiano**, come tutto il resto del repo.
- Massimo **100** notifiche per serie.
- L'ultimo istante della serie deve stare entro `MAX_DELAY_SECONDS` (7 giorni), la costante già in `src/lib/delay.ts`.
- Soglia inline invariata: `INLINE_THRESHOLD_SECONDS` = 30 secondi.
- Importi preimpostati, esattamente questi cinque e in questa forma, senza separatore delle migliaia: `9.99`, `49.99`, `1890.00`, `11900.00`, `48900.00`.
- Segnaposto dell'importo: `|importo|`.
- Il simbolo `€` e la sigla `EUR` li scrive l'utente nel testo. Il codice sostituisce solo la cifra.
- Ogni casualità passa da una funzione `rng` iniettabile, così i test sono deterministici. Mai `Math.random()` chiamato direttamente dentro la logica.
- In produzione i preset sono zero: nessuna migrazione dei dati, si può cambiare la forma di `Preset` liberamente.
- Test: `npm test`. Un singolo file: `npx vitest run tests/lib/series.test.ts`.

---

### Task 1: Il titolo sparisce

Il campo Titolo si infila come riga in più sopra il nome della PWA. Va tolto da tutta la catena: form, richiesta, payload, service worker, tipi.

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/push.ts:12-25` (`buildPayload`)
- Modify: `src/app/api/send/route.ts`
- Modify: `src/app/api/deliver/route.ts`
- Modify: `src/app/api/presets/route.ts:10-11,56`
- Modify: `public/sw.js:24-31`
- Modify: `src/app/p/[slug]/PresetApp.tsx:58,241-247`
- Test: `tests/lib/push.test.ts`, e aggiornamento di `tests/lib/store.test.ts`, `tests/lib/manifest.test.ts`, `tests/api/send.test.ts`, `tests/api/deliver.test.ts`, `tests/api/scheduled.test.ts`, `tests/api/presets.test.ts`, `tests/api/subscribe.test.ts`, `tests/api/manifest-route.test.ts`, `tests/api/icon.test.ts`

**Interfaces:**
- Consumes: niente.
- Produces: `buildPayload(slug: string, body: string, now: number): NotificationPayload`, dove `NotificationPayload = { body: string; icon: string; tag: string; url: string }`. `Preset` senza `defaultTitle`. `ScheduledSend` senza `title`.

- [ ] **Step 1: Scrivere il test che fallisce**

In `tests/lib/push.test.ts`, sostituire il test esistente su `buildPayload` con:

```ts
it('costruisce il payload senza titolo', () => {
  expect(buildPayload('test-a', 'You received a payment of €9.99 EUR', 1700000000000)).toEqual({
    body: 'You received a payment of €9.99 EUR',
    icon: '/api/icon/test-a/192/',
    tag: 'test-a-1700000000000',
    url: '/p/test-a/',
  });
});
```

- [ ] **Step 2: Eseguirlo e verificare che fallisca**

Run: `npx vitest run tests/lib/push.test.ts`
Expected: FAIL — `buildPayload` ha ancora quattro parametri e restituisce `title`.

- [ ] **Step 3: Togliere il titolo dal payload**

In `src/lib/push.ts`:

```ts
export type NotificationPayload = {
  body: string;
  icon: string;
  tag: string;
  url: string;
};

export function buildPayload(slug: string, body: string, now: number): NotificationPayload {
  return {
    body,
    icon: `/api/icon/${slug}/192/`,
    tag: `${slug}-${now}`,
    url: `/p/${slug}/`,
  };
}
```

- [ ] **Step 4: Togliere il titolo dai tipi**

In `src/lib/types.ts`, eliminare `defaultTitle: string;` da `Preset` e `title: string;` da `ScheduledSend`.

- [ ] **Step 5: Togliere il titolo dal service worker**

In `public/sw.js`, sostituire il blocco del listener `push`. Il fallback `'Notifica'` deve sparire, altrimenti comparirebbe quella scritta al posto del titolo:

```js
  event.waitUntil(
    // Titolo vuoto di proposito: iOS mostra gia' il nome della PWA installata,
    // e un titolo valorizzato aggiungerebbe una riga sopra a quello.
    self.registration.showNotification('', {
      body: data.body || '',
      // Su iOS icon e badge vengono ignorati: contano quelli della PWA installata.
      // Restano qui perche' su Android e desktop funzionano.
      icon: data.icon,
      badge: data.icon,
      tag: data.tag,
      data: { url: data.url || '/' },
    }),
  );
```

Eliminare anche la riga `const title = data.title || 'Notifica';` sopra.

- [ ] **Step 6: Togliere il titolo dalle route**

In `src/app/api/send/route.ts`: togliere `title` dal tipo `Body`, togliere la riga che lo legge, e passare `buildPayload(slug, body, Date.now())` nei due punti in cui è usato. Rendere `body` obbligatorio al posto del titolo — `readText(raw.body, 'body', { required: true })`. Nel ramo QStash, togliere `title` dall'oggetto pubblicato e dalla chiamata `store.addScheduled`.

In `src/app/api/deliver/route.ts`: togliere `title` dal tipo `Body`, togliere `typeof payload.title !== 'string'` dal controllo, rendere `body` obbligatorio con lo stesso controllo degli altri campi, e chiamare `buildPayload(payload.slug, payload.body, Date.now())`.

In `src/app/api/presets/route.ts`: togliere `defaultTitle` dal tipo e dalla costruzione del preset.

- [ ] **Step 7: Togliere il campo dal form**

In `src/app/p/[slug]/PresetApp.tsx`: eliminare lo stato `title`/`setTitle`, il blocco `<div className="field">` del titolo, e la condizione `!title.trim()` dal `disabled` del bottone, che diventa `disabled={busy || !body.trim()}`. Nel corpo della `fetch` di `send`, mandare `{ slug, body, delaySeconds }`.

- [ ] **Step 8: Aggiornare i test esistenti**

In tutti i file elencati sopra, togliere `defaultTitle: '...'` dagli oggetti `Preset` e `title: '...'` dagli oggetti `ScheduledSend`. In `tests/api/send.test.ts` e `tests/api/deliver.test.ts`, togliere `title` dai corpi delle richieste e aggiungere `body` dove mancava, perché ora è il campo obbligatorio.

- [ ] **Step 9: Eseguire tutta la suite**

Run: `npm test`
Expected: PASS su tutti i file. Poi `npm run build` per verificare che TypeScript non trovi riferimenti rimasti.

- [ ] **Step 10: Commit**

```bash
git add -A src public tests
git commit -m "feat: elimina il campo titolo dalla notifica

iOS mostra gia' il nome della PWA installata: un titolo valorizzato
aggiungeva una riga sopra a quello. Il fallback 'Notifica' nel service
worker sparisce insieme al campo."
```

- [ ] **Step 11: Verifica manuale sull'iPhone — bloccante**

Deployare con `npx vercel --prod --yes`, poi far arrivare una notifica e guardarla a schermo bloccato.
Expected: si legge `from Stripe` e sotto il testo, senza riga vuota in cima e senza la scritta "Notifica".
Se invece resta una riga vuota, fermarsi e segnalarlo: il ripiego previsto dalla spec è passare il testo come titolo e lasciare il corpo vuoto, ma inverte l'ordine e va deciso insieme.

---

### Task 2: Importi e segnaposto

**Files:**
- Create: `src/lib/amounts.ts`
- Test: `tests/lib/amounts.test.ts`

**Interfaces:**
- Consumes: niente.
- Produces:
  - `PRESET_AMOUNTS: readonly string[]`
  - `AMOUNT_PLACEHOLDER: string`
  - `hasAmountPlaceholder(text: string): boolean`
  - `normalizeAmount(input: string): string` — lancia `RangeError` se non valido
  - `renderBody(template: string, amount: string): string`

- [ ] **Step 1: Scrivere i test che falliscono**

Creare `tests/lib/amounts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  AMOUNT_PLACEHOLDER,
  PRESET_AMOUNTS,
  hasAmountPlaceholder,
  normalizeAmount,
  renderBody,
} from '@/lib/amounts';

describe('PRESET_AMOUNTS', () => {
  it('sono i cinque importi richiesti, senza separatore delle migliaia', () => {
    expect(PRESET_AMOUNTS).toEqual(['9.99', '49.99', '1890.00', '11900.00', '48900.00']);
  });
});

describe('hasAmountPlaceholder', () => {
  it('riconosce il segnaposto', () => {
    expect(hasAmountPlaceholder(`You received a payment of €${AMOUNT_PLACEHOLDER} EUR`)).toBe(true);
  });

  it('è falso su un testo senza segnaposto', () => {
    expect(hasAmountPlaceholder('Ciao')).toBe(false);
  });
});

describe('normalizeAmount', () => {
  it('porta tutto a due decimali col punto', () => {
    expect(normalizeAmount('1890')).toBe('1890.00');
    expect(normalizeAmount('1890.5')).toBe('1890.50');
    expect(normalizeAmount('1890,5')).toBe('1890.50');
    expect(normalizeAmount('9.99')).toBe('9.99');
    expect(normalizeAmount('  49,99  ')).toBe('49.99');
  });

  it('rifiuta quello che non è un numero semplice', () => {
    expect(() => normalizeAmount('')).toThrow(RangeError);
    expect(() => normalizeAmount('abc')).toThrow(RangeError);
    expect(() => normalizeAmount('-10')).toThrow(RangeError);
    expect(() => normalizeAmount('1.234,56')).toThrow(RangeError);
    expect(() => normalizeAmount('10.999')).toThrow(RangeError);
  });
});

describe('renderBody', () => {
  it('sostituisce il segnaposto con la cifra', () => {
    expect(renderBody(`You received a payment of €${AMOUNT_PLACEHOLDER} EUR`, '1890.00')).toBe(
      'You received a payment of €1890.00 EUR',
    );
  });

  it('sostituisce tutte le occorrenze', () => {
    expect(renderBody(`${AMOUNT_PLACEHOLDER} e ${AMOUNT_PLACEHOLDER}`, '9.99')).toBe(
      '9.99 e 9.99',
    );
  });

  it('lascia intatto un testo senza segnaposto', () => {
    expect(renderBody('Ciao', '9.99')).toBe('Ciao');
  });
});
```

- [ ] **Step 2: Eseguirli e verificare che falliscano**

Run: `npx vitest run tests/lib/amounts.test.ts`
Expected: FAIL — il modulo `@/lib/amounts` non esiste.

- [ ] **Step 3: Scrivere il modulo**

Creare `src/lib/amounts.ts`:

```ts
/** Gli importi offerti come caselle da spuntare, nella forma richiesta. */
export const PRESET_AMOUNTS: readonly string[] = [
  '9.99',
  '49.99',
  '1890.00',
  '11900.00',
  '48900.00',
];

/** Nel testo dell'invio, questo pezzo viene sostituito con la cifra. */
export const AMOUNT_PLACEHOLDER = '|importo|';

export function hasAmountPlaceholder(text: string): boolean {
  return text.includes(AMOUNT_PLACEHOLDER);
}

/**
 * Accetta cifre con al massimo due decimali, separati da punto o virgola, e le
 * riporta sempre a due decimali col punto. Niente separatore delle migliaia:
 * la forma richiesta è `11900.00`, non `11,900.00`.
 */
export function normalizeAmount(input: string): string {
  const trimmed = input.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new RangeError(`Importo non valido: ${input}`);
  }
  return Number(trimmed).toFixed(2);
}

export function renderBody(template: string, amount: string): string {
  return template.split(AMOUNT_PLACEHOLDER).join(amount);
}
```

- [ ] **Step 4: Eseguire i test**

Run: `npx vitest run tests/lib/amounts.test.ts`
Expected: PASS, tutti.

- [ ] **Step 5: Commit**

```bash
git add src/lib/amounts.ts tests/lib/amounts.test.ts
git commit -m "feat: importi preimpostati e sostituzione del segnaposto"
```

---

### Task 3: Calcolo degli istanti della serie

**Files:**
- Create: `src/lib/series.ts`
- Test: `tests/lib/series.test.ts`

**Interfaces:**
- Consumes: `MAX_DELAY_SECONDS` da `@/lib/delay`.
- Produces:
  - `MAX_SERIES_LENGTH = 100`
  - `type Limit = { kind: 'count'; count: number } | { kind: 'duration'; seconds: number }`
  - `type Cadence = { kind: 'fixed'; seconds: number } | { kind: 'random'; min: number; max: number }`
  - `type Rng = () => number`
  - `computeOffsets(params: { startDelay: number; limit: Limit; cadence: Cadence; rng?: Rng }): number[]` — ritardi in secondi dal momento dell'invio, crescenti, il primo uguale a `startDelay`. Lancia `RangeError`.
  - `pickAmount(amounts: readonly string[], rng: Rng): string`

- [ ] **Step 1: Scrivere i test che falliscono**

Creare `tests/lib/series.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MAX_DELAY_SECONDS } from '@/lib/delay';
import { MAX_SERIES_LENGTH, computeOffsets, pickAmount } from '@/lib/series';

/** Restituisce i valori dati, in ordine, poi ricomincia. Rende i test deterministici. */
function fakeRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('computeOffsets — limite a numero', () => {
  it('con cadenza fissa distanzia gli istanti dell’intervallo', () => {
    expect(
      computeOffsets({
        startDelay: 10,
        limit: { kind: 'count', count: 4 },
        cadence: { kind: 'fixed', seconds: 30 },
      }),
    ).toEqual([10, 40, 70, 100]);
  });

  it('con count 1 restituisce solo il ritardo iniziale', () => {
    expect(
      computeOffsets({
        startDelay: 5,
        limit: { kind: 'count', count: 1 },
        cadence: { kind: 'fixed', seconds: 30 },
      }),
    ).toEqual([5]);
  });

  it('con cadenza casuale pesca dentro il range', () => {
    // rng 0 -> min, rng ~1 -> max
    expect(
      computeOffsets({
        startDelay: 0,
        limit: { kind: 'count', count: 3 },
        cadence: { kind: 'random', min: 5, max: 40 },
        rng: fakeRng([0, 0.999]),
      }),
    ).toEqual([0, 5, 45]);
  });
});

describe('computeOffsets — limite a durata', () => {
  it('riempie la finestra e si ferma prima di sforare', () => {
    expect(
      computeOffsets({
        startDelay: 0,
        limit: { kind: 'duration', seconds: 100 },
        cadence: { kind: 'fixed', seconds: 30 },
      }),
    ).toEqual([0, 30, 60, 90]);
  });

  it('la finestra parte dal ritardo iniziale', () => {
    expect(
      computeOffsets({
        startDelay: 60,
        limit: { kind: 'duration', seconds: 60 },
        cadence: { kind: 'fixed', seconds: 30 },
      }),
    ).toEqual([60, 90, 120]);
  });

  it('con finestra a zero resta una notifica sola', () => {
    expect(
      computeOffsets({
        startDelay: 0,
        limit: { kind: 'duration', seconds: 0 },
        cadence: { kind: 'fixed', seconds: 30 },
      }),
    ).toEqual([0]);
  });
});

describe('computeOffsets — limiti', () => {
  it('rifiuta più di cento notifiche chieste a numero', () => {
    expect(() =>
      computeOffsets({
        startDelay: 0,
        limit: { kind: 'count', count: MAX_SERIES_LENGTH + 1 },
        cadence: { kind: 'fixed', seconds: 1 },
      }),
    ).toThrow(RangeError);
  });

  it('rifiuta una finestra che ne produrrebbe più di cento', () => {
    expect(() =>
      computeOffsets({
        startDelay: 0,
        limit: { kind: 'duration', seconds: 1000 },
        cadence: { kind: 'fixed', seconds: 1 },
      }),
    ).toThrow(RangeError);
  });

  it("rifiuta una serie che finisce oltre il tetto dei sette giorni", () => {
    expect(() =>
      computeOffsets({
        startDelay: MAX_DELAY_SECONDS - 10,
        limit: { kind: 'count', count: 3 },
        cadence: { kind: 'fixed', seconds: 60 },
      }),
    ).toThrow(RangeError);
  });

  it('rifiuta parametri impossibili', () => {
    const base = { startDelay: 0, cadence: { kind: 'fixed', seconds: 30 } } as const;
    expect(() => computeOffsets({ ...base, limit: { kind: 'count', count: 0 } })).toThrow(RangeError);
    expect(() => computeOffsets({ ...base, limit: { kind: 'duration', seconds: -1 } })).toThrow(RangeError);
    expect(() =>
      computeOffsets({
        startDelay: -1,
        limit: { kind: 'count', count: 2 },
        cadence: { kind: 'fixed', seconds: 30 },
      }),
    ).toThrow(RangeError);
    expect(() =>
      computeOffsets({
        startDelay: 0,
        limit: { kind: 'count', count: 2 },
        cadence: { kind: 'fixed', seconds: 0 },
      }),
    ).toThrow(RangeError);
    expect(() =>
      computeOffsets({
        startDelay: 0,
        limit: { kind: 'count', count: 2 },
        cadence: { kind: 'random', min: 40, max: 5 },
      }),
    ).toThrow(RangeError);
  });
});

describe('pickAmount', () => {
  it('pesca in base al valore di rng', () => {
    expect(pickAmount(['9.99', '49.99', '1890.00'], () => 0)).toBe('9.99');
    expect(pickAmount(['9.99', '49.99', '1890.00'], () => 0.999)).toBe('1890.00');
  });

  it('rifiuta una lista vuota', () => {
    expect(() => pickAmount([], () => 0)).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Eseguirli e verificare che falliscano**

Run: `npx vitest run tests/lib/series.test.ts`
Expected: FAIL — il modulo `@/lib/series` non esiste.

- [ ] **Step 3: Scrivere il modulo**

Creare `src/lib/series.ts`:

```ts
import { MAX_DELAY_SECONDS } from './delay';

/** Tetto di notifiche per serie: ognuna consuma un messaggio QStash. */
export const MAX_SERIES_LENGTH = 100;

export type Limit = { kind: 'count'; count: number } | { kind: 'duration'; seconds: number };

export type Cadence =
  | { kind: 'fixed'; seconds: number }
  | { kind: 'random'; min: number; max: number };

/** Sorgente di casualità iniettabile: nei test si passa una sequenza fissa. */
export type Rng = () => number;

function assertWholeSecond(value: number, nome: string, minimo: number): void {
  if (!Number.isInteger(value) || value < minimo) {
    throw new RangeError(`${nome} deve essere un intero di secondi maggiore o uguale a ${minimo}`);
  }
}

function gapFactory(cadence: Cadence, rng: Rng): () => number {
  if (cadence.kind === 'fixed') {
    assertWholeSecond(cadence.seconds, 'La cadenza', 1);
    return () => cadence.seconds;
  }
  assertWholeSecond(cadence.min, 'Il minimo della cadenza', 1);
  assertWholeSecond(cadence.max, 'Il massimo della cadenza', 1);
  if (cadence.min > cadence.max) {
    throw new RangeError('Il minimo della cadenza non può superare il massimo');
  }
  // +1 perché gli estremi sono inclusi.
  return () => cadence.min + Math.floor(rng() * (cadence.max - cadence.min + 1));
}

/**
 * Gli istanti della serie, come ritardi in secondi dal momento dell'invio.
 * Il primo è sempre `startDelay`.
 */
export function computeOffsets(params: {
  startDelay: number;
  limit: Limit;
  cadence: Cadence;
  rng?: Rng;
}): number[] {
  const { startDelay, limit, cadence, rng = Math.random } = params;

  assertWholeSecond(startDelay, 'Il ritardo iniziale', 0);
  const gap = gapFactory(cadence, rng);

  const offsets = [startDelay];

  if (limit.kind === 'count') {
    assertWholeSecond(limit.count, 'Il numero di notifiche', 1);
    if (limit.count > MAX_SERIES_LENGTH) {
      throw new RangeError(
        `Una serie può arrivare a ${MAX_SERIES_LENGTH} notifiche, ne sono state chieste ${limit.count}`,
      );
    }
    while (offsets.length < limit.count) {
      offsets.push(offsets[offsets.length - 1] + gap());
    }
  } else {
    assertWholeSecond(limit.seconds, 'La durata', 0);
    const end = startDelay + limit.seconds;
    for (;;) {
      const next = offsets[offsets.length - 1] + gap();
      if (next > end) break;
      offsets.push(next);
      if (offsets.length > MAX_SERIES_LENGTH) {
        throw new RangeError(
          `Con questi valori la serie supererebbe ${MAX_SERIES_LENGTH} notifiche: accorcia la durata o allunga la cadenza`,
        );
      }
    }
  }

  const last = offsets[offsets.length - 1];
  if (last > MAX_DELAY_SECONDS) {
    throw new RangeError(
      `L'ultima notifica cadrebbe a ${last} secondi da adesso, oltre il tetto di 7 giorni`,
    );
  }

  return offsets;
}

export function pickAmount(amounts: readonly string[], rng: Rng): string {
  if (amounts.length === 0) throw new RangeError('Nessun importo tra cui scegliere');
  return amounts[Math.floor(rng() * amounts.length)];
}
```

- [ ] **Step 4: Eseguire i test**

Run: `npx vitest run tests/lib/series.test.ts`
Expected: PASS, tutti.

- [ ] **Step 5: Commit**

```bash
git add src/lib/series.ts tests/lib/series.test.ts
git commit -m "feat: calcolo degli istanti di una serie di notifiche"
```

---

### Task 4: La serie in `POST /api/send/`

**Files:**
- Modify: `src/lib/types.ts` (campi `seriesId`, `seriesIndex` su `ScheduledSend`)
- Modify: `src/app/api/send/route.ts`
- Test: `tests/api/send.test.ts`

**Interfaces:**
- Consumes: `computeOffsets`, `pickAmount`, `MAX_SERIES_LENGTH` da `@/lib/series`; `hasAmountPlaceholder`, `normalizeAmount`, `renderBody` da `@/lib/amounts`; `buildPayload` a tre parametri dal Task 1.
- Produces: la richiesta accetta `amounts?: string[]` e `series?: { limit, cadence }`. Con `series` presente la risposta è `202 { mode: 'series', seriesId, count, scheduled, inline }`. Senza `series` le risposte restano quelle di oggi: `{ mode: 'immediate', sent, removed }`, `202 { mode: 'inline', delaySeconds }`, `202 { mode: 'scheduled', id, sendAt }`.

- [ ] **Step 1: Scrivere i test che falliscono**

Aggiungere in `tests/api/send.test.ts`, dentro un nuovo `describe`:

```ts
describe('serie', () => {
  const seriesRequest = (extra: Record<string, unknown>) =>
    new Request('https://x.test/api/send/', {
      method: 'POST',
      headers: { authorization: 'Bearer segreto', 'content-type': 'application/json' },
      body: JSON.stringify({
        slug: 'test-a',
        body: 'You received a payment of €|importo| EUR',
        delaySeconds: 60,
        amounts: ['9.99', '1890.00'],
        ...extra,
      }),
    });

  it('programma una notifica per ogni istante calcolato', async () => {
    const res = await POST(
      seriesRequest({
        series: { limit: { kind: 'count', count: 3 }, cadence: { kind: 'fixed', seconds: 60 } },
      }),
    );

    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.mode).toBe('series');
    expect(json.count).toBe(3);
    expect(publishJSON).toHaveBeenCalledTimes(3);
    expect(publishJSON.mock.calls.map((c) => c[0].delay)).toEqual(['60s', '120s', '180s']);

    const scheduled = await store.listScheduled();
    expect(scheduled).toHaveLength(3);
    expect(new Set(scheduled.map((s) => s.seriesId)).size).toBe(1);
  });

  it('sostituisce il segnaposto con uno degli importi scelti', async () => {
    await POST(
      seriesRequest({
        series: { limit: { kind: 'count', count: 3 }, cadence: { kind: 'fixed', seconds: 60 } },
      }),
    );

    for (const call of publishJSON.mock.calls) {
      const body = (call[0] as { body: { body: string } }).body.body;
      expect(['You received a payment of €9.99 EUR', 'You received a payment of €1890.00 EUR'])
        .toContain(body);
    }
  });

  it('rifiuta il segnaposto senza importi scelti', async () => {
    const res = await POST(
      seriesRequest({
        amounts: [],
        series: { limit: { kind: 'count', count: 2 }, cadence: { kind: 'fixed', seconds: 60 } },
      }),
    );

    expect(res.status).toBe(400);
    expect(publishJSON).not.toHaveBeenCalled();
  });

  it('rifiuta una serie oltre le cento notifiche senza pubblicare niente', async () => {
    const res = await POST(
      seriesRequest({
        series: { limit: { kind: 'count', count: 101 }, cadence: { kind: 'fixed', seconds: 60 } },
      }),
    );

    expect(res.status).toBe(400);
    expect(publishJSON).not.toHaveBeenCalled();
    expect(await store.listScheduled()).toHaveLength(0);
  });

  it('annulla quelle già pubblicate se una pubblicazione fallisce', async () => {
    const del = vi.fn(async () => undefined);
    let n = 0;
    publishJSON.mockImplementation(async () => {
      n += 1;
      if (n === 3) throw new Error('QStash giù');
      return { messageId: `msg-${n}` };
    });
    setQstashClientForTesting({ publishJSON, messages: { delete: del } });

    const res = await POST(
      seriesRequest({
        series: { limit: { kind: 'count', count: 4 }, cadence: { kind: 'fixed', seconds: 60 } },
      }),
    );

    expect(res.status).toBe(500);
    expect(del).toHaveBeenCalledTimes(2);
    expect(await store.listScheduled()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Eseguirli e verificare che falliscano**

Run: `npx vitest run tests/api/send.test.ts`
Expected: FAIL — la route ignora `series` e risponde `mode: 'scheduled'`.

- [ ] **Step 3: Aggiungere i campi al tipo**

In `src/lib/types.ts`, dentro `ScheduledSend`:

```ts
  /** Stesso valore per tutte le consegne di una serie. Assente su un invio singolo. */
  seriesId?: string;
  /** Posizione dentro la serie, da 0, per ordinare la lista. */
  seriesIndex?: number;
```

- [ ] **Step 4: Leggere e validare la serie nella route**

In `src/app/api/send/route.ts`, aggiungere sopra `POST`:

```ts
function readAmounts(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new BadRequestError('Il campo amounts deve essere una lista');
  try {
    return value.map((item) => normalizeAmount(String(item)));
  } catch (error) {
    throw new BadRequestError((error as Error).message);
  }
}

/** Traduce i RangeError di computeOffsets in 400, con il loro messaggio. */
function readOffsets(raw: unknown, startDelay: number): number[] {
  if (raw === undefined) return [startDelay];
  const series = raw as { limit?: Limit; cadence?: Cadence };
  if (!series.limit || !series.cadence) {
    throw new BadRequestError('La serie richiede limit e cadence');
  }
  try {
    return computeOffsets({ startDelay, limit: series.limit, cadence: series.cadence });
  } catch (error) {
    throw new BadRequestError((error as Error).message);
  }
}
```

- [ ] **Step 5: Implementare il fan-out**

Sempre in `src/app/api/send/route.ts`, dentro `POST`, dopo i controlli su preset e subscription e **prima** dei tre rami esistenti:

```ts
    const amounts = readAmounts(raw.amounts);
    if (hasAmountPlaceholder(body) && amounts.length === 0) {
      throw new BadRequestError('Il testo contiene |importo| ma non è stato scelto nessun importo');
    }

    // Ramo serie: si calcola tutto prima, si pubblica su QStash prima di avviare
    // le consegne inline, e se una pubblicazione fallisce si annulla l'iniziato.
    if (raw.series !== undefined) {
      const offsets = readOffsets(raw.series, delaySeconds);
      const seriesId = randomUUID();
      const texts = offsets.map(() =>
        amounts.length > 0 ? renderBody(body, pickAmount(amounts, Math.random)) : body,
      );

      const published: Array<{ id: string; messageId: string }> = [];
      const inline: Array<{ offset: number; text: string }> = [];

      try {
        for (const [index, offset] of offsets.entries()) {
          if (deliveryMode(offset) === 'inline') {
            inline.push({ offset, text: texts[index] });
            continue;
          }
          const id = randomUUID();
          const messageId = await publishDelayed({
            url: deliverCallbackUrl(),
            delaySeconds: offset,
            body: { id, slug, body: texts[index] },
          });
          await store.addScheduled({
            id,
            slug,
            body: texts[index],
            sendAt: Date.now() + offset * 1000,
            messageId,
            seriesId,
            seriesIndex: index,
          });
          published.push({ id, messageId });
        }
      } catch (error) {
        for (const item of published) {
          await cancelMessage(item.messageId).catch(() => undefined);
          await store.removeScheduled(item.id).catch(() => undefined);
        }
        throw error;
      }

      if (inline.length > 0) {
        after(async () => {
          let waited = 0;
          for (const item of inline) {
            await sleep((item.offset - waited) * 1000);
            waited = item.offset;
            await deliver(store, slug, buildPayload(slug, item.text, Date.now()), webPushSender);
          }
        });
      }

      return Response.json(
        {
          mode: 'series',
          seriesId,
          count: offsets.length,
          scheduled: published.length,
          inline: inline.length,
        },
        { status: 202 },
      );
    }
```

Aggiungere `series?: unknown; amounts?: unknown;` al tipo `Body`. Agli import aggiungere `cancelMessage` da `@/lib/qstash`, `computeOffsets`, `pickAmount` e i tipi `Cadence`, `Limit` da `@/lib/series`, `hasAmountPlaceholder`, `normalizeAmount`, `renderBody` da `@/lib/amounts`. Attenzione: `deliveryMode` e `MAX_DELAY_SECONDS` sono **già** importati da `@/lib/delay` in cima al file — non aggiungere un secondo import.

Nei tre rami esistenti, applicare la stessa sostituzione del segnaposto: dove oggi si passa `body`, passare `amounts.length > 0 ? renderBody(body, pickAmount(amounts, Math.random)) : body`.

- [ ] **Step 6: Eseguire i test**

Run: `npx vitest run tests/api/send.test.ts`
Expected: PASS, sia i nuovi sia quelli già presenti sull'invio singolo.

- [ ] **Step 7: Eseguire tutta la suite e il build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/types.ts src/app/api/send/route.ts tests/api/send.test.ts
git commit -m "feat: programma una serie di notifiche in un solo invio"
```

---

### Task 5: Annullare una serie intera

**Files:**
- Modify: `src/app/api/scheduled/route.ts`
- Test: `tests/api/scheduled.test.ts`

**Interfaces:**
- Consumes: `seriesId` su `ScheduledSend` dal Task 4.
- Produces: `DELETE /api/scheduled/?seriesId=<uuid>` annulla tutte le consegne della serie ancora programmate e risponde `{ ok: true, cancelled: number }`. La forma con `?id=` resta invariata.

- [ ] **Step 1: Scrivere i test che falliscono**

Aggiungere in `tests/api/scheduled.test.ts`:

```ts
describe('DELETE /api/scheduled/?seriesId=', () => {
  beforeEach(async () => {
    for (const i of [0, 1, 2]) {
      await store.addScheduled({
        id: `serie-${i}`,
        slug: 'test-a',
        body: 'B',
        sendAt: 3000 + i,
        messageId: `msg-serie-${i}`,
        seriesId: 'abc',
        seriesIndex: i,
      });
    }
  });

  it('annulla tutte le consegne della serie', async () => {
    const res = await DELETE(authed('https://x.test/api/scheduled/?seriesId=abc', 'DELETE'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, cancelled: 3 });
    expect(del).toHaveBeenCalledTimes(3);

    const rimasti = await store.listScheduled();
    expect(rimasti.map((s) => s.id)).toEqual(['id-1']);
  });

  it('risponde 404 su una serie inesistente', async () => {
    const res = await DELETE(authed('https://x.test/api/scheduled/?seriesId=zzz', 'DELETE'));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Eseguirli e verificare che falliscano**

Run: `npx vitest run tests/api/scheduled.test.ts`
Expected: FAIL con 400 "Parametro id mancante".

- [ ] **Step 3: Implementare il ramo seriesId**

In `src/app/api/scheduled/route.ts`, dentro `DELETE`, sostituire il controllo del parametro:

```ts
    const params = new URL(request.url).searchParams;
    const id = params.get('id');
    const seriesId = params.get('seriesId');
    if (!id && !seriesId) throw new BadRequestError('Serve il parametro id oppure seriesId');

    const store = getStore();

    if (seriesId) {
      const items = (await store.listScheduled()).filter((s) => s.seriesId === seriesId);
      if (items.length === 0) throw new NotFoundError('Serie non trovata');

      // Prima QStash, poi il record, come per il singolo: un 404 da QStash non è un errore.
      for (const item of items) {
        await cancelMessage(item.messageId);
        await store.removeScheduled(item.id);
      }

      return Response.json({ ok: true, cancelled: items.length });
    }
```

Il resto della funzione, che gestisce `id`, resta invariato — con `id!` o un controllo esplicito, visto che a quel punto è per forza valorizzato.

- [ ] **Step 4: Eseguire i test**

Run: `npx vitest run tests/api/scheduled.test.ts`
Expected: PASS, sia i nuovi sia quelli sul singolo id.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/scheduled/route.ts tests/api/scheduled.test.ts
git commit -m "feat: annulla una serie intera con un parametro seriesId"
```

---

### Task 6: Il form

`PresetApp.tsx` sfiora già le 300 righe fra gating, iscrizione, form e lista. Aggiungerci la serie lo porterebbe oltre le 450: il form di composizione esce in un file suo.

**Files:**
- Create: `src/app/p/[slug]/SendForm.tsx`
- Modify: `src/app/p/[slug]/PresetApp.tsx`
- Test: `tests/e2e/preset.spec.ts` (Task 7)

**Interfaces:**
- Consumes: `PRESET_AMOUNTS`, `AMOUNT_PLACEHOLDER` da `@/lib/amounts`.
- Produces: `<SendForm onSend={(payload) => Promise<void>} busy={boolean} />`, dove `payload` è `{ body: string; delaySeconds: number; amounts: string[]; series?: { limit: Limit; cadence: Cadence } }`.

- [ ] **Step 1: Estrarre il form senza cambiarne il comportamento**

Creare `src/app/p/[slug]/SendForm.tsx` con questa impalcatura, spostandoci da `PresetApp.tsx` i campi Testo e Ritardo con i loro stati (`body`, `value`, `unit`), la costante `QUICK` e la mappa `MULTIPLIERS`. Il componente non chiama le API: costruisce il payload e invoca `onSend`.

```tsx
'use client';

import { useState } from 'react';
import { AMOUNT_PLACEHOLDER, PRESET_AMOUNTS } from '@/lib/amounts';
import type { Cadence, Limit } from '@/lib/series';

type Unit = 'seconds' | 'minutes' | 'hours';

export type SendPayload = {
  body: string;
  delaySeconds: number;
  amounts: string[];
  series?: { limit: Limit; cadence: Cadence };
};

type Props = {
  defaultBody: string;
  busy: boolean;
  onSend: (payload: SendPayload) => Promise<void>;
};

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

export default function SendForm({ defaultBody, busy, onSend }: Props) {
  const [body, setBody] = useState(defaultBody);
  const [value, setValue] = useState(10);
  const [unit, setUnit] = useState<Unit>('seconds');
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState('');

  const toggle = (amount: string) =>
    setSelected((prev) =>
      prev.includes(amount) ? prev.filter((a) => a !== amount) : [...prev, amount],
    );

  // I campi Testo e Ritardo si spostano qui identici a com'erano.
  return <>{/* markup */}</>;
}
```

In `PresetApp.tsx`, sostituire il blocco del form con `<SendForm defaultBody={preset.defaultBody} busy={busy} onSend={send} />`, togliere gli stati che si sono spostati e cambiare la firma di `send` perché accetti il payload invece di leggere lo stato locale.

- [ ] **Step 2: Verificare che non sia cambiato niente**

Run: `npm run build`
Expected: compila. L'app si comporta come prima del Task 6.

- [ ] **Step 3: Commit dell'estrazione, separato dalla funzionalità**

```bash
git add src/app/p/[slug]
git commit -m "refactor: estrae il form di invio in SendForm"
```

- [ ] **Step 4: Aggiungere il blocco Importo**

In `SendForm.tsx`, sotto il campo Testo:

```tsx
      <div className="field">
        <label>Importo — finisce dove scrivi {AMOUNT_PLACEHOLDER}</label>
        <div className="chips">
          {PRESET_AMOUNTS.map((amount) => (
            <button
              key={amount}
              className={selected.includes(amount) ? 'secondary selected' : 'secondary'}
              onClick={() => toggle(amount)}
            >
              €{amount}
            </button>
          ))}
        </div>
        <input
          placeholder="altro importo"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
        />
      </div>
```

Con lo stato `const [selected, setSelected] = useState<string[]>([])`, `const [custom, setCustom] = useState('')`, e `toggle` che aggiunge o rimuove dalla lista. Gli importi mandati sono `selected` più `custom` se non vuoto.

- [ ] **Step 5: Aggiungere i blocchi Quante e Ogni quanto**

Sempre in `SendForm.tsx`. Gli stati:

```tsx
const [mode, setMode] = useState<'single' | 'series'>('single');
const [limitKind, setLimitKind] = useState<'count' | 'duration'>('count');
const [count, setCount] = useState(20);
const [durationValue, setDurationValue] = useState(5);
const [durationUnit, setDurationUnit] = useState<Unit>('minutes');
const [cadenceKind, setCadenceKind] = useState<'fixed' | 'random'>('fixed');
const [cadenceValue, setCadenceValue] = useState(30);
const [cadenceUnit, setCadenceUnit] = useState<Unit>('seconds');
const [randomMin, setRandomMin] = useState(5);
const [randomMax, setRandomMax] = useState(40);
```

Il markup, sotto il blocco Ritardo:

```tsx
      <div className="field">
        <label>Quante</label>
        <label>
          <input type="radio" checked={mode === 'single'} onChange={() => setMode('single')} /> Una
          sola
        </label>
        <label>
          <input type="radio" checked={mode === 'series'} onChange={() => setMode('series')} /> Più
          di una
        </label>

        {mode === 'series' && (
          <>
            <label>
              <input
                type="radio"
                checked={limitKind === 'count'}
                onChange={() => setLimitKind('count')}
              />{' '}
              numero preciso
            </label>
            {limitKind === 'count' && (
              <input
                type="number"
                min={1}
                max={100}
                value={count}
                onChange={(e) => setCount(Math.max(1, Number(e.target.value)))}
              />
            )}

            <label>
              <input
                type="radio"
                checked={limitKind === 'duration'}
                onChange={() => setLimitKind('duration')}
              />{' '}
              per un periodo
            </label>
            {limitKind === 'duration' && (
              <div className="row">
                <input
                  type="number"
                  min={0}
                  value={durationValue}
                  onChange={(e) => setDurationValue(Math.max(0, Number(e.target.value)))}
                />
                <select
                  value={durationUnit}
                  onChange={(e) => setDurationUnit(e.target.value as Unit)}
                >
                  <option value="seconds">secondi</option>
                  <option value="minutes">minuti</option>
                  <option value="hours">ore</option>
                </select>
              </div>
            )}
          </>
        )}
      </div>

      {mode === 'series' && (
        <div className="field">
          <label>Ogni quanto</label>
          <label>
            <input
              type="radio"
              checked={cadenceKind === 'fixed'}
              onChange={() => setCadenceKind('fixed')}
            />{' '}
            ogni
          </label>
          {cadenceKind === 'fixed' && (
            <div className="row">
              <input
                type="number"
                min={1}
                value={cadenceValue}
                onChange={(e) => setCadenceValue(Math.max(1, Number(e.target.value)))}
              />
              <select value={cadenceUnit} onChange={(e) => setCadenceUnit(e.target.value as Unit)}>
                <option value="seconds">secondi</option>
                <option value="minutes">minuti</option>
                <option value="hours">ore</option>
              </select>
            </div>
          )}

          <label>
            <input
              type="radio"
              checked={cadenceKind === 'random'}
              onChange={() => setCadenceKind('random')}
            />{' '}
            a caso tra
          </label>
          {cadenceKind === 'random' && (
            <div className="row">
              <input
                type="number"
                min={1}
                value={randomMin}
                onChange={(e) => setRandomMin(Math.max(1, Number(e.target.value)))}
              />
              <input
                type="number"
                min={1}
                value={randomMax}
                onChange={(e) => setRandomMax(Math.max(1, Number(e.target.value)))}
              />
              <span className="muted">secondi</span>
            </div>
          )}
        </div>
      )}
```

E la costruzione del payload, che include `series` solo in modalità serie:

```tsx
  const submit = () => {
    const amounts = [...selected, ...(custom.trim() ? [custom.trim()] : [])];
    const delaySeconds = value * MULTIPLIERS[unit];

    if (mode === 'single') {
      void onSend({ body, delaySeconds, amounts });
      return;
    }

    void onSend({
      body,
      delaySeconds,
      amounts,
      series: {
        limit:
          limitKind === 'count'
            ? { kind: 'count', count }
            : { kind: 'duration', seconds: durationValue * MULTIPLIERS[durationUnit] },
        cadence:
          cadenceKind === 'fixed'
            ? { kind: 'fixed', seconds: cadenceValue * MULTIPLIERS[cadenceUnit] }
            : { kind: 'random', min: randomMin, max: randomMax },
      },
    });
  };
```

- [ ] **Step 6: Verificare a mano nel browser**

Run: `npm run dev`, aprire `/p/<slug>/` da desktop.
Expected: con "Una sola" i blocchi della serie sono nascosti; scegliendo "Più di una" compaiono; "numero preciso" e "per un periodo" si escludono; il campo Titolo non c'è.

- [ ] **Step 7: Commit**

```bash
git add src/app/p/[slug]/SendForm.tsx
git commit -m "feat: campi per importo, quantita' e cadenza della serie"
```

---

### Task 7: Lista raggruppata, E2E e documentazione

**Files:**
- Modify: `src/app/p/[slug]/PresetApp.tsx` (lista dei programmati)
- Create: `tests/e2e/preset.spec.ts`
- Modify: `docs/checklist-iphone.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: `DELETE /api/scheduled/?seriesId=` dal Task 5; `seriesId`, `seriesIndex` su `ScheduledSend`.
- Produces: niente per i task successivi.

- [ ] **Step 1: Raggruppare la lista dei programmati**

In `PresetApp.tsx`, sopra il `return`:

```tsx
  type Gruppo = { key: string; seriesId?: string; first: ScheduledSend; count: number };

  const gruppi: Gruppo[] = [];
  for (const item of [...scheduled].sort((a, b) => a.sendAt - b.sendAt)) {
    const esistente = item.seriesId
      ? gruppi.find((g) => g.seriesId === item.seriesId)
      : undefined;
    if (esistente) {
      esistente.count += 1;
      continue;
    }
    gruppi.push({ key: item.id, seriesId: item.seriesId, first: item, count: 1 });
  }
```

E nella lista, al posto di `scheduled.map(...)`:

```tsx
          {gruppi.map((gruppo) => (
            <div className="card" key={gruppo.key}>
              <strong>{gruppo.first.body}</strong>
              <div className="muted">
                {new Date(gruppo.first.sendAt).toLocaleString('it-IT')}
                {gruppo.count > 1 && ` · ne restano ${gruppo.count}`}
              </div>
              <button
                className="danger"
                onClick={() =>
                  gruppo.seriesId
                    ? cancelSeries(gruppo.seriesId)
                    : cancel(gruppo.first.id)
                }
                style={{ marginTop: '0.75rem' }}
              >
                {gruppo.count > 1 ? 'Annulla la serie' : 'Annulla'}
              </button>
            </div>
          ))}
```

Con, accanto a `cancel`:

```tsx
  const cancelSeries = async (seriesId: string) => {
    try {
      await apiFetch(`/api/scheduled/?seriesId=${encodeURIComponent(seriesId)}`, {
        method: 'DELETE',
      });
      await loadScheduled();
    } catch (e) {
      setError((e as Error).message);
    }
  };
```

- [ ] **Step 2: Scrivere l'E2E**

Creare `tests/e2e/preset.spec.ts`. Il preset va creato prima via API, come fa `tests/e2e/admin.spec.ts`; qui si assume che quel file esponga già il giro di login, e in caso contrario si ripete lo stesso schema.

```ts
import { expect, test } from '@playwright/test';

const TOKEN = process.env.APP_TOKEN;

test.skip(!TOKEN, 'Serve APP_TOKEN in .env.local');

test.describe('form di invio', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/p/e2e-serie/');
    // La pagina chiede il token finché il cookie di sessione non esiste.
    const campo = page.getByLabel('Token');
    if (await campo.isVisible()) {
      await campo.fill(TOKEN as string);
      await page.getByRole('button', { name: 'Entra' }).click();
    }
  });

  test('non esiste più il campo Titolo', async ({ page }) => {
    await expect(page.getByLabel('Titolo')).toHaveCount(0);
  });

  test('i blocchi della serie compaiono solo con "Più di una"', async ({ page }) => {
    await expect(page.getByText('Ogni quanto')).toHaveCount(0);
    await page.getByLabel('Più di una').check();
    await expect(page.getByText('Ogni quanto')).toBeVisible();
  });

  test('numero preciso e per un periodo si escludono', async ({ page }) => {
    await page.getByLabel('Più di una').check();
    await page.getByLabel('per un periodo').check();
    await expect(page.getByLabel('numero preciso')).not.toBeChecked();
  });
});
```

Nota per chi implementa: perché `getByLabel` funzioni, ogni `<input type="radio">` del Task 6 deve stare **dentro** il suo `<label>`, com'è scritto lì. Se si cambia quel markup, vanno cambiati anche questi selettori.

- [ ] **Step 3: Eseguire gli E2E**

Run: `npm run test:e2e`
Expected: PASS. Senza `APP_TOKEN` in `.env.local` i test si auto-skippano: in quel caso compilare il file prima.

- [ ] **Step 4: Aggiornare la documentazione**

In `README.md`: al capitolo *Uso*, sostituire "Scrivi titolo e testo" con la descrizione del form nuovo. Nei *Limiti noti*, aggiungere che una serie da N notifiche consuma N messaggi QStash e che il massimo è 100.

In `docs/checklist-iphone.md`: aggiungere la verifica del titolo assente (`from Stripe` + testo, senza riga vuota) e quella di una serie breve che arriva davvero a schermo bloccato.

- [ ] **Step 5: Eseguire tutta la suite e il build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A src tests docs README.md
git commit -m "feat: lista raggruppata per serie, E2E e documentazione"
```

- [ ] **Step 7: Deploy e verifica sul telefono**

```bash
npx vercel --prod --yes && npm run smoke -- https://notifiche-custom.vercel.app
```

Poi, dall'iPhone, una serie corta — 4 notifiche ogni 10 secondi con due importi spuntati — a schermo bloccato.
Expected: arrivano tutte e quattro, con importi che variano tra i due scelti, e sopra si legge solo `from Stripe`.
