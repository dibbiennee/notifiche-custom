# Notifiche personalizzate

PWA per iPhone che manda una push con testo scelto al momento, sotto un nome e un
logo scelti da te. Subito o dopo un ritardo, da secondi a giorni.

Accanto c'è un'**app iOS nativa** con la stessa funzione senza la riga "from
Stripe", e una **dashboard** che ricopia quella di Stripe, sul telefono e su
`/dashboard` nel browser, sugli stessi dati. Vedi [App iOS](#app-ios).

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

In produzione: **https://notifiche-custom.vercel.app**

L'ordine dei passi è vincolato:

1. `npx vercel link` e `npx vercel --prod` → primo deploy, per ottenere l'URL
2. Caricare le variabili: `printf '%s' "$VALORE" | npx vercel env add NOME production`
3. `PUBLIC_BASE_URL` = l'URL stabile ottenuto al punto 1, **senza slash finale**
4. `npx vercel --prod` di nuovo, perché al punto 1 quella variabile non esisteva

Senza il secondo deploy i ritardi oltre i 30 secondi non partono: QStash non
saprebbe quale URL richiamare.

### Vercel Authentication va disattivata

Un progetto nuovo nasce con la protezione SSO attiva su tutti gli URL
`.vercel.app`. Con quella accesa la home redirige al login di Vercel e
`/api/deliver/` risponde `401` prima ancora di raggiungere l'app: l'iPhone non
può installare la PWA e QStash non può consegnare niente.

```bash
npx vercel project protection disable notifiche-custom --sso
```

L'app resta comunque protetta da `APP_TOKEN` su tutte le API.

## Uso

1. Su `/` inserisci il token, crei un preset con nome e logo.
2. Apri `/p/<slug>/` **su iPhone, in Safari** → Condividi → Aggiungi alla schermata Home.
3. Apri l'icona, tocca *Attiva notifiche*, concedi il permesso.
4. Scrivi titolo e testo, scegli il ritardo, invia.

## App iOS

Nella cartella `ios-app/` c'è un'app nativa che fa due cose: programma le stesse
notifiche senza passare dal server, e mostra una dashboard che ricopia la home
dell'app Stripe.

Le notifiche native sono **locali**: le programma iOS, non arrivano da internet.
È il motivo per cui esiste — le web push della PWA aggiungono da sole la riga
"from Stripe" sotto il titolo, e non c'è modo di toglierla.

La dashboard non ha campi sciolti da riempire: si imposta **quanto si incassa al
giorno e con quali importi**, e da lì vengono calcolati incassi giornalieri,
totali dei due periodi, grafici, pagamenti, clienti e netto. Due cifre che si
contraddicono non sono rappresentabili.

Colori, dimensioni e spaziature non sono scelti a occhio: sono campionati dagli
screenshot dell'app originale in `screenshot-dashboard/` e convertiti da Display
P3 a sRGB.

### Sincronizzazione col browser

Le impostazioni stanno su Redis, **una riga sola** letta sia dall'app che dalla
pagina `/dashboard`. Non c'è niente da sincronizzare perché non ci sono due
copie: chi salva per ultimo vince.

Si configura una volta da `Edit → Sincronizzazione`, mettendo l'indirizzo del
server e l'`APP_TOKEN`. Senza configurarla, l'app funziona lo stesso: resta tutto
sul telefono.

⚠️ **Due persone con lo stesso token condividono la stessa simulazione.** Se un
secondo dispositivo configura la sincronizzazione, cambiare i valori da una parte
li cambia anche dall'altra. Per usarla in più persone in modo indipendente,
lasciare la sincronizzazione vuota, oppure separare i dati per utente sul server
(oggi non è previsto).

`src/lib/simulation.ts` e `ios-app/Stripe/Simulation.swift` non sono due
implementazioni equivalenti: devono produrre le **identiche** cifre, perché
leggono le stesse impostazioni. Per questo il generatore è SplitMix64 e non
`Math.random`, e l'ordine delle operazioni ricalca riga per riga. **Se si tocca
l'algoritmo da una parte, va toccato anche dall'altra.** Il seme resta sotto
2^53, altrimenti JSON lo arrotonda e i due lati divergono.

### Installarla su un altro iPhone

Non passa dall'App Store: si compila e si installa via cavo. Serve un Mac con
Xcode, un Apple ID e il cavo.

1. Scaricare il repository e aprire `ios-app/Stripe.xcodeproj`
2. Collegare l'iPhone e sceglierlo come destinazione, in alto
3. In **Signing & Capabilities** scegliere il proprio **Team**: quello salvato nel
   progetto appartiene a un altro account e non funziona
4. Cambiare il **Bundle Identifier**, per esempio da `com.edoardo.stripe-notifier`
   a `com.tuonome.stripe-notifier`: quello attuale è già registrato altrove e la
   firma fallisce
5. Premere Play

Al primo avvio iOS chiede di autorizzare lo sviluppatore: *Impostazioni →
Generali → VPN e gestione dispositivo → Fidati*.

**Con un Apple ID gratuito il profilo scade dopo 7 giorni**: l'icona resta ma
l'app non si apre più, e va ricollegato il telefono e ripremuto Play. Con un
account Apple Developer a pagamento dura un anno.

Dal terminale, senza aprire Xcode, sono due comandi — sostituendo l'identificativo
del dispositivo, che si legge con `xcrun devicectl list devices`:

```bash
cd ios-app && xcodebuild -project Stripe.xcodeproj -scheme Stripe -configuration Debug \
  -destination 'id=IDENTIFICATIVO' -derivedDataPath ./dd -allowProvisioningUpdates build
```

```bash
xcrun devicectl device install app --device IDENTIFICATIVO ./dd/Build/Products/Debug-iphoneos/Stripe.app
```

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

## Test di fumo sulla produzione

Verifica il giro completo su un'istanza deployata — preset, manifest, icone,
autenticazione e round-trip di QStash — senza bisogno di un iPhone. Registra una
subscription finta, programma un invio a un'ora e lo annulla, poi ripulisce
tutto:

```bash
npm run smoke -- https://notifiche-custom.vercel.app
```

È il modo più rapido per accorgersi che `PUBLIC_BASE_URL` è sbagliato.

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
