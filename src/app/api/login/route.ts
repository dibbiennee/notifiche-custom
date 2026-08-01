import {
  SESSION_COOKIE,
  UnauthorizedError,
  assertAuthorized,
  errorResponse,
  tokenMatches,
} from '@/lib/auth';

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/** Dice al client se la sessione corrente è già valida, senza esporre nulla. */
export async function GET(request: Request): Promise<Response> {
  try {
    assertAuthorized(request);
    return Response.json({ authenticated: true });
  } catch {
    return Response.json({ authenticated: false }, { status: 401 });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const { token } = (await request.json()) as { token?: unknown };
    if (typeof token !== 'string' || !tokenMatches(token)) {
      throw new UnauthorizedError();
    }

    // Secure solo su https: in locale il browser scarterebbe il cookie.
    const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';

    const response = Response.json({ ok: true });
    response.headers.set(
      'Set-Cookie',
      `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; HttpOnly${secure}; SameSite=Lax`,
    );
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

/** Logout: azzera il cookie. */
export async function DELETE(request: Request): Promise<Response> {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  const response = Response.json({ ok: true });
  response.headers.set(
    'Set-Cookie',
    `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly${secure}; SameSite=Lax`,
  );
  return response;
}
