/**
 * La stessa simulazione della app iOS, riscritta qui.
 *
 * Non è una riscrittura "equivalente": deve produrre le identiche cifre, fino
 * al centesimo, perché telefono e browser leggono le stesse impostazioni da
 * Redis e devono mostrare gli stessi numeri. Per questo il generatore è
 * SplitMix64 su BigInt e non `Math.random`, e per questo l'ordine delle
 * operazioni ricalca riga per riga `ios-app/Stripe/Simulation.swift`.
 *
 * Se tocchi l'algoritmo qui, va toccato anche lì.
 */

const MASK = (1n << 64n) - 1n;

export type Currency = 'usd' | 'eur' | 'gbp' | 'aed';

export interface Simulation {
  merchantName: string;
  currency: Currency;
  dailyMin: number;
  dailyMax: number;
  paymentAmounts: number[];
  netDeductionPercent: number;
  /** Che quota di clienti, ogni giorno, prende anche il prodotto piu' caro
   *  dopo quello base. Opzionali per non rompere i salvataggi vecchi. */
  repeatMinPercent?: number;
  repeatMaxPercent?: number;
  /** Incassi fissati a mano, per data di calendario (`AAAA-MM-GG`). Quello che
   *  fissi oggi resta su oggi anche domani: e' la ragione per cui la chiave e'
   *  la data e non "quanti giorni fa". */
  dayTargets?: Record<string, number>;
  businessDays: number;
  /** Il giorno assoluto in cui l'attivita' ha aperto: da li' parte la rampa di
   *  crescita. Fisso, altrimenti col passare del tempo ogni giornata
   *  scivolerebbe indietro sulla rampa e cambierebbe valore. */
  startDay?: number;
  /** Resta sotto 2^53: oltre, JSON e JavaScript lo arrotonderebbero e il
   *  telefono e il browser genererebbero numeri diversi. */
  seed: number;
}

export const DEFAULT_SIMULATION: Simulation = {
  merchantName: 'Digital Consult LLC',
  currency: 'usd',
  dailyMin: 400,
  dailyMax: 800,
  paymentAmounts: [9.99, 49.99],
  netDeductionPercent: 2,
  repeatMinPercent: 40,
  repeatMaxPercent: 80,
  businessDays: 400,
  seed: 20260802,
};

export const SUGGESTED_NAMES = [
  'Tech Digital Hub',
  'Northgate Web Studio',
  'Vertex Media Group',
  'Lumen Digital Agency',
  'Ardent Web Consulting',
];

/** Quote fisse sul venduto: rimborsi, bloccati e falliti. Non sono impostabili
 *  perché la app iOS non le mostra, e un campo che esiste solo di qua si
 *  perderebbe al primo salvataggio dal telefono. */
const REFUNDED_RATIO = 0.031;
const BLOCKED_RATIO = 0.025;
const FAILED_RATIO = 0.175;

/** Giorni dal 1970-01-01 alla data di calendario. E' l'algoritmo civile di
 *  Hinnant: solo interi, nessun fuso orario di mezzo, cosi' Swift e TypeScript
 *  danno per forza lo stesso numero. */
export function daysFromCivil(y: number, m: number, d: number): number {
  const anno = y - (m <= 2 ? 1 : 0);
  const era = Math.floor(anno / 400);
  const yoe = anno - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** La data di `offset` giorni fa, secondo il calendario locale. */
export function dateAt(offset: number, now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
}

/** La chiave con cui si fissa un incasso: `AAAA-MM-GG`. */
export function dateKey(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** Il numero di giorno assoluto usato come seme. Prima si usava `offset`, cioe'
 *  quanti giorni fa: a mezzanotte ogni giornata scivolava di un posto e tutto
 *  lo storico si rigenerava. Legandolo alla data, una giornata vale sempre lo
 *  stesso importo. */
export function epochDay(offset: number, now = new Date()): number {
  const d = dateAt(offset, now);
  return daysFromCivil(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

// MARK: - Generatore

/** SplitMix64, identico a quello Swift. */
class SeededRandom {
  private state: bigint;

  constructor(seed: bigint) {
    this.state = seed & MASK;
  }

  next(): bigint {
    this.state = (this.state + 0x9e3779b97f4a7c15n) & MASK;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK;
    return (z ^ (z >> 31n)) & MASK;
  }

  double(): number {
    return Number(this.next() >> 11n) / 2 ** 53;
  }

  index(count: number): number {
    if (count <= 1) return 0;
    return Math.min(count - 1, Math.floor(this.double() * count));
  }
}

export interface SimulatedDay {
  offset: number;
  payments: number[];
  gross: number;
  paymentCount: number;
  /** Compratori distinti: meno dei pagamenti, perche' chi fa upsell paga due
   *  volte. */
  customers: number;
}

/** La giornata a `offset` giorni fa: 0 è oggi, 1 ieri. Il risultato dipende
 *  dalla data, non dall'offset: domani questa stessa giornata varra' ancora
 *  quanto vale adesso. */
/** La giornata si costruisce per clienti, non per pagamenti sciolti: ognuno
 *  prende il prodotto base, e una parte aggiunge quello piu' caro. */
export function day(simulation: Simulation, offset: number): SimulatedDay {
  const amounts = simulation.paymentAmounts.filter((a) => a > 0).sort((a, b) => a - b);
  if (amounts.length === 0) {
    return { offset, payments: [], gross: 0, paymentCount: 0, customers: 0 };
  }

  const base = amounts[0];
  const upsells = amounts.slice(1);
  const giorno = epochDay(offset);
  const rng = new SeededRandom((BigInt(simulation.seed) + BigInt(giorno) * 7919n) & MASK);

  const low = Math.min(simulation.dailyMin, simulation.dailyMax);
  const high = Math.max(simulation.dailyMin, simulation.dailyMax);

  // L'attivita' cresce: il livello sale dal minimo il giorno dell'apertura fino
  // al massimo oggi. Sopra ci sono due disturbi, il mese buono o scarso e lo
  // scarto del singolo giorno, che servono solo a non far venire una retta. Il
  // valore resta comunque dentro l'intervallo impostato.
  const arco = Math.max(1, Math.max(2, simulation.businessDays) - 1);
  const inizio = simulation.startDay ?? giorno + offset - arco;
  // La rampa e' piu' lunga dello storico che si vede: cosi' oggi sta all'80%
  // e non al tetto. Se arrivasse al massimo proprio oggi, le ultime settimane
  // verrebbero tutte schiacciate contro il tetto e piatte.
  const rampa = arco * 1.25;
  const progresso = Math.min(1, Math.max(0, (giorno - inizio) / rampa));

  const block = Math.floor(giorno / 30);
  const blockRng = new SeededRandom((BigInt(simulation.seed) + BigInt(block) * 2654435761n) & MASK);
  const onda = (blockRng.double() - 0.5) * 0.3;
  const spread = (rng.double() - 0.5) * 0.25;

  // Le estrazioni sopra avvengono comunque, anche quando oggi e' fissato:
  // saltarle sposterebbe il flusso del generatore e cambierebbe i giorni dopo.
  const casuale = low + Math.min(1, Math.max(0, 0.06 + 0.94 * progresso + onda + spread)) * (high - low);
  const fissato = simulation.dayTargets?.[dateKey(dateAt(offset))];
  const target = fissato && fissato > 0 ? fissato : casuale;

  // La quota di upsell del giorno, dal suo generatore: cosi' il flusso
  // principale resta identico fra TypeScript e Swift.
  const upsellRng = new SeededRandom((BigInt(simulation.seed) + BigInt(giorno) * 15485863n) & MASK);
  const quotaMin = Math.min(simulation.repeatMinPercent ?? 40, simulation.repeatMaxPercent ?? 80);
  const quotaMax = Math.max(simulation.repeatMinPercent ?? 40, simulation.repeatMaxPercent ?? 80);
  const quota = quotaMin + upsellRng.double() * (quotaMax - quotaMin);

  const payments: number[] = [];
  let customers = 0;
  let sum = 0;

  while (sum + base <= target && payments.length < 2000) {
    payments.push(base);
    sum += base;
    customers += 1;

    if (upsells.length === 0 || rng.double() * 100 >= quota) continue;
    const extra = upsells[rng.index(upsells.length)];
    if (sum + extra <= target) {
      payments.push(extra);
      sum += extra;
    }
  }

  return { offset, payments, gross: sum, paymentCount: payments.length, customers };
}

export function customerCount(_simulation: Simulation, d: SimulatedDay): number {
  return d.customers;
}

export function net(simulation: Simulation, gross: number): number {
  return gross * (1 - simulation.netDeductionPercent / 100);
}

// MARK: - Periodi

export const PERIODS = ['1W', '4W', '1Y', 'MTD', 'QTD', 'YTD', 'ALL'] as const;
export type Period = (typeof PERIODS)[number];

export function dayCount(period: Period, today: Date, businessDays: number): number {
  switch (period) {
    case '1W':
      return 7;
    case '4W':
      return 28;
    case '1Y':
      return 365;
    case 'MTD':
      return today.getDate();
    case 'QTD': {
      const quarterStartMonth = Math.floor(today.getMonth() / 3) * 3;
      const start = new Date(today.getFullYear(), quarterStartMonth, 1);
      return Math.round((today.getTime() - start.getTime()) / 86_400_000) + 1;
    }
    case 'YTD': {
      const start = new Date(today.getFullYear(), 0, 1);
      return Math.round((today.getTime() - start.getTime()) / 86_400_000) + 1;
    }
    case 'ALL':
      return Math.max(2, businessDays);
  }
}

/** Gli incassi giornalieri di un periodo, dal più vecchio a oggi. */
export function dailyGross(simulation: Simulation, from: number, to: number): number[] {
  const out: number[] = [];
  for (let offset = to; offset >= from; offset -= 1) {
    out.push(day(simulation, offset).gross);
  }
  return out;
}

/** I punti del grafico: un punto per giorno finché si leggono, altrimenti i
 *  giorni si sommano a gruppi. */
export function series(daily: number[], maxPoints = 14): number[] {
  if (daily.length <= maxPoints) return daily;

  // I gruppi si contano partendo da oggi e andando indietro: se il resto
  // finisse in fondo, l'ultimo gruppo avrebbe meno giorni degli altri e il
  // grafico crollerebbe a picco sull'ultimo punto senza che sia successo
  // niente. Il resto sta all'inizio, dove un valore più basso è plausibile.
  const bucket = Math.ceil(daily.length / maxPoints);
  const remainder = daily.length % bucket;

  const out: number[] = [];
  // Un avanzo troppo corto si unisce al gruppo dopo invece di fare punto a sé.
  let start = remainder >= bucket / 2 ? 0 : remainder;
  if (remainder > 0 && remainder >= bucket / 2) {
    out.push(daily.slice(0, remainder).reduce((a, b) => a + b, 0));
    start = remainder;
  }

  for (; start < daily.length; start += bucket) {
    out.push(daily.slice(start, start + bucket).reduce((a, b) => a + b, 0));
  }
  return out;
}

// MARK: - Riepiloghi per la pagina

export interface Totals {
  gross: number;
  net: number;
  payments: number;
  customers: number;
}

export function totals(simulation: Simulation, from: number, to: number): Totals {
  let gross = 0;
  let payments = 0;
  let customers = 0;

  for (let offset = from; offset <= to; offset += 1) {
    const d = day(simulation, offset);
    gross += d.gross;
    payments += d.paymentCount;
    customers += customerCount(simulation, d);
  }

  return { gross, net: net(simulation, gross), payments, customers };
}

/** Lo spaccato della card "Payments": quanto è andato a buon fine e quanto no. */
export function paymentBreakdown(simulation: Simulation, from: number, to: number) {
  const succeeded = totals(simulation, from, to).gross;
  return {
    succeeded,
    uncaptured: 0,
    refunded: succeeded * REFUNDED_RATIO,
    blocked: succeeded * BLOCKED_RATIO,
    failed: succeeded * FAILED_RATIO,
  };
}

/** L'incasso di oggi ora per ora, sommato: è la linea piena del grafico in
 *  alto. Si ferma all'ora corrente, perché la giornata non è finita. */
export function cumulativeByHour(
  simulation: Simulation,
  offset: number,
  upToHour: number,
): number[] {
  const d = day(simulation, offset);
  // Anche qui il seme e' il giorno assoluto: se fosse l'offset, a mezzanotte
  // le ore di ieri si ridistribuirebbero da capo.
  const rng = new SeededRandom((BigInt(simulation.seed) + BigInt(epochDay(offset)) * 104_729n) & MASK);

  // I pagamenti si distribuiscono sulle ore, con più peso nel pomeriggio.
  const hours = new Array(24).fill(0) as number[];
  for (const amount of d.payments) {
    const hour = Math.min(23, Math.floor(6 + rng.double() * 18));
    hours[hour] += amount;
  }

  const out: number[] = [];
  let running = 0;
  for (let hour = 0; hour <= Math.min(23, upToHour); hour += 1) {
    running += hours[hour];
    out.push(running);
  }
  return out;
}

export interface FailedPayment {
  amount: number;
  date: Date;
  id: string;
}

/** Le righe della card "Failed payments": importi veri presi dagli stessi
 *  tagli, con data e identificativo stabili. */
export function failedPayments(simulation: Simulation, count: number): FailedPayment[] {
  const amounts = simulation.paymentAmounts.filter((a) => a > 0).sort((a, b) => a - b);
  if (amounts.length === 0) return [];

  const rng = new SeededRandom((BigInt(simulation.seed) + 31n) & MASK);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const out: FailedPayment[] = [];
  let offset = 0;

  for (let i = 0; i < count; i += 1) {
    offset += 1 + rng.index(20);
    const date = new Date();
    date.setDate(date.getDate() - offset);
    date.setHours(rng.index(24), rng.index(60), 0, 0);

    let id = 'pi_3';
    for (let c = 0; c < 21; c += 1) id += alphabet[rng.index(alphabet.length)];

    out.push({ amount: amounts[rng.index(amounts.length)], date, id });
  }

  return out;
}

// MARK: - Formattazione

const SYMBOLS: Record<Currency, { card: string; report: string }> = {
  usd: { card: 'US$', report: 'US$' },
  eur: { card: '€', report: '€' },
  gbp: { card: '£', report: '£' },
  aed: { card: 'AED ', report: 'AED ' },
};

export function symbol(currency: Currency): string {
  return SYMBOLS[currency].report;
}

/** Formato americano a prescindere dalla lingua del browser: la dashboard di
 *  Stripe scrive 1,234.56 anche su un computer italiano. */
export function money(value: number, currency: Currency): string {
  return (
    symbol(currency) +
    value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

/** Le etichette dell'asse verticale: US$4k, US$3k… */
export function compactMoney(value: number, currency: Currency): string {
  const sym = symbol(currency);
  if (value >= 1000) return `${sym}${Math.round(value / 1000)}k`;
  return sym + Math.round(value);
}

export function isSimulation(value: unknown): value is Simulation {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Partial<Simulation>;
  return (
    typeof s.merchantName === 'string' &&
    typeof s.dailyMin === 'number' &&
    typeof s.dailyMax === 'number' &&
    Array.isArray(s.paymentAmounts) &&
    typeof s.seed === 'number'
  );
}
