'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, isAuthenticated, login } from '@/lib/client';
import { processIcon } from '@/lib/image';
import type { Preset } from '@/lib/types';

export default function AdminApp() {
  const [ready, setReady] = useState(false);
  const [tokenReady, setTokenReady] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [presets, setPresets] = useState<Preset[]>([]);
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [background, setBackground] = useState('#ffffff');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ presets: Preset[] }>('/api/presets/');
      setPresets(data.presets);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      if (await isAuthenticated()) {
        setTokenReady(true);
        await load();
      }
      setReady(true);
    })();
  }, [load]);

  const saveToken = async () => {
    setBusy(true);
    setError('');
    try {
      await login(tokenInput.trim());
      setTokenReady(true);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!file) {
      setError('Serve un logo');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const icons = await processIcon(file, background);
      await apiFetch('/api/presets/', {
        method: 'POST',
        body: JSON.stringify({ name, icons: { '192': icons[192], '512': icons[512] } }),
      });
      setName('');
      setFile(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (slug: string) => {
    if (!confirm(`Eliminare il preset "${slug}"?`)) return;
    try {
      await apiFetch(`/api/presets/?slug=${encodeURIComponent(slug)}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // Evita che la schermata di accesso lampeggi mentre il controllo è in corso.
  if (!ready) return <main />;

  if (!tokenReady) {
    return (
      <main>
        <h1>Accesso</h1>
        <div className="field">
          <label htmlFor="token">Token</label>
          <input
            id="token"
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
          />
        </div>
        <button onClick={saveToken} disabled={busy || !tokenInput.trim()}>
          {busy ? 'Verifica…' : 'Entra'}
        </button>
        {error && <p className="error">{error}</p>}
      </main>
    );
  }

  return (
    <main>
      <h1>Preset</h1>

      {presets.length === 0 && <p className="muted">Nessun preset. Creane uno qui sotto.</p>}

      {presets.map((preset) => (
        <div className="card" key={preset.slug}>
          <div className="row" style={{ alignItems: 'center', marginBottom: '0.75rem' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/icon/${preset.slug}/192/`}
              alt=""
              width={44}
              height={44}
              style={{ borderRadius: '0.6rem' }}
            />
            <div>
              <strong>{preset.name}</strong>
              <div className="muted">/p/{preset.slug}/</div>
            </div>
          </div>
          <div className="row">
            <a href={`/p/${preset.slug}/`} style={{ flex: 1 }}>
              <button className="secondary">Apri</button>
            </a>
            <button className="danger" onClick={() => remove(preset.slug)} style={{ width: 'auto' }}>
              Elimina
            </button>
          </div>
        </div>
      ))}

      <h2>Nuovo preset</h2>

      <div className="field">
        <label htmlFor="name">Nome — è quello che iOS mostra sopra la notifica</label>
        <input id="name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="logo">Logo — PNG o JPEG, max 5 MB, ritagliato al centro in quadrato</label>
        <input
          id="logo"
          type="file"
          accept="image/png,image/jpeg"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <div className="field">
        <label htmlFor="bg">Sfondo — la trasparenza sulla Home di iOS diventa nera</label>
        <input
          id="bg"
          type="color"
          value={background}
          onChange={(e) => setBackground(e.target.value)}
        />
      </div>

      <button onClick={create} disabled={busy || !name.trim() || !file}>
        {busy ? 'Creazione…' : 'Crea preset'}
      </button>

      {error && <p className="error">{error}</p>}

      <h2>Come si installa</h2>
      <ol className="muted">
        <li>Apri il link del preset su iPhone, in Safari.</li>
        <li>Condividi → Aggiungi alla schermata Home.</li>
        <li>Apri l&apos;icona appena creata e attiva le notifiche.</li>
      </ol>
    </main>
  );
}
