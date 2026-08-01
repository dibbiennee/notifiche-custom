# Checklist di verifica su iPhone

Da eseguire a mano sul device: il flusso push iOS non è automatizzabile.

- [ ] `/` si apre, il token viene accettato e resta salvato dopo un refresh
- [ ] La creazione di un preset con un logo funziona e l'icona si vede in lista
- [ ] `/p/<slug>/` aperta in Safari mostra le istruzioni, non il composer
- [ ] Condividi → Aggiungi alla schermata Home crea l'icona con **nome e logo giusti**
- [ ] Aprendo l'icona la pagina parte in standalone e mostra *Attiva notifiche*
- [ ] *Attiva notifiche* fa comparire il prompt di iOS
- [ ] Negando il permesso compare il messaggio con le istruzioni per riattivarlo
- [ ] Invio con ritardo 10s: bloccando lo schermo la notifica arriva con nome e logo del preset
- [ ] Invio con ritardo 5 minuti: compare in *Programmati* e arriva puntuale
- [ ] *Annulla* su un programmato lo rimuove e la notifica non arriva
- [ ] Toccando la notifica si apre la PWA giusta
- [ ] Due preset installati insieme mostrano ognuno il proprio nome e logo
- [ ] L'invio da Mac su `/p/<slug>/` fa arrivare la notifica sull'iPhone bloccato
