import { Client, Receiver } from '@upstash/qstash';
import { UnauthorizedError } from './auth';

/** La parte di client QStash che usiamo, così i test possono sostituirla. */
export type QstashClient = {
  publishJSON: (params: {
    url: string;
    body: unknown;
    delay: string;
  }) => Promise<{ messageId: string }>;
  messages: { delete: (messageId: string) => Promise<unknown> };
};

let override: QstashClient | null = null;
let cached: QstashClient | null = null;

export function setQstashClientForTesting(client: QstashClient | null): void {
  override = client;
  if (client) cached = null;
}

function getClient(): QstashClient {
  if (override) return override;
  if (!cached) {
    const token = process.env.QSTASH_TOKEN;
    if (!token) throw new Error('QSTASH_TOKEN non è configurato sul server');
    cached = new Client({ token }) as unknown as QstashClient;
  }
  return cached;
}

/** URL che QStash richiamerà. Lo slash finale è obbligatorio: vedi trailingSlash. */
export function deliverCallbackUrl(): string {
  const base = process.env.PUBLIC_BASE_URL;
  if (!base) throw new Error('PUBLIC_BASE_URL non è configurato sul server');
  return `${base.replace(/\/+$/, '')}/api/deliver/`;
}

export async function publishDelayed(params: {
  url: string;
  delaySeconds: number;
  body: unknown;
}): Promise<string> {
  const result = await getClient().publishJSON({
    url: params.url,
    body: params.body,
    delay: `${params.delaySeconds}s`,
  });
  return result.messageId;
}

export async function cancelMessage(messageId: string): Promise<void> {
  try {
    await getClient().messages.delete(messageId);
  } catch (error) {
    // Già consegnato o già cancellato: per noi l'annullamento è comunque riuscito.
    if ((error as { status?: number }).status === 404) return;
    throw error;
  }
}

export async function verifyQstashSignature(
  signature: string | null,
  rawBody: string,
): Promise<void> {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentSigningKey || !nextSigningKey) {
    throw new Error('Chiavi di firma QStash non configurate sul server');
  }
  if (!signature) throw new UnauthorizedError();

  const receiver = new Receiver({ currentSigningKey, nextSigningKey });
  const valid = await receiver.verify({ signature, body: rawBody }).catch(() => false);
  if (!valid) throw new UnauthorizedError();
}
