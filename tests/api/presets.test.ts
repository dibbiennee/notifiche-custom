import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE, GET, POST } from '@/app/api/presets/route';
import { createMemoryStore, setStoreForTesting } from '@/lib/store';
import type { Store } from '@/lib/store';

let store: Store;

beforeEach(() => {
  vi.stubEnv('APP_TOKEN', 'segreto');
  store = createMemoryStore();
  setStoreForTesting(store);
});

afterEach(() => {
  setStoreForTesting(null);
  vi.unstubAllEnvs();
});

const authed = (body?: unknown, method = 'POST') =>
  new Request('https://x.test/api/presets/', {
    method,
    headers: { authorization: 'Bearer segreto', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const validBody = {
  name: 'Test A',
  defaultBody: 'Corpo',
  icons: { '192': 'aaa', '512': 'bbb' },
};

describe('POST /api/presets/', () => {
  it('crea il preset e ne deriva lo slug', async () => {
    const res = await POST(authed(validBody));
    expect(res.status).toBe(201);
    const { preset } = await res.json();
    expect(preset.slug).toBe('test-a');
    expect(preset.name).toBe('Test A');
    expect(await store.getIcon('test-a', 512)).toBe('bbb');
  });

  it('risponde 409 su slug duplicato', async () => {
    await POST(authed(validBody));
    const res = await POST(authed(validBody));
    expect(res.status).toBe(409);
  });

  it('risponde 401 senza token', async () => {
    const res = await POST(
      new Request('https://x.test/api/presets/', {
        method: 'POST',
        body: JSON.stringify(validBody),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('risponde 400 se manca il nome o le icone', async () => {
    expect((await POST(authed({ ...validBody, name: '' }))).status).toBe(400);
    expect((await POST(authed({ ...validBody, icons: { '192': 'aaa' } }))).status).toBe(400);
  });

  it('risponde 400 se il nome non produce uno slug', async () => {
    const res = await POST(authed({ ...validBody, name: '🎉' }));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/presets/', () => {
  it('elenca i preset creati', async () => {
    await POST(authed(validBody));
    const res = await GET(authed(undefined, 'GET'));
    expect(res.status).toBe(200);
    const { presets } = await res.json();
    expect(presets).toHaveLength(1);
  });
});

describe('DELETE /api/presets/', () => {
  it('elimina per slug', async () => {
    await POST(authed(validBody));
    const res = await DELETE(
      new Request('https://x.test/api/presets/?slug=test-a', {
        method: 'DELETE',
        headers: { authorization: 'Bearer segreto' },
      }),
    );
    expect(res.status).toBe(200);
    expect(await store.getPreset('test-a')).toBeNull();
  });

  it('risponde 400 senza slug', async () => {
    const res = await DELETE(authed(undefined, 'DELETE'));
    expect(res.status).toBe(400);
  });
});
