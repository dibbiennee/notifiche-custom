/**
 * Banco di prova: manda al telefono le combinazioni di titolo e corpo, per
 * capire da dove esce la riga "from Stripe".
 *
 * Non passa dall'API: legge la subscription da Redis e parla direttamente col
 * push service, cosi' puo' mandare payload che la route rifiuterebbe.
 *
 * Uso, dalla cartella del progetto:
 *   node --env-file=.env.local scripts/prova-notifiche.mjs
 */

import { Redis } from '@upstash/redis';
import webpush from 'web-push';

const SLUG = 'stripe';

const PROVE = [
  // Classiche: le disegna il service worker con showNotification.
  { nome: 'A', payload: { title: '', body: 'PROVA A — titolo vuoto, corpo pieno' } },
  { nome: 'B', payload: { title: 'PROVA B — titolo pieno, corpo assente' } },
  { nome: 'C', payload: { title: 'PROVA C titolo', body: 'PROVA C corpo' } },
  { nome: 'D', payload: { body: 'PROVA D — nessun titolo nel payload' } },
  { nome: 'E', payload: { title: 'PROVA E — titolo pieno, corpo vuoto', body: '' } },

  // Declarative Web Push: le disegna direttamente il sistema, senza passare
  // dal service worker. Percorso di rendering diverso, quindi vale la pena
  // vedere se impagina diversamente. Richiede iOS 18.4+.
  {
    nome: 'F',
    grezzo: {
      web_push: 8030,
      notification: {
        title: 'PROVA F titolo',
        body: 'PROVA F corpo — declarative',
        navigate: 'https://notifiche-custom.vercel.app/p/stripe/',
      },
    },
  },
  {
    nome: 'G',
    grezzo: {
      web_push: 8030,
      notification: {
        title: 'PROVA G — declarative, solo titolo',
        navigate: 'https://notifiche-custom.vercel.app/p/stripe/',
      },
    },
  },
];

const redis = Redis.fromEnv();
const subs = (await redis.get(`subs:${SLUG}`)) ?? [];

if (subs.length === 0) {
  console.error(`Nessun dispositivo registrato per il preset "${SLUG}".`);
  process.exit(1);
}

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);

console.log(`${subs.length} dispositivo/i registrato/i. Mando ${PROVE.length} notifiche.\n`);

for (const prova of PROVE) {
  // Le declarative viaggiano cosi' come sono: il formato lo riconosce il sistema.
  // Le classiche prendono un tag diverso per ognuna, altrimenti iOS le sovrascrive.
  const oggetto = prova.grezzo ?? { ...prova.payload, tag: `prova-${prova.nome}` };
  const payload = JSON.stringify(oggetto);

  for (const sub of subs) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload, {
        TTL: 600,
      });
    } catch (error) {
      console.log(`  ${prova.nome} RIFIUTATA dal push service:`, error.statusCode, error.body);
      continue;
    }
  }
  console.log(`  ${prova.nome} inviata:`, payload);
  // Un respiro tra una e l'altra, cosi' arrivano in ordine sullo schermo.
  await new Promise((r) => setTimeout(r, 1500));
}

console.log('\nFatto. Guarda le notifiche sulla schermata di blocco.');
