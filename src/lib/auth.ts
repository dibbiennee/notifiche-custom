import { timingSafeEqual } from 'node:crypto';
import { PresetExistsError } from './store';

export class UnauthorizedError extends Error {
  constructor() {
    super('Token non valido');
    this.name = 'UnauthorizedError';
  }
}

export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/** Nome del cookie di sessione, impostato dal server e non leggibile da JavaScript. */
export const SESSION_COOKIE = 'notifiche_session';

function equals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Confronta un valore col token configurato, a tempo costante. */
export function tokenMatches(candidate: string): boolean {
  const expected = process.env.APP_TOKEN;
  if (!expected) {
    throw new Error('APP_TOKEN non è configurato sul server');
  }
  return equals(candidate, expected);
}

function readCookie(request: Request, name: string): string {
  const header = request.headers.get('cookie');
  if (!header) return '';

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return '';
}

/**
 * Accetta due forme di autenticazione:
 * - `Authorization: Bearer <token>`, usata dagli script e dai test
 * - il cookie di sessione, usato dal browser
 *
 * Il cookie esiste perché iOS cancella periodicamente lo storage scrivibile da
 * JavaScript delle web app installate: con il token in localStorage la schermata
 * di accesso ricompariva da sola. Un cookie impostato dal server con Set-Cookie
 * non è soggetto a quella pulizia.
 */
export function assertAuthorized(request: Request): void {
  const header = request.headers.get('authorization') ?? '';
  const bearer = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';

  if (tokenMatches(bearer)) return;
  if (tokenMatches(readCookie(request, SESSION_COOKIE))) return;

  throw new UnauthorizedError();
}

/** Traduce gli errori noti in risposte HTTP. Tutto il resto diventa 500. */
export function errorResponse(error: unknown): Response {
  if (error instanceof UnauthorizedError) {
    return Response.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof PresetExistsError) {
    return Response.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof NotFoundError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof BadRequestError || error instanceof RangeError) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
  console.error(error);
  return Response.json({ error: 'Errore interno' }, { status: 500 });
}
