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
