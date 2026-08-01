import { randomUUID } from 'node:crypto';
import { after } from 'next/server';
import { hasAmountPlaceholder, normalizeAmount, renderBody } from '@/lib/amounts';
import { BadRequestError, NotFoundError, assertAuthorized, errorResponse } from '@/lib/auth';
import { MAX_DELAY_SECONDS, deliveryMode } from '@/lib/delay';
import { buildPayload, deliver, webPushSender } from '@/lib/push';
import { cancelMessage, deliverCallbackUrl, publishDelayed } from '@/lib/qstash';
import { computeOffsets, pickAmount } from '@/lib/series';
import type { Cadence, Limit } from '@/lib/series';
import { getStore } from '@/lib/store';

export const maxDuration = 60;

const MAX_TEXT_LENGTH = 500;

type Body = {
  slug?: unknown;
  body?: unknown;
  delaySeconds?: unknown;
  amounts?: unknown;
  series?: unknown;
};

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

function readAmounts(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new BadRequestError('Il campo amounts deve essere una lista');
  try {
    return value.map((item) => normalizeAmount(String(item)));
  } catch (error) {
    throw new BadRequestError((error as Error).message);
  }
}

/** Traduce in 400 i RangeError di computeOffsets, che sono errori dell'utente. */
function readOffsets(raw: unknown, startDelay: number): number[] {
  const series = raw as { limit?: Limit; cadence?: Cadence };
  if (!series.limit || !series.cadence) {
    throw new BadRequestError('La serie richiede limit e cadence');
  }
  try {
    return computeOffsets({ startDelay, limit: series.limit, cadence: series.cadence });
  } catch (error) {
    throw new BadRequestError((error as Error).message);
  }
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

    const amounts = readAmounts(raw.amounts);
    if (hasAmountPlaceholder(body) && amounts.length === 0) {
      throw new BadRequestError('Il testo contiene |importo| ma non è stato scelto nessun importo');
    }
    const testo = () => (amounts.length > 0 ? renderBody(body, pickAmount(amounts, Math.random)) : body);

    // Ramo serie: si calcola tutto prima, si pubblica su QStash prima di avviare
    // le consegne inline, e se una pubblicazione fallisce si annulla l'iniziato.
    if (raw.series !== undefined) {
      const offsets = readOffsets(raw.series, delaySeconds);
      const seriesId = randomUUID();
      const testi = offsets.map(() => testo());

      const pubblicate: Array<{ id: string; messageId: string }> = [];
      const inline: Array<{ offset: number; text: string }> = [];

      try {
        for (const [index, offset] of offsets.entries()) {
          if (deliveryMode(offset) === 'inline') {
            inline.push({ offset, text: testi[index]! });
            continue;
          }
          const id = randomUUID();
          const messageId = await publishDelayed({
            url: deliverCallbackUrl(),
            delaySeconds: offset,
            body: { id, slug, body: testi[index]! },
          });
          await store.addScheduled({
            id,
            slug,
            body: testi[index]!,
            sendAt: Date.now() + offset * 1000,
            messageId,
            seriesId,
            seriesIndex: index,
          });
          pubblicate.push({ id, messageId });
        }
      } catch (error) {
        for (const item of pubblicate) {
          await cancelMessage(item.messageId).catch(() => undefined);
          await store.removeScheduled(item.id).catch(() => undefined);
        }
        throw error;
      }

      if (inline.length > 0) {
        after(async () => {
          let atteso = 0;
          for (const item of inline) {
            await sleep((item.offset - atteso) * 1000);
            atteso = item.offset;
            await deliver(store, slug, buildPayload(slug, item.text, Date.now()), webPushSender);
          }
        });
      }

      return Response.json(
        {
          mode: 'series',
          seriesId,
          count: offsets.length,
          scheduled: pubblicate.length,
          inline: inline.length,
        },
        { status: 202 },
      );
    }

    // Ramo immediato: consegniamo e riportiamo l'esito vero.
    // webPushSender va passato esplicito, non lasciato al valore di default di
    // deliver: solo così i test possono sostituirlo mockando il modulo.
    if (delaySeconds === 0) {
      const result = await deliver(store, slug, buildPayload(slug, testo(), Date.now()), webPushSender);
      return Response.json({ mode: 'immediate', ...result });
    }

    // Ramo inline: rispondiamo subito e consegniamo dopo la risposta, così la
    // consegna sopravvive anche se il telefono viene bloccato e la connessione cade.
    if (deliveryMode(delaySeconds) === 'inline') {
      const singolo = testo();
      after(async () => {
        await sleep(delaySeconds * 1000);
        await deliver(store, slug, buildPayload(slug, singolo, Date.now()), webPushSender);
      });
      return Response.json({ mode: 'inline', delaySeconds }, { status: 202 });
    }

    // Ramo QStash: il messaggio va pubblicato prima di salvare il record, così
    // un fallimento non lascia programmati fantasma.
    const id = randomUUID();
    const singolo = testo();
    const messageId = await publishDelayed({
      url: deliverCallbackUrl(),
      delaySeconds,
      body: { id, slug, body: singolo },
    });

    const sendAt = Date.now() + delaySeconds * 1000;
    await store.addScheduled({ id, slug, body: singolo, sendAt, messageId });

    return Response.json({ mode: 'scheduled', id, sendAt }, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
