'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch, isAuthenticated, login } from '@/lib/client';
import {
  DEFAULT_SIMULATION,
  SUGGESTED_NAMES,
  compactMoney,
  customerCount,
  cumulativeByHour,
  day,
  dailyGross,
  failedPayments,
  money,
  net,
  paymentBreakdown,
  series,
  totals,
  type Currency,
  type Simulation,
} from '@/lib/simulation';
import { CardChart, TodayChart } from './Charts';
import { Icon } from './Icons';
import styles from './dashboard.module.css';

const NAV = ['Home', 'Balances', 'Transactions', 'Customers', 'Product catalogue'];
const SHORTCUTS = ['Capital', 'Tax', 'Payment Links', 'Reports', 'Invoices'];
const PRODUCTS = ['Payments', 'Billing', 'Reporting', 'Apps', 'More'];

const PRESET_AMOUNTS = [9.99, 49.99, 1890, 11900, 48900];

const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const longDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const monthLabel = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' });
const timeLabel = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

function daysAgo(offset: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - offset);
  return date;
}

export default function Dashboard() {
  const [ready, setReady] = useState(false);
  const [authorised, setAuthorised] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [simulation, setSimulation] = useState<Simulation>(DEFAULT_SIMULATION);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const data = await apiFetch<{ simulation: Simulation }>('/api/simulation/');
    setSimulation(data.simulation);
  }, []);

  useEffect(() => {
    void (async () => {
      const ok = await isAuthenticated();
      setAuthorised(ok);
      if (ok) await load().catch((e) => setError((e as Error).message));
      setReady(true);
    })();
  }, [load]);

  const save = useCallback(async (next: Simulation) => {
    // Si scrive subito sul server: è la stessa riga che legge la app iOS, ed è
    // quello che tiene allineati telefono e browser senza altra sincronia.
    setSimulation(next);
    await apiFetch('/api/simulation/', { method: 'PUT', body: JSON.stringify(next) }).catch((e) =>
      setError((e as Error).message),
    );
  }, []);

  if (!ready) return null;

  if (!authorised) {
    return (
      <div className={styles.app}>
        <div className={styles.login}>
          <div className={styles.loginCard}>
            <h2>Accesso</h2>
            <div className={styles.field}>
              <label htmlFor="token">Token</label>
              <input
                id="token"
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
              />
            </div>
            <button
              className={styles.primaryButton}
              onClick={async () => {
                try {
                  await login(tokenInput);
                  setAuthorised(true);
                  await load();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Entra
            </button>
            {error && <p className={styles.error}>{error}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <DashboardShell simulation={simulation} onEdit={() => setEditing(true)} />
      {editing && (
        <SettingsPanel simulation={simulation} onClose={() => setEditing(false)} onChange={save} />
      )}
    </>
  );
}

/** Solo l'impaginazione, tenuta separata dall'accesso e dalle chiamate. */
function DashboardShell({
  simulation,
  onEdit,
}: {
  simulation: Simulation;
  onEdit: () => void;
}) {
  return (
    <div className={styles.app}>
      <Sidebar name={simulation.merchantName} />

      <div className={styles.main}>
        <Topbar />
        <Content simulation={simulation} onEdit={onEdit} />
        <Devbar />
      </div>
    </div>
  );
}

/* ---------- Colonna di sinistra ---------- */

function Sidebar({ name }: { name: string }) {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.account}>
        <span className={styles.avatar}>{name.slice(0, 1).toUpperCase()}</span>
        <span className={styles.accountName}>{name}</span>
        <Icon name="chevronDown" />
      </div>

      {NAV.map((item, index) => (
        <button key={item} className={`${styles.navItem} ${index === 0 ? styles.active : ''}`}>
          <Icon name={item} />
          {item}
        </button>
      ))}

      <div className={styles.groupLabel}>Shortcuts</div>
      {SHORTCUTS.map((item) => (
        <button key={item} className={styles.navItem}>
          <Icon name="clock" />
          {item}
        </button>
      ))}

      <div className={styles.groupLabel}>Products</div>
      {PRODUCTS.map((item) => (
        <button key={item} className={styles.navItem}>
          <Icon name={item} />
          {item}
          <span className={styles.chevron}>
            <Icon name="chevronDown" />
          </span>
        </button>
      ))}
    </aside>
  );
}

function Topbar() {
  return (
    <header className={styles.topbar}>
      <div className={styles.search}>
        <Icon name="search" />
        <input placeholder="Search" />
      </div>

      <div className={styles.topActions}>
        <button className={styles.iconButton}>
          <Icon name="apps" />
        </button>
        <button className={styles.iconButton}>
          <Icon name="help" />
        </button>
        <button className={styles.iconButton}>
          <Icon name="bell" />
          <span className={styles.dot} />
        </button>
        <button className={styles.iconButton}>
          <Icon name="settings" />
        </button>
        <button className={`${styles.iconButton} ${styles.accent}`}>
          <Icon name="plus" />
        </button>
        <button className={styles.setupGuide}>
          Setup guide
          <svg className={styles.ring} viewBox="0 0 20 20">
            <circle cx="10" cy="10" r="8" fill="none" stroke="#d8dee9" strokeWidth="3" />
            <circle
              cx="10"
              cy="10"
              r="8"
              fill="none"
              stroke="#533afe"
              strokeWidth="3"
              strokeDasharray="50 50"
              strokeDashoffset="38"
              transform="rotate(-90 10 10)"
            />
          </svg>
        </button>
      </div>
    </header>
  );
}

function Devbar() {
  return (
    <footer className={styles.devbar}>
      <Icon name="terminal" />
      Developers
      <span className={styles.right}>
        <Icon name="binoculars" />
        <Icon name="warning" />
        <Icon name="arrows" />
        <Icon name="webhook" />
        <Icon name="collapse" />
      </span>
    </footer>
  );
}

/* ---------- Contenuto ---------- */

function Content({ simulation, onEdit }: { simulation: Simulation; onEdit: () => void }) {
  const view = useMemo(() => derive(simulation), [simulation]);
  const currency = simulation.currency;

  return (
    <div className={styles.content}>
      <div className={styles.sectionHead}>
        <h1>Today</h1>
        <button className={`${styles.ghostButton} ${styles.spacer}`}>Pay out funds</button>
      </div>

      <div className={styles.todayStats}>
        <div>
          <div className={styles.statLabel}>
            Net volume <Icon name="chevronDown" />
          </div>
          <div className={styles.statValue}>{money(view.todayNet, currency)}</div>
          <div className={styles.statFoot}>{view.now}</div>
        </div>
        <div>
          <div className={styles.statLabel}>
            {view.comparisonDate} <Icon name="chevronDown" />
          </div>
          <div className={styles.statValue}>{money(view.previousNet, currency)}</div>
        </div>
      </div>

      <div className={styles.todayChart}>
        <TodayChart today={view.todayHours} previous={view.previousHours} />
        <div className={styles.axis}>
          <span>00:00</span>
          <span>00:00</span>
        </div>
      </div>

      <div className={styles.balances}>
        <div>
          <div className={styles.balanceHead}>
            {currency.toUpperCase()} balance <span className={styles.link}>View</span>
          </div>
          <div className={styles.balanceValue}>{money(view.balance, currency)}</div>
        </div>
        <div>
          <div className={styles.balanceHead}>
            {currency.toUpperCase()} payouts <span className={styles.link}>View</span>
          </div>
          <div className={styles.balanceValue}>{money(view.balance, currency)}</div>
          <div className={styles.statFoot}>Expected {view.payoutDate}</div>
        </div>
      </div>

      <div className={styles.sectionHead} style={{ marginTop: 48 }}>
        <h2>Your overview</h2>
      </div>

      <div className={styles.filters}>
        <span className={styles.pill}>
          Date range <span style={{ color: '#c9ced8' }}>|</span> <b>All time</b>
          <Icon name="chevronDown" />
        </span>
        <span className={styles.pill}>
          <b>Monthly</b>
          <Icon name="chevronDown" />
        </span>
        <span className={styles.spacer} />
        <button className={styles.ghostButton}>
          <Icon name="plus" /> Add
        </button>
        <button className={styles.ghostButton} onClick={onEdit}>
          <Icon name="pencil" /> Edit
        </button>
      </div>

      <div className={styles.grid}>
        <PaymentsCard view={view} currency={currency} />

        <ChartCard
          title="Gross volume"
          value={money(view.grossAllTime, currency)}
          values={view.grossMonthly}
          labels={view.grossLabels}
          from={view.rangeFrom}
          to={view.rangeTo}
          updated="Updated 1 second ago"
          action
        />

        <div className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.cardTitle}>MRR</span>
            <span className={styles.info}>
              <Icon name="info" />
            </span>
          </div>
          <div className={styles.empty}>
            <span className={styles.emptyLabel}>No data</span>
          </div>
          <div className={styles.cardFoot}>
            Updated 2 seconds ago
            <span className={styles.link}>More details</span>
          </div>
        </div>

        <ChartCard
          title="Net volume"
          value={money(view.netAllTime, currency)}
          values={view.netMonthly}
          labels={view.netLabels}
          from={view.rangeFrom}
          to={view.rangeTo}
          updated="Updated 3 seconds ago"
        />

        <div className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.cardTitle}>Failed payments</span>
            <span className={styles.info}>
              <Icon name="info" />
            </span>
          </div>
          {view.failed.map((payment) => (
            <div key={payment.id} className={styles.failedRow}>
              <div style={{ minWidth: 0 }}>
                <div className={styles.failedAmount}>{money(payment.amount, currency)}</div>
                <div className={styles.failedMeta}>
                  {shortDate.format(payment.date)}, {timeLabel.format(payment.date)} • {payment.id}
                </div>
              </div>
              <span className={styles.badge}>Failed</span>
            </div>
          ))}
          <div className={styles.cardFoot}>
            <span className={styles.spacer} />
            <span className={styles.link}>View all</span>
          </div>
        </div>

        <ChartCard
          title="New customers"
          value={String(view.customersAllTime)}
          values={view.customersMonthly}
          labels={view.customerLabels}
          from={view.rangeFrom}
          to={view.rangeTo}
          updated="Updated 4 seconds ago"
        />
      </div>
    </div>
  );
}

function PaymentsCard({
  view,
  currency,
}: {
  view: ReturnType<typeof derive>;
  currency: Currency;
}) {
  const rows = [
    { label: 'Succeeded', value: view.breakdown.succeeded, colour: '#9a66ff' },
    { label: 'Uncaptured', value: view.breakdown.uncaptured, colour: '#0055bc' },
    { label: 'Refunded', value: view.breakdown.refunded, colour: '#3ba0c4' },
    { label: 'Blocked', value: view.breakdown.blocked, colour: '#ed6702' },
    { label: 'Failed', value: view.breakdown.failed, colour: '#b3093c' },
  ];
  const total = rows.reduce((sum, row) => sum + row.value, 0) || 1;

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.cardTitle}>Payments</span>
        <span className={styles.info}>
          <Icon name="info" />
        </span>
        <span className={styles.cardLink}>{view.rangeLabel}</span>
      </div>

      <div className={styles.stack}>
        {rows
          .filter((row) => row.value > 0)
          .map((row) => (
            <span
              key={row.label}
              style={{ background: row.colour, width: `${(row.value / total) * 100}%` }}
            />
          ))}
      </div>

      {rows.map((row) => (
        <div key={row.label} className={styles.legendRow}>
          <span className={styles.bullet} style={{ background: row.colour }} />
          {row.label}
          <span className={styles.legendValue}>{money(row.value, currency)}</span>
        </div>
      ))}

      <div className={styles.cardFoot}>
        Updated 00:00
        <span className={styles.link}>View all</span>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  value,
  values,
  labels,
  from,
  to,
  updated,
  action = false,
}: {
  title: string;
  value: string;
  values: number[];
  labels: string[];
  from: string;
  to: string;
  updated: string;
  action?: boolean;
}) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.cardTitle}>{title}</span>
        <span className={styles.info}>
          <Icon name="info" />
        </span>
        <span className={styles.spacer} />
        <button className={styles.iconButton}>
          <Icon name="share" />
        </button>
        {action && (
          <button className={styles.iconButton}>
            <Icon name="binoculars" />
          </button>
        )}
      </div>

      <div className={styles.cardValue}>{value}</div>
      <CardChart values={values} labels={labels} from={from} to={to} />

      <div className={styles.cardFoot}>
        {updated}
        <span className={styles.link}>More details</span>
      </div>
    </div>
  );
}

/* ---------- Dai numeri della simulazione a quelli della pagina ---------- */

function derive(simulation: Simulation) {
  const span = Math.max(2, simulation.businessDays);
  const now = new Date();

  const today = day(simulation, 0);
  const yesterday = day(simulation, 1);

  const allTime = totals(simulation, 0, span - 1);
  const breakdown = paymentBreakdown(simulation, 0, span - 1);

  const daily = dailyGross(simulation, 0, span - 1);
  const grossMonthly = series(daily, 18);
  const netMonthly = grossMonthly.map((value) => net(simulation, value));

  const customersDaily: number[] = [];
  for (let offset = span - 1; offset >= 0; offset -= 1) {
    customersDaily.push(customerCount(simulation, day(simulation, offset)));
  }
  const customersMonthly = series(customersDaily, 18);

  const currency = simulation.currency;
  const axis = (values: number[], formatter: (value: number) => string) => {
    const max = Math.max(...values, 1);
    return [4, 3, 2, 1, 0].map((step) => formatter((max / 4) * step));
  };

  const payout = new Date();
  payout.setDate(payout.getDate() + 2);

  return {
    now: timeLabel.format(now),
    todayNet: net(simulation, today.gross),
    previousNet: net(simulation, yesterday.gross),
    comparisonDate: longDate.format(daysAgo(1)),
    todayHours: cumulativeByHour(simulation, 0, now.getHours()),
    previousHours: cumulativeByHour(simulation, 1, 23),

    balance: net(simulation, today.gross + yesterday.gross),
    payoutDate: shortDate.format(payout),

    grossAllTime: allTime.gross,
    netAllTime: allTime.net,
    customersAllTime: allTime.customers,
    breakdown,

    grossMonthly,
    netMonthly,
    customersMonthly,
    grossLabels: axis(grossMonthly, (v) => compactMoney(v, currency)),
    netLabels: axis(netMonthly, (v) => compactMoney(v, currency)),
    customerLabels: axis(customersMonthly, (v) => String(Math.round(v))),

    rangeFrom: monthLabel.format(daysAgo(span - 1)),
    rangeTo: monthLabel.format(now),
    rangeLabel: `${longDate.format(daysAgo(span - 1))} - Today`,

    failed: failedPayments(simulation, 4),
  };
}

/* ---------- Pannello delle impostazioni ---------- */

function SettingsPanel({
  simulation,
  onClose,
  onChange,
}: {
  simulation: Simulation;
  onClose: () => void;
  onChange: (next: Simulation) => void;
}) {
  const [draft, setDraft] = useState(simulation);

  const set = <K extends keyof Simulation>(key: K, value: Simulation[K]) =>
    setDraft({ ...draft, [key]: value });

  const toggleAmount = (amount: number) => {
    const has = draft.paymentAmounts.includes(amount);
    if (has && draft.paymentAmounts.length === 1) return;
    set(
      'paymentAmounts',
      has
        ? draft.paymentAmounts.filter((a) => a !== amount)
        : [...draft.paymentAmounts, amount].sort((a, b) => a - b),
    );
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <h2>Simulazione</h2>
        <p className={styles.panelHint}>
          Le stesse impostazioni della app iOS: si salvano sul server, e il telefono le trova già
          cambiate.
        </p>

        <div className={styles.field}>
          <label htmlFor="name">Nome</label>
          <input
            id="name"
            value={draft.merchantName}
            onChange={(e) => set('merchantName', e.target.value)}
          />
          <div className={styles.amounts} style={{ marginTop: 8 }}>
            {SUGGESTED_NAMES.map((name) => (
              <button key={name} className={styles.amountChip} onClick={() => set('merchantName', name)}>
                {name}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="currency">Valuta</label>
          <select
            id="currency"
            value={draft.currency}
            onChange={(e) => set('currency', e.target.value as Currency)}
          >
            <option value="usd">Dollaro</option>
            <option value="eur">Euro</option>
            <option value="gbp">Sterlina</option>
            <option value="aed">Dirham (AED)</option>
          </select>
        </div>

        <div className={styles.pair}>
          <div className={styles.field}>
            <label htmlFor="min">Incasso al giorno, da</label>
            <input
              id="min"
              type="number"
              value={draft.dailyMin}
              onChange={(e) => set('dailyMin', Number(e.target.value))}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="max">a</label>
            <input
              id="max"
              type="number"
              value={draft.dailyMax}
              onChange={(e) => set('dailyMax', Number(e.target.value))}
            />
          </div>
        </div>

        <div className={styles.field}>
          <label>Importi dei pagamenti</label>
          <div className={styles.amounts}>
            {PRESET_AMOUNTS.map((amount) => (
              <button
                key={amount}
                className={`${styles.amountChip} ${draft.paymentAmounts.includes(amount) ? styles.on : ''}`}
                onClick={() => toggleAmount(amount)}
              >
                {money(amount, draft.currency)}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.pair}>
          <div className={styles.field}>
            <label htmlFor="net">Netto più basso del %</label>
            <input
              id="net"
              type="number"
              value={draft.netDeductionPercent}
              onChange={(e) => set('netDeductionPercent', Number(e.target.value))}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="repeatMin">Upsell da %</label>
            <input
              id="repeatMin"
              type="number"
              value={draft.repeatMinPercent ?? 40}
              onChange={(e) => set('repeatMinPercent', Number(e.target.value))}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="repeatMax">a %</label>
            <input
              id="repeatMax"
              type="number"
              value={draft.repeatMaxPercent ?? 80}
              onChange={(e) => set('repeatMaxPercent', Number(e.target.value))}
            />
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="days">Attività aperta da (giorni)</label>
          <input
            id="days"
            type="number"
            value={draft.businessDays}
            onChange={(e) => set('businessDays', Number(e.target.value))}
          />
        </div>

        <div className={styles.panelActions}>
          <button
            className={styles.ghostButton}
            onClick={() => set('seed', Math.floor(Math.random() * 1_000_000_000))}
          >
            Rigenera i numeri
          </button>
          <button
            className={styles.primaryButton}
            onClick={() => {
              onChange(draft);
              onClose();
            }}
          >
            Salva
          </button>
        </div>
      </div>
    </div>
  );
}
