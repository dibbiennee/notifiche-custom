'use client';

/**
 * Il token non viene più tenuto in localStorage: iOS cancella periodicamente lo
 * storage scrivibile da JavaScript delle web app installate sulla Home, e la
 * schermata di accesso ricompariva da sola a ogni apertura. Ora l'accesso passa
 * da /api/login/, che imposta un cookie HttpOnly lato server — non toccato da
 * quella pulizia e nemmeno leggibile da JavaScript.
 *
 * Il cookie viaggia da solo con ogni fetch same-origin: qui non serve gestirlo.
 */

export async function login(token: string): Promise<void> {
  const response = await fetch('/api/login/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    throw new Error(response.status === 401 ? 'Token non valido' : `Errore ${response.status}`);
  }
}

export async function isAuthenticated(): Promise<boolean> {
  try {
    const response = await fetch('/api/login/');
    return response.ok;
  } catch {
    return false;
  }
}

export async function logout(): Promise<void> {
  await fetch('/api/login/', { method: 'DELETE' }).catch(() => {});
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...init.headers,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
  });

  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? `Errore ${response.status}`);
  }
  return data;
}
