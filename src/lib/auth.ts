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

function equals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function assertAuthorized(request: Request): void {
  const expected = process.env.APP_TOKEN;
  if (!expected) {
    throw new Error('APP_TOKEN non è configurato sul server');
  }

  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';

  if (!equals(token, expected)) {
    throw new UnauthorizedError();
  }
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
