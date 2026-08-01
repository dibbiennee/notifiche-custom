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
