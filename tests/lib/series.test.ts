import { describe, expect, it } from 'vitest';
import { MAX_DELAY_SECONDS } from '@/lib/delay';
import { MAX_SERIES_LENGTH, computeOffsets, pickAmount } from '@/lib/series';

/** Restituisce i valori dati, in ordine, poi ricomincia. Rende i test deterministici. */
function fakeRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
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

  it('rifiuta una serie che finisce oltre il tetto dei sette giorni', () => {
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
    expect(() => computeOffsets({ ...base, limit: { kind: 'count', count: 0 } })).toThrow(
      RangeError,
    );
    expect(() => computeOffsets({ ...base, limit: { kind: 'duration', seconds: -1 } })).toThrow(
      RangeError,
    );
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
