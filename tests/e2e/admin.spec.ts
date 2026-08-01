import { expect, test } from '@playwright/test';
import { makePng } from './fixtures/png';

const TOKEN = process.env.APP_TOKEN;

test.skip(!TOKEN, 'APP_TOKEN non impostato: servono le variabili in .env.local');

const PNG = makePng();

test('crea un preset, lo mostra in lista e lo elimina', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Token').fill(TOKEN!);
  await page.getByRole('button', { name: 'Entra' }).click();

  const name = `E2E ${Date.now()}`;
  await page.getByLabel(/^Nome/).fill(name);
  await page
    .getByLabel(/^Logo/)
    .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });

  await page.getByRole('button', { name: 'Crea preset' }).click();

  // Se l'elaborazione dell'icona fallisce l'app lo scrive qui: asserire prima
  // su .error dà un messaggio utile invece di un timeout muto sul nome.
  await expect(page.locator('.error')).toHaveCount(0);
  await expect(page.getByText(name)).toBeVisible();

  // L'unica conferma nativa del flusso è quella sull'eliminazione.
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('.card', { hasText: name }).getByRole('button', { name: 'Elimina' }).click();

  await expect(page.getByText(name)).toHaveCount(0);
});

test('fuori standalone la PWA mostra le istruzioni di installazione, non il composer', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Token').fill(TOKEN!);
  await page.getByRole('button', { name: 'Entra' }).click();

  const name = `E2E Istruzioni ${Date.now()}`;
  await page.getByLabel(/^Nome/).fill(name);
  await page
    .getByLabel(/^Logo/)
    .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
  await page.getByRole('button', { name: 'Crea preset' }).click();

  await expect(page.locator('.error')).toHaveCount(0);
  await expect(page.getByText(name)).toBeVisible();

  const href = await page.locator('.card', { hasText: name }).locator('a').getAttribute('href');
  await page.goto(href!);

  await expect(page.getByText('Aggiungi alla schermata Home')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Invia' })).toHaveCount(0);

  await page.goto('/');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('.card', { hasText: name }).getByRole('button', { name: 'Elimina' }).click();
  await expect(page.getByText(name)).toHaveCount(0);
});

test("l'icona servita corrisponde al PNG caricato", async ({ page, request }) => {
  await page.goto('/');
  await page.getByLabel('Token').fill(TOKEN!);
  await page.getByRole('button', { name: 'Entra' }).click();

  const name = `E2E Icona ${Date.now()}`;
  await page.getByLabel(/^Nome/).fill(name);
  await page
    .getByLabel(/^Logo/)
    .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
  await page.getByRole('button', { name: 'Crea preset' }).click();
  await expect(page.getByText(name)).toBeVisible();

  const slug = (await page.locator('.card', { hasText: name }).locator('a').getAttribute('href'))!
    .replace(/^\/p\//, '')
    .replace(/\/$/, '');

  // Il manifest deve essere installabile: standalone, e start_url dentro scope.
  const manifest = await (await request.get(`/p/${slug}/manifest/`)).json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);

  // Le icone devono esistere davvero ed essere PNG.
  for (const size of [192, 512]) {
    const res = await request.get(`/api/icon/${slug}/${size}/`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('image/png');
    const body = await res.body();
    expect(body.subarray(1, 4).toString('ascii')).toBe('PNG');
  }

  await page.goto('/');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('.card', { hasText: name }).getByRole('button', { name: 'Elimina' }).click();
  await expect(page.getByText(name)).toHaveCount(0);
});
