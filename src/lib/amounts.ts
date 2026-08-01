/** Gli importi offerti come caselle da spuntare, nella forma richiesta. */
export const PRESET_AMOUNTS: readonly string[] = [
  '9.99',
  '49.99',
  '1890.00',
  '11900.00',
  '48900.00',
];

/** Nel testo dell'invio, questo pezzo viene sostituito con la cifra. */
export const AMOUNT_PLACEHOLDER = '|importo|';

export function hasAmountPlaceholder(text: string): boolean {
  return text.includes(AMOUNT_PLACEHOLDER);
}

/**
 * Accetta cifre con al massimo due decimali, separati da punto o virgola, e le
 * riporta sempre a due decimali col punto. Niente separatore delle migliaia:
 * la forma richiesta è `11900.00`, non `11,900.00`.
 */
export function normalizeAmount(input: string): string {
  const trimmed = input.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new RangeError(`Importo non valido: ${input}`);
  }
  return Number(trimmed).toFixed(2);
}

export function renderBody(template: string, amount: string): string {
  return template.split(AMOUNT_PLACEHOLDER).join(amount);
}
