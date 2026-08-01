// Verifica che le credenziali in .env.local funzionino davvero.
// Non stampa mai un valore: solo esito, lunghezza e forma.
import { Redis } from "@upstash/redis";

const REQUIRED = [
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "APP_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "QSTASH_TOKEN",
  "QSTASH_CURRENT_SIGNING_KEY",
  "QSTASH_NEXT_SIGNING_KEY",
  "PUBLIC_BASE_URL",
];

let failed = false;
const fail = (msg) => {
  failed = true;
  console.log(`  ✗ ${msg}`);
};
const ok = (msg) => console.log(`  ✓ ${msg}`);
const skip = (msg) => console.log(`  – ${msg}`);

/** True se la variabile c'è ed è ben formata. */
const usable = (name) => {
  const raw = process.env[name];
  return Boolean(raw) && raw === raw.trim() && !/^["'].*["']$/.test(raw);
};

console.log("\n1. Variabili presenti e ben formate");

for (const name of REQUIRED) {
  const raw = process.env[name];
  if (!raw) {
    fail(`${name} manca o è vuota`);
  } else if (raw !== raw.trim()) {
    fail(`${name} ha spazi all'inizio o alla fine — toglili`);
  } else if (/^["'].*["']$/.test(raw)) {
    fail(`${name} è racchiusa fra virgolette — vanno tolte`);
  } else {
    ok(`${name} presente (${raw.length} caratteri)`);
  }
}

// QSTASH_TOKEN è base64 di un JSON, quindi la sua lunghezza è per forza un
// multiplo di 4. Le console web spesso troncano l'ultimo "=" nel copia-incolla:
// il token continua a decodificarsi (base64 è tollerante) ma il server lo
// rifiuta con "invalid token", che da solo non fa capire niente.
if (usable("QSTASH_TOKEN") && process.env.QSTASH_TOKEN.length % 4 !== 0) {
  const mancanti = 4 - (process.env.QSTASH_TOKEN.length % 4);
  fail(
    `QSTASH_TOKEN ha perso il padding base64: aggiungi ${mancanti} carattere/i "=" in fondo`,
  );
}

// Da qui in poi si prova comunque tutto ciò che è configurabile: sapere che
// Redis funziona è utile anche mentre QStash è ancora da compilare.

console.log("\n2. Redis raggiungibile e scrivibile");

if (!usable("UPSTASH_REDIS_REST_URL") || !usable("UPSTASH_REDIS_REST_TOKEN")) {
  skip("saltato: credenziali Redis non ancora compilate");
} else
  try {
    const redis = Redis.fromEnv();
    const key = "healthcheck:tmp";
    await redis.set(key, "ok", { ex: 60 });
    const value = await redis.get(key);
    await redis.del(key);
    if (value !== "ok")
      throw new Error(`riletto ${JSON.stringify(value)} invece di "ok"`);
    ok("scrittura, lettura e cancellazione riuscite");
  } catch (error) {
    fail(`Redis non risponde: ${error.message}`);
  }

console.log("\n3. QStash: token e signing key");

if (!usable("QSTASH_TOKEN")) {
  skip("saltato: QSTASH_TOKEN non ancora compilato");
} else
  try {
    const res = await fetch("https://qstash.upstash.io/v2/keys", {
      headers: { Authorization: `Bearer ${process.env.QSTASH_TOKEN}` },
    });

    if (res.status === 401 || res.status === 403) {
      fail("QSTASH_TOKEN rifiutato dal server");
    } else if (!res.ok) {
      fail(`QStash ha risposto ${res.status}`);
    } else {
      ok("QSTASH_TOKEN valido");

      const keys = await res.json();
      if (keys.current === process.env.QSTASH_CURRENT_SIGNING_KEY) {
        ok("QSTASH_CURRENT_SIGNING_KEY combacia con quella del server");
      } else {
        fail("QSTASH_CURRENT_SIGNING_KEY diversa da quella del server");
      }
      if (keys.next === process.env.QSTASH_NEXT_SIGNING_KEY) {
        ok("QSTASH_NEXT_SIGNING_KEY combacia con quella del server");
      } else {
        fail("QSTASH_NEXT_SIGNING_KEY diversa da quella del server");
      }
    }
  } catch (error) {
    fail(`QStash irraggiungibile: ${error.message}`);
  }

console.log("\n4. Coerenza delle chiavi VAPID");

if (
  !usable("VAPID_PUBLIC_KEY") ||
  !usable("VAPID_PRIVATE_KEY") ||
  !usable("VAPID_SUBJECT")
) {
  skip("saltato: chiavi VAPID non ancora compilate");
} else
  try {
    const webpush = (await import("web-push")).default;
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
    ok("coppia VAPID accettata da web-push");
  } catch (error) {
    fail(`chiavi VAPID non valide: ${error.message}`);
  }

console.log(
  failed ? "\nCi sono problemi da sistemare.\n" : "\nTutto a posto.\n",
);
process.exit(failed ? 1 : 0);
