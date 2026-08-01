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
    expect(renderBody(`${AMOUNT_PLACEHOLDER} e ${AMOUNT_PLACEHOLDER}`, '9.99')).toBe('9.99 e 9.99');
  });

  it('lascia intatto un testo senza segnaposto', () => {
    expect(renderBody('Ciao', '9.99')).toBe('Ciao');
  });
});
