import { expect, test } from '@playwright/test';

const TOKEN = process.env.APP_TOKEN;

test.skip(!TOKEN, 'APP_TOKEN non impostato: servono le variabili in .env.local');

// PNG 1x1, il minimo per far passare la validazione lato client.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

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
