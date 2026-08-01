import { BadRequestError, NotFoundError, assertAuthorized, errorResponse } from '@/lib/auth';
import { getStore } from '@/lib/store';
import type { SubscriptionRecord } from '@/lib/store';

type Body = {
  slug?: unknown;
  subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
};

function readSubscription(body: Body, ua: string): SubscriptionRecord {
  const endpoint = body.subscription?.endpoint;
  const p256dh = body.subscription?.keys?.p256dh;
  const auth = body.subscription?.keys?.auth;

  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://')) {
    throw new BadRequestError('Endpoint della subscription non valido');
  }
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || !p256dh || !auth) {
    throw new BadRequestError('Chiavi della subscription mancanti');
  }

  return { endpoint, keys: { p256dh, auth }, ua, createdAt: Date.now() };
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertAuthorized(request);
    const body = (await request.json()) as Body;

    if (typeof body.slug !== 'string' || !body.slug) {
      throw new BadRequestError('Parametro slug mancante');
    }

    const store = getStore();
    if (!(await store.getPreset(body.slug))) {
      throw new NotFoundError('Preset non trovato');
    }

    const ua = request.headers.get('user-agent') ?? 'sconosciuto';
    await store.addSubscription(body.slug, readSubscription(body, ua));

    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
