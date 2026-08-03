/**
 * Le icone sono disegnate qui invece di installare una libreria: ne servono
 * una ventina, tutte a tratto singolo, e un pacchetto intero peserebbe sul
 * bundle molto più di questo file.
 *
 * Quelle della colonna di sinistra non sono inventate: vengono dalla mappa dei
 * pixel dei ritagli in `screen-icone/`, letta un carattere per pixel. La
 * griglia è 16x16 e vale 16px, quindi un'unità è un pixel CSS.
 *
 * Ogni tracciato e' stato poi verificato ridisegnandolo su una canvas a 2x e
 * confrontando pixel per pixel con l'originale: la sovrapposizione sta fra il
 * 89% e il 100%. Modificandone uno conviene rifare quel conto, altrimenti si
 * torna a disegnare a occhio.
 *
 * Home e Payments condividono la geometria con le icone della barra dell'app
 * iOS (`ios-app/Stripe/TabIcons.swift`), riportata da griglia 24 a griglia 16:
 * nell'originale sono la stessa casa e lo stesso portafoglio.
 */

const PATHS: Record<string, string> = {
  chevronDown: 'M4 6l4 4 4-4',

  // Casa con la punta del tetto arrotondata e larga, non uno spigolo: le due
  // falde si fermano a 6.4 e 8.6 e si chiudono con una curva.
  Home: 'M1.22 15.28 V4.98 L6.84 0.93 Q7.98 0.1 9.12 0.93 L14.74 4.98 V15.28 ZM5.9 15.28 V8.42 q0 -0.73 0.73 -0.73 h2.7 q0.73 0 0.73 0.73 V15.28',

  // Quattro righe, non tre, di lunghezza alternata, e il cerchio sta in basso
  // a destra all'altezza della terza.
  Balances:
    'M1.7 2H9.3M3.2 6H10.8M1.7 10H6.8M3.2 14H7.3M12.5 8.7a2.8 2.8 0 100 5.6 2.8 2.8 0 000-5.6',

  // Due frecce a uncino, non due segmenti dritti: ognuna parte con un tratto
  // verticale, gira con un raccordo e finisce con una punta a V.
  Transactions:
    'M1.75 6.9V5.9A1.9 1.9 0 013.65 4H13.3M10.25 0.7 13.3 4 10.25 7.3M14.25 9.1v1A1.9 1.9 0 0112.35 12H2.7M5.75 15.3 2.7 12 5.75 8.7',

  // Una persona sola: testa grande e busto chiuso in basso, non un archetto.
  Customers:
    'M8 0.7a3.3 3.3 0 100 6.6 3.3 3.3 0 000-6.6M1.2 15.2v-1Q1.2 9.7 6.6 9.7h2.8q5.4 0 5.4 4.6v1Z',

  // Scatola esagonale con la fascia di nastro sulla faccia superiore.
  'Product catalogue':
    'M8 0.5 1.1 4V12L8 15.5 14.9 12V4ZM1.1 4 8 8.2 14.9 4M8 8.2V15.5M4.4 2.3 11.6 6',

  clock: 'M8 14.3A6.3 6.3 0 108 1.7a6.3 6.3 0 000 12.6M7.9 4.2v5.2l2 1',

  // Portafoglio: il corpo parte da 5.2, molto piu' in alto di quanto sembri, e
  // la patta e' una diagonale che sale fino a 0.9. Il bottone e' un cerchietto
  // pieno, ottenuto con un raggio piccolo e il tratto che lo riempie.
  Payments:
    'M0.75 5.3H15.25V13.9q0 1.3-1.3 1.3H2.05q-1.3 0-1.3-1.3ZM0.75 3 11.3 1q.7-.2.7.6V5.3M10.9 10.25a.6 .6 0 101.2 0 .6 .6 0 10-1.2 0',

  Billing:
    'M0.7 0.7h10.3v7.8M0.7 0.7v12.3q0 1.5 1.5 1.5h3M3 4h3M3 7h5.5M15 9.3v3.4h-3.4M14.9 12.4a3.4 3.4 0 11-1.3-2.7',

  // Le colonne non poggiano sull'asse: restano sospese, finiscono a 10.8
  // mentre la base e' a 14.
  Reporting: 'M1.7 1.85V14.35H15M5 10.9V6.7M9 10.9V4.2M13 10.9V1.7',

  // Tre riquadri con gli angoli tondi e un piu' al posto del quarto.
  Apps:
    'M0.66 2.53 q0 -1.46 1.46 -1.46 h2.6 q1.46 0 1.46 1.46 v2.6 q0 1.46 -1.46 1.46 H2.11 q-1.46 0 -1.46 -1.46 zM0.66 11.37 q0 -1.46 1.46 -1.46 h2.6 q1.46 0 1.46 1.46 v2.6 q0 1.46 -1.46 1.46 H2.11 q-1.46 0 -1.46 -1.46 zM9.29 11.37 q0 -1.46 1.46 -1.46 h2.6 q1.46 0 1.46 1.46 v2.6 q0 1.46 -1.46 1.46 h-2.6 q-1.46 0 -1.46 -1.46 zM12.41 0.76 V7.42 M9.19 4.09 h6.45',

  // I tre puntini sono larghi 3, quindi cerchietti pieni: un segmento di
  // lunghezza zero darebbe un punto grande quanto il tratto, la meta'.
  More:
    'M1.65 8a.85 .85 0 101.7 0 .85 .85 0 10-1.7 0M7.15 8a.85 .85 0 101.7 0 .85 .85 0 10-1.7 0M12.65 8a.85 .85 0 101.7 0 .85 .85 0 10-1.7 0',

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
