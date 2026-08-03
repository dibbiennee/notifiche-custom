/**
 * Le icone sono disegnate qui invece di installare una libreria: ne servono
 * una ventina, tutte a tratto singolo, e un pacchetto intero peserebbe sul
 * bundle molto più di questo file.
 *
 * Quelle della colonna di sinistra non sono inventate: vengono dalla mappa dei
 * pixel del ritaglio in `screen-sidebar/`, letta un carattere per pixel. La
 * griglia è 16x16 e vale 16px, quindi un'unità è un pixel CSS.
 *
 * Home e Payments condividono la geometria con le icone della barra dell'app
 * iOS (`ios-app/Stripe/TabIcons.swift`), riportata da griglia 24 a griglia 16:
 * nell'originale sono la stessa casa e lo stesso portafoglio.
 */

const PATHS: Record<string, string> = {
  chevronDown: 'M4 6l4 4 4-4',

  // Casa con la porta ad arco, non un quadrotto pieno.
  Home: 'M1.3 14.9V5.1L8 0.9l6.7 4.2v9.8zM5.6 14.9V8.5q0-1 1-1h2.8q1 0 1 1v6.4',

  // Tre righe di lunghezza calante e un cerchio a destra.
  Balances: 'M2.5 3.5h7.5M1.5 8h5M2.5 12.5h5M12 4.7a3.3 3.3 0 100 6.6 3.3 3.3 0 000-6.6',

  // Due frecce affacciate, quella sopra verso destra.
  Transactions: 'M2 5.5h9.5M9.5 3.2l2.4 2.3-2.4 2.3M14 10.5H4.5M6.5 8.2l-2.4 2.3 2.4 2.3',

  Customers: 'M8 7.5a2.4 2.4 0 100-4.8 2.4 2.4 0 000 4.8M3.4 14a4.6 4.6 0 019.2 0',
  'Product catalogue': 'M8 1.4l5.8 3.2v6.8L8 14.6l-5.8-3.2V4.6zM2.2 4.6L8 7.8l5.8-3.2M8 7.8v6.8',

  clock: 'M8 14.5A6.5 6.5 0 108 1.5a6.5 6.5 0 000 13zM8 4.6V8l2.2 1.6',

  // Portafoglio: corpo, patta inclinata e il bottone, che e' un punto tondo
  // ottenuto con un segmento di lunghezza zero e la punta arrotondata.
  Payments:
    'M0.9 7.4a2.1 2.1 0 012.1-2.1h9.6a2.1 2.1 0 012.1 2.1v5.4a2.1 2.1 0 01-2.1 2.1H3a2.1 2.1 0 01-2.1-2.1zM1.1 4.9L10.7 1.2q1.1-.4 1.1.7v3.4M11.6 10.1h.01',

  // Foglio con due righe e, in basso a destra, una freccia circolare che ne
  // esce: e' il segno del rimborso ricorrente.
  Billing:
    'M1.4 1.5h9.2v7.1M1.4 1.5v13h4.6M3.7 5h2.5M3.7 8.2h4.2M13 8.6v2.4h-2.4M12.9 11a3 3 0 11-1-2.3',

  // Assi piu' tre colonne di altezza crescente.
  Reporting: 'M2.5 1.6v12.6h12.4M5.2 14.2V7.6M8.6 14.2V5.2M12 14.2V2.8',

  // Tre riquadri e un piu' in alto a destra.
  Apps:
    'M1.4 2.2h5.6v5.6H1.4zM1.4 9.4h5.6V15H1.4zM8.6 9.4h5.6V15H8.6zM11.4 1.6v5M8.9 4.1h5',

  More: 'M3 8h.01M8 8h.01M13 8h.01',

  search: 'M7.5 12.5a5 5 0 100-10 5 5 0 000 10zM11.5 11.5l3 3',
  apps: 'M2.5 2.5h4v4h-4zM9.5 2.5h4v4h-4zM2.5 9.5h4v4h-4zM11.5 9.5v4M9.5 11.5h4',
  help: 'M8 14A6 6 0 108 2a6 6 0 000 12zM6.5 6.5a1.5 1.5 0 113 .5c0 1-1.5 1.2-1.5 2.5M8 11.5h.01',
  bell: 'M4.5 6.5a3.5 3.5 0 017 0c0 3 1 4 1 4h-9s1-1 1-4zM6.5 12.5a1.5 1.5 0 003 0',
  settings:
    'M8 10a2 2 0 100-4 2 2 0 000 4zM8 1.5l1 1.7 2-.4.4 2 1.7 1-1 1.7 1 1.7-1.7 1-.4 2-2-.4-1 1.7-1-1.7-2 .4-.4-2-1.7-1 1-1.7-1-1.7 1.7-1 .4-2 2 .4z',
  plus: 'M8 3.5v9M3.5 8h9',
  pencil: 'M11.5 2.5l2 2-8 8-2.5.5.5-2.5z',
  info: 'M8 14A6 6 0 108 2a6 6 0 000 12zM8 7.5v3.5M8 5h.01',
  share: 'M8 10.5V2.5M5 5.5L8 2.5l3 3M3 10v3h10v-3',
  binoculars: 'M4.5 5.5h3v7h-3zM8.5 5.5h3v7h-3zM5 3h2v2.5H5zM9 3h2v2.5H9z',
  terminal: 'M3 4l3 3-3 3M8 11h5',
  warning: 'M8 2.5l6 10H2zM8 6.5v3M8 11h.01',
  arrows: 'M5 3v10M5 13l-2-2M11 13V3M11 3l2 2',
  webhook: 'M8 5.5a2.5 2.5 0 10-2 4M8 5.5a2.5 2.5 0 012 4M6 9.5h4',
  collapse: 'M8 14A6 6 0 108 2a6 6 0 000 12zM5.5 9L8 6.5 10.5 9',
};

export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const d = PATHS[name] ?? PATHS.More;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
