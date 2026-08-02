'use client';

/**
 * I grafici sono SVG scritti a mano invece che una libreria: servono due sole
 * forme, e una dipendenza in più peserebbe sul bundle senza aggiungere niente
 * di quello che si vede negli screenshot.
 */

const ACCENT = '#9a66ff';
const TODAY = '#675dff';
const GRID = '#e6e9ee';
const DOTTED = '#a3acba';

function linePath(values: number[], width: number, height: number, padTop: number): string {
  if (values.length === 0) return '';

  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : 0;

  return values
    .map((value, index) => {
      const x = step * index;
      const y = padTop + (1 - (value - min) / span) * (height - padTop);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

/** Il grafico dentro i riquadri: linea viola su righe orizzontali, con le
 *  etichette dei valori a destra e il periodo sotto. */
export function CardChart({
  values,
  labels,
  from,
  to,
}: {
  values: number[];
  labels: string[];
  from: string;
  to: string;
}) {
  const width = 320;
  const height = 132;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          style={{ flex: 1, height, minWidth: 0 }}
        >
          {labels.map((_, index) => {
            const y = labels.length > 1 ? (height / (labels.length - 1)) * index : height;
            return (
              <line
                key={index}
                x1={0}
                y1={y}
                x2={width}
                y2={y}
                stroke={GRID}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          <path
            d={linePath(values, width, height, 6)}
            fill="none"
            stroke={ACCENT}
            strokeWidth={2}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            height,
            fontSize: 13,
            color: '#8b94a6',
            whiteSpace: 'nowrap',
          }}
        >
          {labels.map((label, index) => (
            <span key={`${label}-${index}`}>{label}</span>
          ))}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 13,
          color: '#8b94a6',
          marginTop: 6,
        }}
      >
        <span>{from}</span>
        <span>{to}</span>
      </div>
    </div>
  );
}

/** Il grafico della giornata: la linea piena è oggi, la tratteggiata il giorno
 *  di confronto. */
export function TodayChart({ today, previous }: { today: number[]; previous: number[] }) {
  const width = 1000;
  const height = 170;
  const max = Math.max(...today, ...previous, 1);

  // Le due linee condividono la scala orizzontale delle 24 ore: quella di oggi
  // si ferma all'ora corrente, perché il resto della giornata non è successo.
  const draw = (values: number[]) => {
    if (values.length === 0) return '';
    const step = width / 23;
    return values
      .map((value, index) => {
        const y = height - (value / max) * (height - 12);
        return `${index === 0 ? 'M' : 'L'}${(step * index).toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height }}
    >
      <line
        x1={0}
        y1={height}
        x2={width}
        y2={height}
        stroke={GRID}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={draw(previous)}
        fill="none"
        stroke={DOTTED}
        strokeWidth={2}
        strokeDasharray="5 5"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={draw(today)}
        fill="none"
        stroke={TODAY}
        strokeWidth={2}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
