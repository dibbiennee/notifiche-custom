import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cancelMessage,
  deliverCallbackUrl,
  publishDelayed,
  setQstashClientForTesting,
} from '@/lib/qstash';

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
