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
      offsets.push(offsets[offsets.length - 1]! + gap());
    }
  } else {
    assertWholeSecond(limit.seconds, 'La durata', 0);
    const end = startDelay + limit.seconds;
    for (;;) {
      const next = offsets[offsets.length - 1]! + gap();
      if (next > end) break;
      offsets.push(next);
      if (offsets.length > MAX_SERIES_LENGTH) {
        throw new RangeError(
          `Con questi valori la serie supererebbe ${MAX_SERIES_LENGTH} notifiche: accorcia la durata o allunga la cadenza`,
        );
      }
    }
  }

  const last = offsets[offsets.length - 1]!;
  if (last > MAX_DELAY_SECONDS) {
    throw new RangeError(
      `L'ultima notifica cadrebbe a ${last} secondi da adesso, oltre il tetto di 7 giorni`,
    );
  }

  return offsets;
}

export function pickAmount(amounts: readonly string[], rng: Rng): string {
  if (amounts.length === 0) throw new RangeError('Nessun importo tra cui scegliere');
  return amounts[Math.floor(rng() * amounts.length)]!;
}
