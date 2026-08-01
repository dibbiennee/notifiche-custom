'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, isAuthenticated, login } from '@/lib/client';
import type { Preset, ScheduledSend } from '@/lib/types';

type Props = { preset: Preset; vapidPublicKey: string };

type Unit = 'seconds' | 'minutes' | 'hours';

const QUICK: Array<{ label: string; value: number; unit: Unit }> = [
  { label: 'Subito', value: 0, unit: 'seconds' },
  { label: '5s', value: 5, unit: 'seconds' },
  { label: '10s', value: 10, unit: 'seconds' },
  { label: '30s', value: 30, unit: 'seconds' },
  { label: '1m', value: 1, unit: 'minutes' },
  { label: '5m', value: 5, unit: 'minutes' },
  { label: '30m', value: 30, unit: 'minutes' },
  { label: '1h', value: 1, unit: 'hours' },
];

const MULTIPLIERS: Record<Unit, number> = { seconds: 1, minutes: 60, hours: 3600 };

/**
 * La chiave VAPID viaggia in base64url; pushManager.subscribe vuole i byte grezzi.
 * Il tipo di ritorno è esplicitamente `Uint8Array<ArrayBuffer>`: da TS 5.7 i typed
 * array sono generici sul buffer, e `applicationServerKey` non accetta la variante
 * che potrebbe essere uno SharedArrayBuffer.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);

  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export default function PresetApp({ preset, vapidPublicKey }: Props) {
  const [ready, setReady] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [supported, setSupported] = useState(true);
  const [tokenReady, setTokenReady] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const [title, setTitle] = useState(preset.defaultTitle);
  const [body, setBody] = useState(preset.defaultBody);
  const [value, setValue] = useState(10);
  const [unit, setUnit] = useState<Unit>('seconds');

  const [scheduled, setScheduled] = useState<ScheduledSend[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadScheduled = useCallback(async () => {
    try {
      const data = await apiFetch<{ scheduled: ScheduledSend[] }>('/api/scheduled/');
      setScheduled(data.scheduled.filter((s) => s.slug === preset.slug));
    } catch {
      // La lista è accessoria: un errore qui non deve bloccare l'invio.
    }
  }, [preset.slug]);

  useEffect(() => {
    setStandalone(isStandalone());
    setSupported('serviceWorker' in navigator && 'PushManager' in window);
    setSubscribed(typeof Notification !== 'undefined' && Notification.permission === 'granted');

    void (async () => {
      if (await isAuthenticated()) {
        setTokenReady(true);
        await loadScheduled();
      }
      setReady(true);
    })();
  }, [loadScheduled]);

  const saveToken = async () => {
    setBusy(true);
    setError('');
    try {
      await login(tokenInput.trim());
      setTokenReady(true);
      await loadScheduled();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // requestPermission deve stare dentro un handler di click: iOS la ignora altrimenti.
  const activate = async () => {
    setBusy(true);
    setError('');
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: `/p/${preset.slug}/`,
      });
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error(
          'Permesso negato. Riattivalo da Impostazioni → Notifiche, cerca il nome di questa app.',
        );
      }

      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        }));

      await apiFetch('/api/subscribe/', {
        method: 'POST',
        body: JSON.stringify({ slug: preset.slug, subscription: subscription.toJSON() }),
      });

      setSubscribed(true);
      setNotice('Notifiche attive su questo dispositivo.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const delaySeconds = value * MULTIPLIERS[unit];
      const result = await apiFetch<{ mode: string; sent?: number }>('/api/send/', {
        method: 'POST',
        body: JSON.stringify({ slug: preset.slug, title, body, delaySeconds }),
      });

      setNotice(
        result.mode === 'immediate'
          ? `Inviata a ${result.sent} dispositivo/i.`
          : `Programmata tra ${delaySeconds} secondi. Blocca lo schermo.`,
      );
      await loadScheduled();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: string) => {
    try {
      await apiFetch(`/api/scheduled/?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      await loadScheduled();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!ready) return <main />;

  // L'ordine di questi due controlli conta. Su iOS window.PushManager non esiste
  // finché la pagina non gira come app installata: controllando il supporto per
  // primo, Safari finirebbe sempre sul messaggio "browser non supportato" invece
  // che sulle istruzioni di installazione, che sono la cosa da fare davvero.
  if (!standalone) {
    return (
      <main>
        <h1>{preset.name}</h1>
        <p>Prima va aggiunta alla schermata Home, altrimenti iOS non permette le notifiche.</p>
        <ol>
          <li>
            Apri questa pagina in <strong>Safari</strong>.
          </li>
          <li>
            Tocca <strong>Condividi</strong>, l&apos;icona con la freccia in su.
          </li>
          <li>
            Scegli <strong>Aggiungi alla schermata Home</strong>.
          </li>
          <li>
            Apri l&apos;icona <strong>{preset.name}</strong> appena comparsa.
          </li>
        </ol>
        <p className="muted">
          Da computer questa schermata è normale: l&apos;invio funziona comunque dalla pagina admin.
        </p>
        <p className="muted">
          In Safari, prima dell&apos;installazione, le API push non esistono ancora: è previsto.
        </p>
      </main>
    );
  }

  // Qui siamo già in standalone: se le API mancano ancora, il sistema è davvero
  // troppo vecchio.
  if (!supported) {
    return (
      <main>
        <h1>{preset.name}</h1>
        <p>
          Questa app è installata sulla Home ma il sistema non espone le notifiche push. Su iPhone
          servono iOS 16.4 o successivo: controlla in Impostazioni → Generali → Info la versione, e
          aggiorna se è più vecchia.
        </p>
      </main>
    );
  }

  if (!tokenReady) {
    return (
      <main>
        <h1>{preset.name}</h1>
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
      <h1>{preset.name}</h1>

      {!subscribed && (
        <button onClick={activate} disabled={busy}>
          Attiva notifiche
        </button>
      )}

      {subscribed && (
        <>
          <div className="field">
            <label htmlFor="title">Titolo</label>
            <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="body">Testo</label>
            <textarea id="body" rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>

          <div className="field">
            <label>Ritardo</label>
            <div className="row" style={{ marginBottom: '0.5rem' }}>
              <input
                type="number"
                min={0}
                value={value}
                onChange={(e) => setValue(Math.max(0, Number(e.target.value)))}
              />
              <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
                <option value="seconds">secondi</option>
                <option value="minutes">minuti</option>
                <option value="hours">ore</option>
              </select>
            </div>
            <div className="chips">
              {QUICK.map((quick) => (
                <button
                  key={quick.label}
                  className="secondary"
                  onClick={() => {
                    setValue(quick.value);
                    setUnit(quick.unit);
                  }}
                >
                  {quick.label}
                </button>
              ))}
            </div>
          </div>

          <button onClick={send} disabled={busy || !title.trim()}>
            {busy ? 'Invio…' : 'Invia'}
          </button>

          <p className="muted" style={{ marginTop: '0.75rem' }}>
            Con l&apos;app in primo piano iOS non mostra il banner: dopo l&apos;invio blocca lo
            schermo.
          </p>
        </>
      )}

      {error && <p className="error">{error}</p>}
      {notice && <p className="ok">{notice}</p>}

      {scheduled.length > 0 && (
        <>
          <h2>Programmati</h2>
          {scheduled.map((item) => (
            <div className="card" key={item.id}>
              <strong>{item.title}</strong>
              <div className="muted">{new Date(item.sendAt).toLocaleString('it-IT')}</div>
              <button
                className="danger"
                onClick={() => cancel(item.id)}
                style={{ marginTop: '0.75rem' }}
              >
                Annulla
              </button>
            </div>
          ))}
        </>
      )}
    </main>
  );
}
