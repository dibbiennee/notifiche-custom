/** Limite di QStash per la consegna ritardata. */
export const MAX_DELAY_SECONDS = 7 * 24 * 60 * 60;

/** Fino a questa soglia l'invio resta dentro la function, senza passare da QStash. */
export const INLINE_THRESHOLD_SECONDS = 30;

export type DelayUnit = 'seconds' | 'minutes' | 'hours';

const MULTIPLIERS: Record<DelayUnit, number> = {
  seconds: 1,
  minutes: 60,
  hours: 3600,
};

export function toDelaySeconds(value: number, unit: DelayUnit): number {
  const multiplier = MULTIPLIERS[unit];
  if (multiplier === undefined) {
    throw new RangeError(`Unità di ritardo non valida: ${unit}`);
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError('Il ritardo deve essere un numero intero maggiore o uguale a zero');
  }

  const seconds = value * multiplier;
  if (seconds > MAX_DELAY_SECONDS) {
    throw new RangeError('Il ritardo massimo è 7 giorni');
  }

  return seconds;
}

export type DeliveryMode = 'inline' | 'scheduled';

export function deliveryMode(delaySeconds: number): DeliveryMode {
  return delaySeconds <= INLINE_THRESHOLD_SECONDS ? 'inline' : 'scheduled';
}
