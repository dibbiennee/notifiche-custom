import { randomUUID } from 'node:crypto';
import { after } from 'next/server';
import { BadRequestError, NotFoundError, assertAuthorized, errorResponse } from '@/lib/auth';
import { MAX_DELAY_SECONDS, deliveryMode } from '@/lib/delay';
import { buildPayload, deliver, webPushSender } from '@/lib/push';
import { deliverCallbackUrl, publishDelayed } from '@/lib/qstash';
import { getStore } from '@/lib/store';

export const maxDuration = 60;

const MAX_TEXT_LENGTH = 500;

type Body = { slug?: unknown; body?: unknown; delaySeconds?: unknown };

function readText(value: unknown, field: string, { required }: { required: boolean }): string {
  if (typeof value !== 'string') {
    if (required) throw new BadRequestError(`Campo obbligatorio mancante: ${field}`);
    return '';
  }
  const trimmed = value.trim();
  if (required && !trimmed) throw new BadRequestError(`Campo obbligatorio mancante: ${field}`);
  if (trimmed.length > MAX_TEXT_LENGTH) {
    throw new BadRequestError(`Campo troppo lungo: ${field}`);
  }
  return trimmed;
}

function readDelay(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new BadRequestError(
      'Il ritardo deve essere un numero intero di secondi maggiore o uguale a zero',
    );
  }
  if (value > MAX_DELAY_SECONDS) {
    throw new BadRequestError('Il ritardo massimo è 7 giorni');
  }
  return value;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request: Request): Promise<Response> {
  try {
    assertAuthorized(request);
    const raw = (await request.json()) as Body;

    const slug = readText(raw.slug, 'slug', { required: true });
    const body = readText(raw.body, 'body', { required: true });
    const delaySeconds = readDelay(raw.delaySeconds);

    const store = getStore();
    if (!(await store.getPreset(slug))) throw new NotFoundError('Preset non trovato');

    const subs = await store.listSubscriptions(slug);
    if (subs.length === 0) {
      throw new BadRequestError(
        'Nessun device registrato per questo preset: apri la PWA dalla Home e attiva le notifiche',
      );
    }

    // Ramo immediato: consegniamo e riportiamo l'esito vero.
    // webPushSender va passato esplicito, non lasciato al valore di default di
    // deliver: solo così i test possono sostituirlo mockando il modulo.
    if (delaySeconds === 0) {
      const result = await deliver(store, slug, buildPayload(slug, body, Date.now()), webPushSender);
      return Response.json({ mode: 'immediate', ...result });
    }

    // Ramo inline: rispondiamo subito e consegniamo dopo la risposta, così la
    // consegna sopravvive anche se il telefono viene bloccato e la connessione cade.
    if (deliveryMode(delaySeconds) === 'inline') {
      after(async () => {
        await sleep(delaySeconds * 1000);
        await deliver(store, slug, buildPayload(slug, body, Date.now()), webPushSender);
      });
      return Response.json({ mode: 'inline', delaySeconds }, { status: 202 });
    }

    // Ramo QStash: il messaggio va pubblicato prima di salvare il record, così
    // un fallimento non lascia programmati fantasma.
    const id = randomUUID();
    const messageId = await publishDelayed({
      url: deliverCallbackUrl(),
      delaySeconds,
      body: { id, slug, body },
    });

    const sendAt = Date.now() + delaySeconds * 1000;
    await store.addScheduled({ id, slug, body, sendAt, messageId });

    return Response.json({ mode: 'scheduled', id, sendAt }, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
