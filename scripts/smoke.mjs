// Test di fumo contro un'istanza già deployata.
// Verifica il giro completo — preset, manifest, icone, QStash — senza bisogno
// di un iPhone: registra una subscription finta, programma un invio lontano nel
// tempo e lo annulla prima che possa partire.
//
//   node --env-file=.env.local scripts/smoke.mjs https://tuo-progetto.vercel.app
import { crc32, deflateSync } from 'node:zlib';

const BASE = (process.argv[2] ?? process.env.PUBLIC_BASE_URL ?? '').replace(/\/+$/, '');
const TOKEN = process.env.APP_TOKEN;

if (!BASE) {
  console.error("Passa l'URL come argomento, oppure imposta PUBLIC_BASE_URL.");
  process.exit(1);
}
if (!TOKEN) {
  console.error('APP_TOKEN mancante.');
  process.exit(1);
}

let failed = false;
const ok = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => {
  failed = true;
  console.log(`  ✗ ${m}`);
};

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, checksum]);
}

function makePng(size = 32) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([
    Buffer.from([0]),
    ...Array.from({ length: size }, () => Buffer.from([0, 128, 255])),
  ]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const api = (path, init = {}) =>
  fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });

const icon = makePng().toString('base64');
const name = `Smoke ${Date.now()}`;
let slug = null;
let scheduledId = null;

console.log(`\nTest di fumo su ${BASE}\n`);

try {
  console.log('1. Preset');
  const res = await api('/api/presets/', {
    method: 'POST',
    body: JSON.stringify({ name, icons: { 192: icon, 512: icon } }),
  });
  if (res.status !== 201) throw new Error(`atteso 201, ricevuto ${res.status}: ${await res.text()}`);
  slug = (await res.json()).preset.slug;
  ok(`creato "${name}" con slug ${slug}`);

  console.log('\n2. Manifest e icone');
  const manifest = await (await fetch(`${BASE}/p/${slug}/manifest/`)).json();
  manifest.display === 'standalone'
    ? ok('display standalone')
    : fail(`display è ${manifest.display}, iOS non abiliterà le push`);
  manifest.start_url.startsWith(manifest.scope)
    ? ok('start_url dentro scope')
    : fail(`start_url ${manifest.start_url} fuori da scope ${manifest.scope}`);

  for (const size of [192, 512]) {
    const img = await fetch(`${BASE}/api/icon/${slug}/${size}/`);
    const body = Buffer.from(await img.arrayBuffer());
    img.ok && body.subarray(1, 4).toString('ascii') === 'PNG'
      ? ok(`icona ${size} servita come PNG`)
      : fail(`icona ${size}: status ${img.status}`);
  }

  console.log('\n3. Invio senza device registrati');
  const vuoto = await api('/api/send/', {
    method: 'POST',
    body: JSON.stringify({ slug, title: 'T', body: 'B', delaySeconds: 0 }),
  });
  vuoto.status === 400
    ? ok('rifiutato con 400, come previsto')
    : fail(`atteso 400, ricevuto ${vuoto.status}`);

  console.log('\n4. Subscription finta');
  const sub = await api('/api/subscribe/', {
    method: 'POST',
    body: JSON.stringify({
      slug,
      subscription: {
        endpoint: `https://fcm.googleapis.com/fcm/send/smoke-${Date.now()}`,
        keys: { p256dh: 'BsmokeTestKeyNonValidaMaBenFormata', auth: 'smokeAuthKey' },
      },
    }),
  });
  sub.ok ? ok('registrata') : fail(`status ${sub.status}: ${await sub.text()}`);

  console.log("\n5. Giro completo di QStash (prova vera di PUBLIC_BASE_URL)");
  const send = await api('/api/send/', {
    method: 'POST',
    body: JSON.stringify({ slug, title: 'Smoke', body: 'Test', delaySeconds: 3600 }),
  });
  if (send.status !== 202) {
    fail(`programmazione fallita, status ${send.status}: ${await send.text()}`);
  } else {
    const json = await send.json();
    scheduledId = json.id;
    json.mode === 'scheduled'
      ? ok(`accettato da QStash, id ${scheduledId}`)
      : fail(`mode inatteso: ${json.mode}`);

    const lista = await (await api('/api/scheduled/')).json();
    lista.scheduled.some((s) => s.id === scheduledId)
      ? ok('compare fra i programmati')
      : fail('non compare fra i programmati');

    const del = await api(`/api/scheduled/?id=${encodeURIComponent(scheduledId)}`, {
      method: 'DELETE',
    });
    if (del.ok) {
      scheduledId = null;
      const dopo = await (await api('/api/scheduled/')).json();
      dopo.scheduled.some((s) => s.id === json.id)
        ? fail('ancora presente dopo l\'annullamento')
        : ok('annullato e rimosso');
    } else {
      fail(`annullamento fallito, status ${del.status}`);
    }
  }

  console.log('\n6. Autenticazione');
  const senzaToken = await fetch(`${BASE}/api/presets/`);
  senzaToken.status === 401
    ? ok('le API rifiutano le richieste senza token')
    : fail(`atteso 401, ricevuto ${senzaToken.status}`);
} catch (error) {
  fail(error.message);
} finally {
  console.log('\n7. Pulizia');
  if (scheduledId) {
    await api(`/api/scheduled/?id=${encodeURIComponent(scheduledId)}`, { method: 'DELETE' }).catch(
      () => {},
    );
    console.log('  – annullato il programmato rimasto in sospeso');
  }
  if (slug) {
    const res = await api(`/api/presets/?slug=${encodeURIComponent(slug)}`, { method: 'DELETE' });
    res.ok ? ok('preset di prova eliminato') : fail(`eliminazione fallita, status ${res.status}`);
  }
}

console.log(failed ? '\nCi sono problemi.\n' : '\nProduzione a posto.\n');
process.exit(failed ? 1 : 0);
