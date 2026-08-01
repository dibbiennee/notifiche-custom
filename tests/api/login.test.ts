import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE, GET, POST } from '@/app/api/login/route';
import { GET as listPresets } from '@/app/api/presets/route';
import { SESSION_COOKIE } from '@/lib/auth';
import { createMemoryStore, setStoreForTesting } from '@/lib/store';

beforeEach(() => {
  vi.stubEnv('APP_TOKEN', 'segreto');
  setStoreForTesting(createMemoryStore());
});

afterEach(() => {
  setStoreForTesting(null);
  vi.unstubAllEnvs();
});

const login = (token: unknown, url = 'https://x.test/api/login/') =>
  POST(new Request(url, { method: 'POST', body: JSON.stringify({ token }) }));

describe('POST /api/login/', () => {
  it('col token giusto imposta un cookie di sessione durevole', async () => {
    const res = await login('segreto');
    expect(res.status).toBe(200);

    const cookie = res.headers.get('set-cookie')!;
    expect(cookie).toContain(`${SESSION_COOKIE}=segreto`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain(`Max-Age=${365 * 24 * 60 * 60}`);
  });

  it('marca il cookie Secure su https', async () => {
    expect((await login('segreto')).headers.get('set-cookie')).toContain('Secure');
  });

  it('non marca Secure su http, altrimenti il browser lo scarterebbe in locale', async () => {
    const res = await login('segreto', 'http://localhost:3000/api/login/');
    expect(res.headers.get('set-cookie')).not.toContain('Secure');
  });

  it('rifiuta un token sbagliato senza impostare cookie', async () => {
    const res = await login('altro00');
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('rifiuta un body malformato', async () => {
    expect((await login(12345)).status).toBe(401);
  });
});

describe('GET /api/login/', () => {
  it('riconosce una sessione valida dal cookie', async () => {
    const res = await GET(
      new Request('https://x.test/api/login/', {
        headers: { cookie: `${SESSION_COOKIE}=segreto` },
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).authenticated).toBe(true);
  });

  it('risponde 401 senza cookie', async () => {
    const res = await GET(new Request('https://x.test/api/login/'));
    expect(res.status).toBe(401);
    expect((await res.json()).authenticated).toBe(false);
  });
});

describe('DELETE /api/login/', () => {
  it('scade il cookie', async () => {
    const res = await DELETE(new Request('https://x.test/api/login/', { method: 'DELETE' }));
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});

describe('il cookie autentica le altre API', () => {
  it('accetta una richiesta col solo cookie, senza header Authorization', async () => {
    const res = await listPresets(
      new Request('https://x.test/api/presets/', {
        headers: { cookie: `qualcosa=altro; ${SESSION_COOKIE}=segreto; ancora=x` },
      }),
    );
    expect(res.status).toBe(200);
  });

  it('rifiuta un cookie con valore sbagliato', async () => {
    const res = await listPresets(
      new Request('https://x.test/api/presets/', {
        headers: { cookie: `${SESSION_COOKIE}=sbagliato` },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("continua ad accettare l'header Bearer usato dagli script", async () => {
    const res = await listPresets(
      new Request('https://x.test/api/presets/', {
        headers: { authorization: 'Bearer segreto' },
      }),
    );
    expect(res.status).toBe(200);
  });
});
