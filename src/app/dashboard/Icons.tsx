/**
 * Le icone sono disegnate qui invece di installare una libreria: ne servono
 * una ventina, tutte a tratto singolo, e un pacchetto intero peserebbe sul
 * bundle molto più di questo file.
 */

const PATHS: Record<string, string> = {
  chevronDown: 'M4 6l4 4 4-4',
  Home: 'M2.5 7L8 2.5 13.5 7v6a1 1 0 01-1 1h-9a1 1 0 01-1-1z',
  Balances: 'M2 4h12M2 8h8M2 12h5',
  Transactions: 'M3 5h9l-2-2M13 11H4l2 2',
  Customers: 'M8 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM3 14a5 5 0 0110 0',
  'Product catalogue': 'M8 2l5.5 3v6L8 14l-5.5-3V5zM2.5 5L8 8l5.5-3M8 8v6',
  clock: 'M8 14A6 6 0 108 2a6 6 0 000 12zM8 5v3l2 1.5',
  Payments: 'M2 5.5A1.5 1.5 0 013.5 4h9A1.5 1.5 0 0114 5.5v5A1.5 1.5 0 0112.5 12h-9A1.5 1.5 0 012 10.5zM2 7h12',
  Billing: 'M3.5 2.5h9v11l-2-1.5-2 1.5-2-1.5-3 1.5zM6 6h4M6 9h4',
  Reporting: 'M3 13V8M6.5 13V4M10 13v-3M13.5 13V6',
  Apps: 'M2.5 2.5h4v4h-4zM9.5 2.5h4v4h-4zM2.5 9.5h4v4h-4zM11.5 9.5v4M9.5 11.5h4',
  More: 'M3 8h.01M8 8h.01M13 8h.01',
  search: 'M7.5 12.5a5 5 0 100-10 5 5 0 000 10zM11.5 11.5l3 3',
  apps: 'M2.5 2.5h4v4h-4zM9.5 2.5h4v4h-4zM2.5 9.5h4v4h-4zM11.5 9.5v4M9.5 11.5h4',
  help: 'M8 14A6 6 0 108 2a6 6 0 000 12zM6.5 6.5a1.5 1.5 0 113 .5c0 1-1.5 1.2-1.5 2.5M8 11.5h.01',
  bell: 'M4.5 6.5a3.5 3.5 0 017 0c0 3 1 4 1 4h-9s1-1 1-4zM6.5 12.5a1.5 1.5 0 003 0',
  settings: 'M8 10a2 2 0 100-4 2 2 0 000 4zM8 1.5l1 1.7 2-.4.4 2 1.7 1-1 1.7 1 1.7-1.7 1-.4 2-2-.4-1 1.7-1-1.7-2 .4-.4-2-1.7-1 1-1.7-1-1.7 1.7-1 .4-2 2 .4z',
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
