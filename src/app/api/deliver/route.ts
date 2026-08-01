import { BadRequestError, errorResponse } from '@/lib/auth';
import { buildPayload, deliver, webPushSender } from '@/lib/push';
import { verifyQstashSignature } from '@/lib/qstash';
import { getStore } from '@/lib/store';

export const maxDuration = 60;

type Body = { id?: unknown; slug?: unknown; title?: unknown; body?: unknown };

// Non usa APP_TOKEN: chi chiama è QStash, e si autentica con la firma.
export async function POST(request: Request): Promise<Response> {
  try {
    const raw = await request.text();
    await verifyQstashSignature(request.headers.get('upstash-signature'), raw);

    const payload = JSON.parse(raw) as Body;
    if (
      typeof payload.id !== 'string' ||
      typeof payload.slug !== 'string' ||
      typeof payload.title !== 'string'
    ) {
      throw new BadRequestError('Payload di consegna malformato');
    }
    const body = typeof payload.body === 'string' ? payload.body : '';

    const store = getStore();
    const result = await deliver(
      store,
      payload.slug,
      buildPayload(payload.slug, payload.title, body, Date.now()),
      webPushSender,
    );

    await store.removeScheduled(payload.id);

    return Response.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
