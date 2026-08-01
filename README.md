# Notifiche personalizzate

PWA per iPhone che manda una push con testo scelto al momento, sotto un nome e un
logo scelti da te. Subito o dopo un ritardo, da secondi a giorni.

## Come funziona

Un **preset** è nome + logo. Diventa un'icona sulla Home di iOS. Il **testo** invece
è libero a ogni invio.

Sono separati per un motivo tecnico: Safari ignora i campi `icon` e `image` del payload
e mostra sempre nome e icona della PWA installata. Servono N loghi diversi → si
installano N icone.

## Setup

1. `npm install`
2. Copiare `.env.example` in `.env.local` e compilarlo:
   - `npx web-push generate-vapid-keys` per le chiavi VAPID
   - `openssl rand -hex 32` per `APP_TOKEN`
   - credenziali Redis e QStash da console.upstash.com
3. `npm run dev`

## Deploy su Vercel

```bash
npx vercel
npx vercel --prod
```

Impostare tutte le variabili di `.env.example` nel progetto Vercel.
`PUBLIC_BASE_URL` va messo **dopo** il primo deploy, con l'URL definitivo e senza
slash finale.

## Uso

1. Su `/` inserisci il token, crei un preset con nome e logo.
2. Apri `/p/<slug>/` **su iPhone, in Safari** → Condividi → Aggiungi alla schermata Home.
3. Apri l'icona, tocca *Attiva notifiche*, concedi il permesso.
4. Scrivi titolo e testo, scegli il ritardo, invia.

## Limiti noti

- Serve iOS 16.4+ e l'installazione sulla Home: le web push non funzionano in Safari.
- Nome e logo sono fissati all'installazione, non cambiano per singola notifica.
- Con l'app in primo piano iOS non mostra il banner: usa un ritardo e blocca lo schermo,
  oppure fai partire l'invio da un altro dispositivo.
- Ritardo massimo 7 giorni, limite di QStash.

## Architettura in breve

| Pezzo | Dove |
|---|---|
| Preset, icone, subscription, programmati | Upstash Redis |
| Ritardi ≤ 30s | `after()` di Next: risposta immediata, consegna dopo |
| Ritardi > 30s | QStash, che richiama `/api/deliver/` |
| Service worker | `public/sw.js`, registrato con scope `/p/<slug>/` |

Dettagli e motivazioni in `docs/superpowers/specs/`.

## Verifica delle credenziali

Controlla che Redis, QStash e le chiavi VAPID rispondano davvero. Non stampa mai
un valore, solo l'esito:

```bash
npm run check
```

## Test

```bash
npm test
```

Gli E2E richiedono `.env.local` compilato (si auto-skippano senza `APP_TOKEN`):

```bash
npx playwright install chromium
npm run test:e2e
```

Il flusso push su iOS non è automatizzabile: la verifica è manuale, vedi
`docs/checklist-iphone.md`.
