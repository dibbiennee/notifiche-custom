import webpush from 'web-push';
import type { Store, SubscriptionRecord } from './store';

export type NotificationPayload = {
  title: string;
  body: string;
  icon: string;
  tag: string;
  url: string;
};

export function buildPayload(
  slug: string,
  title: string,
  body: string,
  now: number,
): NotificationPayload {
  return {
    title,
    body,
    icon: `/api/icon/${slug}/192/`,
    tag: `${slug}-${now}`,
    url: `/p/${slug}/`,
  };
}

export class PushGoneError extends Error {
  constructor(public readonly statusCode: number) {
    super(`Il push service ha risposto ${statusCode}`);
    this.name = 'PushGoneError';
  }
}

export type Sender = (sub: SubscriptionRecord, payload: string) => Promise<void>;

let vapidConfigured = false;

function configureVapid(): void {
  if (vapidConfigured) return;
  const { VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  if (!VAPID_SUBJECT || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    throw new Error('Chiavi VAPID non configurate sul server');
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidConfigured = true;
}

export const webPushSender: Sender = async (sub, payload) => {
  configureVapid();
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload, {
      TTL: 60 * 60,
    });
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (typeof statusCode === 'number') throw new PushGoneError(statusCode);
    throw error;
  }
};

/**
 * Manda la notifica a tutte le subscription del preset.
 * Le subscription che il push service dichiara morte (404/410) vengono rimosse.
 */
export async function deliver(
  store: Store,
  slug: string,
  payload: NotificationPayload,
  send: Sender = webPushSender,
): Promise<{ sent: number; removed: number }> {
  const subs = await store.listSubscriptions(slug);
  const serialized = JSON.stringify(payload);

  let sent = 0;
  let removed = 0;

  for (const sub of subs) {
    try {
      await send(sub, serialized);
      sent += 1;
    } catch (error) {
      const statusCode = error instanceof PushGoneError ? error.statusCode : 0;
      if (statusCode === 404 || statusCode === 410) {
        await store.removeSubscription(slug, sub.endpoint);
        removed += 1;
      } else {
        console.error(`Invio fallito verso ${sub.endpoint}`, error);
      }
    }
  }

  return { sent, removed };
}
