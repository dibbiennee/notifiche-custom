# Serie di notifiche — Design

**Data:** 2026-08-01
**Stato:** approvato nel comportamento, spec da rivedere
**Scope:** invio di più notifiche programmate in un colpo solo, con importo variabile

---

## 1. Obiettivo

Oggi un invio produce **una** notifica. Per averne venti si preme "Invia" venti volte.

Questa fase aggiunge la **serie**: si compila il form una volta e il server programma N
consegne distanziate nel tempo, ognuna con un importo pescato tra quelli scelti.

Caso d'uso dichiarato: far comparire sulla schermata di blocco una sequenza di notifiche
del tipo `You received a payment of €1890.00 EUR`, sia come raffica di pochi secondi sia
distribuita su ore.

**Fuori scope:** modificare una serie già partita, metterla in pausa, ricorrenze
giornaliere, invio verso dispositivi non registrati da chi possiede il token.

---

## 2. Cosa cambia rispetto a oggi

| | Oggi | Dopo |
|---|---|---|
| Titolo | campo obbligatorio, compare sopra il nome dell'app | **eliminato** |
| Testo | libero | libero, con il segnaposto `\|importo\|` |
| Importo | scritto a mano dentro il testo | elenco a scelta multipla, pescato a caso |
| Quantità | una notifica | una, oppure N, oppure per un periodo |
| Cadenza | — | intervallo fisso, oppure casuale tra due valori |
| Ritardo iniziale | c'è già | invariato |

---

## 3. La schermata

Approvata in questa forma.

```
Testo
┌──────────────────────────────────────────┐
│ You received a payment of €|importo| EUR │
└──────────────────────────────────────────┘

Importo    ☐ €9.99   ☑ €49.99   ☑ €1890.00
           ☐ €11900.00   ☐ €48900.00
           ☐ altro: [________]

Quando parte    [10] [secondi ▾]     Subito · 5s · 30s · 1m · 5m

Quante          ( ) Una sola
                (•) Più di una
                      ( ) numero preciso  [20]
                      (•) per un periodo  [5] [minuti ▾]

Ogni quanto     (•) ogni  [30] [secondi ▾]
                ( ) a caso tra [5] e [40] secondi

                        [ Invia ]
```

Con "Una sola" selezionata, i blocchi *Quante* e *Ogni quanto* sono nascosti: il form
torna esattamente a quello di oggi meno il titolo.

Gli importi preimpostati sono cinque, fissi nel codice:

```
9.99    49.99    1890.00    11900.00    48900.00
```

Scritti così come sono, senza separatore delle migliaia — `11900.00`, non `11,900.00` —
perché è la forma richiesta.

La casella "altro" non è alternativa alle altre: se è spuntata e contiene un numero
valido, quell'importo entra nel gruppo da cui si pesca insieme ai preimpostati spuntati.

---

## 4. Il titolo sparisce

iOS impagina la notifica come `titolo` / `nome della PWA` / `corpo`. Con il titolo
valorizzato compare una riga in più sopra il nome dell'app, che non si vuole: la
notifica deve leggersi `from Stripe` seguito dal testo.

Serve toccare tre punti:

1. **`src/app/p/[slug]/PresetApp.tsx`** — via il campo Titolo e il suo stato.
2. **`src/app/api/send/route.ts`** — `title` non è più un campo della richiesta.
3. **`public/sw.js`** — oggi fa `data.title || 'Notifica'`. Senza toccarlo, tolto il
   titolo comparirebbe la scritta **"Notifica"**. Il service worker deve chiamare
   `showNotification('', { body })`.

Il tipo `Preset` perde `defaultTitle`. **In produzione i preset sono zero** (verificato
via `/api/presets/`), quindi non serve nessuna migrazione dei dati esistenti.

> **Da verificare sul telefono prima di considerare chiusa la cosa:** che iOS con
> `showNotification('')` disegni `from Stripe` + testo e non lasci una riga vuota in
> cima. Se lasciasse una riga vuota, il ripiego è passare il testo come titolo e lasciare
> il corpo vuoto — che però inverte l'ordine, mettendo il testo *sopra* il nome dell'app.
> Non è automatizzabile: va guardato, come il resto del flusso push in
> `docs/checklist-iphone.md`.

---

## 5. Come si calcola la serie

Tutta la logica sta in un modulo nuovo, `src/lib/series.ts`, fatto di funzioni pure senza
accesso a rete o database. La route si limita a orchestrare.

**Ingressi**

| Nome | Significato |
|---|---|
| `startDelay` | secondi prima della prima notifica, da 0 a 7 giorni |
| `limit` | `{ kind: 'count', count }` oppure `{ kind: 'duration', seconds }` |
| `cadence` | `{ kind: 'fixed', seconds }` oppure `{ kind: 'random', min, max }` |
| `amounts` | importi scelti, almeno uno se il testo contiene il segnaposto |

**Istanti**

Il primo è `startDelay`. Ogni successivo è il precedente più un intervallo: quello fisso,
oppure un valore pescato tra `min` e `max` inclusi.

- Limite `count`: si generano esattamente `count` istanti.
- Limite `duration`: si continua finché l'istante successivo resta entro
  `startDelay + seconds`. Ne esce sempre almeno uno, anche con una finestra di zero.

**Testo**

Ogni istante riceve una copia del testo in cui `|importo|` è sostituito con un importo
estratto a caso tra quelli scelti — a caso a ogni notifica, quindi lo stesso importo può
ripetersi di fila. Se il testo non contiene `|importo|`, la lista è ignorata e le
notifiche sono identiche.

Il simbolo `€` e la sigla `EUR` fanno parte del testo scritto dall'utente: il codice
sostituisce solo la cifra, non impagina la valuta.

**Casualità testabile**

Sia la scelta dell'importo sia l'intervallo casuale passano da una funzione `rng`
iniettabile, come già si fa con `setQstashClientForTesting`. Nei test si passa una
sequenza deterministica e si verificano gli istanti esatti.

---

## 6. Come vengono programmate

Il server calcola **tutti** gli istanti al momento dell'invio e li programma tutti
insieme, ognuno come una consegna indipendente marcata con lo stesso `seriesId`.

Si riusa la regola già presente in `src/lib/delay.ts`:

- istanti entro **30 secondi** → consegnati dalla function stessa, in un unico `after()`
  che dorme e consegna in sequenza;
- istanti oltre i 30 secondi → un messaggio QStash ciascuno, come oggi.

Scartate due alternative:

- **Catena auto-riprogrammante** (ogni consegna programma la successiva): un anello che
  si rompe uccide il resto della serie in silenzio, e non risparmia messaggi.
- **Cron di polling**: introduce infrastruttura che il progetto non ha, e la granularità
  al minuto renderebbe impossibile la raffica da pochi secondi, che è il caso principale.

---

## 7. Annullamento

`DELETE /api/scheduled/` accetta, in alternativa a `id`, un parametro `seriesId`: cancella
il messaggio QStash e il record di **ogni** consegna della serie ancora programmata.

Nella lista dei programmati le consegne di una serie sono raggruppate: una riga sola, con
il conteggio di quante restano e un bottone che le annulla tutte.

Le consegne entro i 30 secondi non sono annullabili, perché non passano da QStash e non
hanno un record — è già così oggi per l'invio singolo.

---

## 8. Limiti e validazioni

Tutti controllati **prima** di pubblicare qualsiasi messaggio, così un invio invalido non
lascia niente a metà.

| Regola | Perché | Errore |
|---|---|---|
| Al massimo **100** notifiche per serie | ogni notifica consuma un messaggio QStash e la quota è finita | 400, con il numero calcolato |
| L'ultimo istante entro **7 giorni** | tetto di QStash, già in `MAX_DELAY_SECONDS` | 400, con l'istante calcolato |
| Cadenza fissa ≥ 1 secondo | sotto non ha senso e moltiplica i messaggi | 400 |
| Cadenza casuale con `min ≤ max`, `min ≥ 1` | intervallo impossibile | 400 |
| `count ≥ 1`, `duration ≥ 0` | — | 400 |
| Almeno un importo se il testo contiene `\|importo\|` | altrimenti non c'è niente da sostituire | 400 |
| Importo scritto a mano: cifre con `.` o `,` decimale | si normalizza a due decimali col punto | 400 se non numerico |
| Testo obbligatorio, ≤ 500 caratteri | come oggi per il corpo | 400 |

In modalità `duration` il conteggio si scopre solo calcolando: se supera 100, si risponde
400 dicendo quante ne sarebbero uscite, invece di troncare in silenzio.

---

## 9. Errori durante la pubblicazione

I messaggi QStash si pubblicano in sequenza. Se uno fallisce a metà, le consegne già
pubblicate vengono **annullate** e la richiesta risponde con un errore: meglio niente che
una serie monca e inspiegabile.

Se anche l'annullamento fallisce, la risposta elenca gli id rimasti appesi, così restano
cancellabili a mano dalla lista dei programmati.

L'annullamento copre solo le consegne passate da QStash. Le consegne entro i 30 secondi
girano dentro l'`after()` e partiranno comunque: per questo i messaggi QStash si
pubblicano **prima** di avviare l'`after()`, così un fallimento non lascia arrivare le
prime notifiche di una serie che poi non prosegue.

---

## 10. Modello dati

`ScheduledSend` guadagna due campi opzionali:

```ts
type ScheduledSend = {
  id: string;
  slug: string;
  body: string;          // `title` sparisce
  sendAt: number;
  messageId: string;
  seriesId?: string;     // stesso valore per tutte le consegne di una serie
  seriesIndex?: number;  // posizione, da 0, per ordinare la lista
};
```

Nessun metodo nuovo sullo `Store`: raggruppare e annullare una serie si fa con
`listScheduled()` filtrato per `seriesId` e `removeScheduled()` sui singoli id. Il volume
è di poche decine di record.

---

## 11. Test

**Unitari su `src/lib/series.ts`** — è qui che sta tutta la logica, e non tocca la rete:

- istanti con cadenza fissa, limite a `count`
- istanti con cadenza fissa, limite a `duration`, inclusa la finestra che non contiene un
  intervallo intero
- istanti con cadenza casuale e `rng` deterministico, entrambi i limiti
- sostituzione di `|importo|`, testo senza segnaposto, segnaposto ripetuto due volte
- ogni riga della tabella dei limiti al punto 8

**Sulla route** — `publishDelayed` chiamato N volte con i ritardi attesi; nessuna
pubblicazione quando la validazione fallisce; annullamento di quelli già pubblicati
quando uno fallisce a metà.

**E2E Playwright** — "Una sola" nasconde i blocchi della serie; "per un periodo" e
"numero preciso" si escludono; il campo Titolo non esiste più.

**Manuale su iPhone** — il punto del titolo vuoto al capitolo 4, e una serie breve che
arriva davvero a schermo bloccato. Da aggiungere a `docs/checklist-iphone.md`.

---

## 12. Nota sul consumo

Una serie da 55 notifiche a intervalli lunghi pubblica 55 messaggi QStash. Il numero di
notifiche **è** il consumo di quota: conviene controllare il tetto del proprio piano sulla
console Upstash. Il massimo di 100 per serie serve a impedire che un errore di battitura
nel campo "numero preciso" bruci la quota di una giornata.
