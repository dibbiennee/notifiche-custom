import { BadRequestError, NotFoundError, assertAuthorized, errorResponse } from '@/lib/auth';
import { cancelMessage } from '@/lib/qstash';
import { getStore } from '@/lib/store';

export async function GET(request: Request): Promise<Response> {
  try {
    assertAuthorized(request);
    const scheduled = await getStore().listScheduled();
    return Response.json({ scheduled });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    assertAuthorized(request);
    const id = new URL(request.url).searchParams.get('id');
    if (!id) throw new BadRequestError('Parametro id mancante');

    const store = getStore();
    const record = await store.getScheduled(id);
    if (!record) throw new NotFoundError('Invio programmato non trovato');

    // Prima QStash, poi il record: un 404 da QStash non è un errore.
    await cancelMessage(record.messageId);
    await store.removeScheduled(id);

    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
