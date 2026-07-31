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

  it('rifiuta uno schema diverso da Bearer', () => {
    vi.stubEnv('APP_TOKEN', 'segreto');
    expect(() => assertAuthorized(request('Basic segreto'))).toThrow(UnauthorizedError);
  });

  it('fallisce forte se APP_TOKEN non è configurato', () => {
    vi.stubEnv('APP_TOKEN', '');
    expect(() => assertAuthorized(request('Bearer x'))).toThrow(/APP_TOKEN/);
  });
});
