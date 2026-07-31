# Notifiche push personalizzate — Design (Fase 1)

**Data:** 2026-07-31
**Stato:** approvato
**Scope:** Fase 1 — uso personale, singolo utente, deploy privato

---

## 1. Obiettivo

Una webapp che permette di far arrivare su iPhone una notifica push **con testo scelto al
momento** e **con il logo e il nome che decido io**, sia subito che dopo un ritardo
arbitrario (secondi, minuti, ore).

Uso previsto in fase 1: testare il comportamento delle push, promemoria personali,
materiale per screenshot e video.

**Fuori scope in fase 1:** multi-utente, login, template di brand preconfezionati,
supporto Android/desktop, cron ricorrenti.

---

## 2. Il vincolo che determina tutto il design

Su iOS le web push funzionano solo se il sito è installato sulla Home come PWA
(iOS 16.4+). E Safari **ignora i campi `icon` e `image` del payload della notifica**:
mostra sempre il nome e l'icona della PWA installata, congelati al momento
dell'installazione.

Conseguenza diretta: **nome e logo non sono personalizzabili per singolo invio.**
Sono una proprietà dell'installazione.

Da qui la separazione in due oggetti:

| Oggetto | Cosa contiene | Quando si decide |
|---|---|---|
| **Preset** | nome app + logo PNG (+ titolo/testo di default opzionali) | una volta, alla creazione; si installa sulla Home |
| **Invio** | titolo + testo + ritardo | ogni volta, libero |

Un preset si crea e si installa una volta. Ci si mandano dentro quanti invii si vuole.
Servono N loghi diversi → si installano N icone sulla Home.

---

## 3. Stack e servizi

- **Next.js 15** (App Router, TypeScript) su **Vercel**
- **`web-push`** per l'invio VAPID
- **Upstash Redis** — tutto lo stato (preset, icone, subscription, invii programmati)
- **Upstash QStash** — consegna ritardata per i delay oltre i 30 secondi

Un solo account esterno (Upstash) copre sia Redis che QStash. Nessun Vercel Blob:
le icone sono piccole e stanno in Redis come base64.

### Variabili d'ambiente

```
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_SUBJECT               # mailto:...
APP_TOKEN                   # token unico di accesso
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
QSTASH_TOKEN
QSTASH_CURRENT_SIGNING_KEY
QSTASH_NEXT_SIGNING_KEY
PUBLIC_BASE_URL             # usato per la callback QStash
```

### Setup iniziale (una tantum)

1. `npx web-push generate-vapid-keys` → riempie `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY`
2. `VAPID_SUBJECT` = un `mailto:` valido (richiesto dallo standard)
3. `APP_TOKEN` = stringa casuale, es. `openssl rand -hex 32`
4. Database Redis e coda QStash creati su Upstash, credenziali copiate su Vercel
5. `PUBLIC_BASE_URL` = l'URL di produzione Vercel

Le stesse variabili in `.env.local` per lo sviluppo locale, più un `.env.example`
committato nel repo (senza valori) che documenta cosa serve.

---

## 4. Modello dati (Redis)

```
presets                     SET di slug
preset:<slug>               JSON {slug, name, defaultTitle, defaultBody, createdAt}
icon:<slug>:192             stringa base64 (PNG)
icon:<slug>:512             stringa base64 (PNG)
subs:<slug>                 SET di subscription JSON {endpoint, keys:{p256dh,auth}, ua, createdAt}
sched:<id>                  JSON {id, slug, title, body, sendAt, messageId}
sched:index                 SORTED SET, score = sendAt (epoch ms), member = id
```

`subs:<slug>` è un set perché lo stesso preset può essere installato su più device
(iPhone + iPad). Un invio va a tutte le subscription del preset.

---

## 5. Struttura delle route

```
/                              admin: lista preset, crea preset, lista invii programmati
/p/[slug]/                     la PWA — la pagina che si aggiunge alla Home
/p/[slug]/manifest/            manifest generato al volo
/sw.js                         service worker unico, statico in public/

/api/presets/                  GET lista · POST crea · DELETE elimina
/api/icon/[slug]/[size]/       serve il PNG (cache lunga, immutable)
/api/subscribe/                POST registra la subscription del device
/api/send/                     POST {slug, title, body, delaySeconds}
/api/deliver/                  POST callback QStash (firmata) → invia la push
/api/scheduled/                GET lista programmati · DELETE annulla
```

### `trailingSlash: true` è obbligatorio

`next.config.ts` deve impostare `trailingSlash: true`, così l'URL canonico è
`/p/<slug>/`. Serve perché lo `start_url` del manifest deve stare **dentro** lo `scope`:
senza trailing slash, `start_url: "/p/test-a"` cadrebbe fuori da `scope: "/p/test-a/"`
e iOS rifiuterebbe l'installazione come PWA valida.

**Conseguenza da non dimenticare:** con questa opzione Next rimanda in `308` ogni URL
senza slash finale, API incluse. Quindi ogni fetch interna e l'URL di callback passato a
QStash devono già finire con `/` — es. `${PUBLIC_BASE_URL}/api/deliver/`.

### Un solo service worker, statico, con scope esplicito per preset

Il service worker è **un file statico in `public/sw.js`**, non una route per preset.
Due motivi:

- I file in `public/` non sono toccati da `trailingSlash`, quindi `/sw.js` non
  redirige. Fondamentale: la specifica Service Worker **rifiuta** uno script che
  risponde con un redirect, quindi una route dinamica sotto `/p/<slug>/` fallirebbe la
  registrazione.
- Lo scope non deve per forza derivare dalla posizione dello script: basta passarlo
  esplicito, e uno scope più *stretto* della cartella dello script è sempre permesso
  senza header aggiuntivi.

Quindi ogni PWA registra lo stesso script con scope proprio:

```js
navigator.serviceWorker.register('/sw.js', { scope: `/p/${slug}/` })
```

Ne risultano registrazioni, e quindi push subscription, isolate per preset — che è
esattamente il comportamento voluto quando se ne installano più di uno.

### La chiave VAPID pubblica arriva al client dal server

`/p/[slug]/` è un server component che legge `VAPID_PUBLIC_KEY` e la passa come prop al
componente client. Così non serve una variabile `NEXT_PUBLIC_*` duplicata.

### Manifest generato

```json
{
  "name": "Test A",
  "short_name": "Test A",
  "start_url": "/p/test-a/",
  "scope": "/p/test-a/",
  "display": "standalone",
  "background_color": "#000000",
  "theme_color": "#000000",
  "icons": [
    { "src": "/api/icon/test-a/192", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/api/icon/test-a/512", "sizes": "512x512", "type": "image/png", "purpose": "any" }
  ]
}
```

`display: standalone` è obbligatorio: senza, iOS non abilita le push.

---

## 6. Il ritardo

### UI

Campo numerico + selettore unità (**secondi / minuti / ore**), più chip rapidi:
`Subito · 5s · 10s · 30s · 1m · 5m · 30m · 1h`.

Tutto normalizzato in `delaySeconds` prima di partire.

### Routing dell'invio

| Condizione | Come viene consegnato |
|---|---|
| `delaySeconds <= 30` | La function attende inline e poi invia. Nessuna dipendenza esterna. |
| `delaySeconds > 30` | Pubblicato su QStash con header `Upstash-Delay`; QStash richiama `/api/deliver` al momento giusto. |

**Limite massimo: 7 giorni** (limite di QStash). Valori oltre → errore di validazione.

La soglia dei 30s tiene i casi frequenti (il ritardo serve soprattutto per fare in tempo
a bloccare lo schermo) fuori da qualsiasi dipendenza esterna, e resta ben dentro il
`maxDuration` della function.

### Perché non un `setTimeout` nel browser

Su iOS il JavaScript di una PWA in background viene sospeso quasi subito. Un timer
client-side non farebbe mai partire l'invio — cioè fallirebbe esattamente nel caso d'uso
principale, che è "mando e blocco lo schermo".

### Invii programmati e annullamento

Solo il ramo QStash crea un record: gli invii inline (≤ 30s) non finiscono in
"Programmati", perché sono già arrivati prima che la schermata serva a qualcosa.

Ogni invio via QStash crea un record `sched:<id>` e una entry in `sched:index`.
La schermata "Programmati" li elenca ordinati per orario di consegna, con un bottone
**Annulla** che chiama `DELETE /api/scheduled?id=<id>`. Il server — mai il client, che
non deve vedere `QSTASH_TOKEN` — esegue:

1. `DELETE https://qstash.upstash.io/v2/messages/<messageId>`
2. rimozione di `sched:<id>` e della entry da `sched:index`

Se QStash risponde `404` (messaggio già consegnato o già cancellato) il record viene
comunque rimosso e l'operazione è considerata riuscita.

`/api/deliver` rimuove il record da sé dopo una consegna riuscita.

---

## 7. Flusso utente

1. **Crea preset** — da qualsiasi browser: apri `/`, inserisci il nome (es. "Test A"),
   carichi un PNG, scegli il colore di sfondo. L'app genera lo slug e mostra il link.
2. **Installa** — su iPhone apri `/p/test-a` **in Safari** → Condividi → *Aggiungi alla
   schermata Home*. Nasce l'icona "Test A" con quel logo.
3. **Attiva** — apri l'icona (parte in standalone) → bottone *Attiva notifiche* → iOS
   chiede il permesso → la subscription viene salvata su `subs:test-a`.
4. **Invia** — titolo, testo, ritardo, Invia. La notifica arriva con header **Test A**,
   il logo scelto, e il testo del momento.

### Invio da un altro dispositivo

Le subscription stanno sul server, non solo sul telefono. Quindi `/p/test-a` aperto dal
Mac può far partire la notifica sull'iPhone **mentre è già bloccato** — che per testare
le push è più comodo e aggira del tutto il problema del banner soppresso.

---

## 8. Sicurezza

Un `APP_TOKEN` unico in env var. Inserito una volta nella UI, salvato in `localStorage`,
inviato come header `Authorization: Bearer <token>` su ogni chiamata a
`/api/presets`, `/api/subscribe`, `/api/send`, `/api/scheduled`.

Senza, l'endpoint di invio sarebbe un relay push aperto a chiunque scopra l'URL.

`/api/deliver` non usa il token: è chiamato da QStash e si autentica verificando la firma
`Upstash-Signature` contro `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY`.
Firma non valida → `401`.

---

## 9. Elaborazione dell'icona

Fatta lato client con canvas prima dell'upload:

1. crop centrale a quadrato
2. composito su un colore di sfondo scelto dall'utente (default bianco) — **la
   trasparenza sulla Home di iOS diventa nera**, quindi va appiattita
3. resize a 512×512 e 192×192
4. export PNG → base64 → POST

Validazione: solo `image/png` e `image/jpeg`, max 5 MB in ingresso.

---

## 10. Gestione errori

| Caso | Comportamento |
|---|---|
| Pagina aperta in Safari, non dalla Home | Schermata che spiega il percorso Condividi → Aggiungi alla Home. Nessun bottone di invio. |
| iOS < 16.4 o browser senza `PushManager` | Messaggio esplicito di incompatibilità |
| Permesso notifiche negato | Istruzioni per riattivarlo da Impostazioni iOS |
| Push endpoint morto (`404`/`410` da APNs) | Subscription rimossa da `subs:<slug>` in automatico |
| Nessuna subscription per il preset | Errore chiaro: "nessun device registrato, apri la PWA dalla Home e attiva le notifiche" |
| `publish` su QStash fallito | Errore all'utente, nessun record `sched:` creato |
| Firma QStash non valida | `401`, nessun invio |
| Token app errato o assente | `401` |
| Slug già esistente | `409` con messaggio |
| Immagine non valida o troppo grande | Bloccata lato client con messaggio |
| `delaySeconds` fuori range (< 0 o > 7 giorni) | `400` con messaggio |

---

## 11. Test

**Unit (Vitest)**
- `slugify` — accenti, spazi, duplicati, caratteri non ASCII
- parsing e normalizzazione del ritardo — le tre unità, i limiti, i valori non validi
- routing sleep-vs-QStash attorno alla soglia dei 30s (29, 30, 31)
- costruzione del payload di notifica
- costruzione del manifest

**Integration (Vitest, client Redis finto iniettato)**
- CRUD dei preset, incluso slug duplicato
- subscribe / rimozione su `410`
- `/api/send` in entrambi i rami
- `/api/deliver` con firma valida e con firma non valida
- annullamento di un programmato

**E2E (Playwright, desktop)**
- crea preset → compare in lista → elimina
- `/p/[slug]` fuori standalone mostra le istruzioni e non il composer
- lista programmati e annullamento

**Manuale su iPhone** — non automatizzabile:
- aggiunta alla Home, nome e icona corretti
- richiesta permesso e attivazione
- invio immediato, ritardo 10s con schermo bloccato, ritardo 5 minuti
- annullamento di un programmato prima che parta
- due preset installati insieme restano indipendenti

---

## 12. Fase 2 (non ora)

Supporto Android/desktop con logo per-notifica reale, multi-utente con login,
programmazione ricorrente, esposizione come tool pubblico su GitHub con guida al
deploy self-hosted.
