import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config';

describe('configurazione del progetto', () => {
  it('ha trailingSlash attivo, senza cui il manifest non è installabile su iOS', () => {
    expect(nextConfig.trailingSlash).toBe(true);
  });
});
