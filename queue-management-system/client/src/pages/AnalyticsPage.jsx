import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import './Analytics.css';

const COLORS = {
  blue: '#2563eb',
  teal: '#0d9488',
  amber: '#d97706',
  red: '#dc2626',
  purple: '#7c3aed',
  grey: '#6b7280',
};
const PIE_COLORS = [COLORS.blue, COLORS.teal, COLORS.amber, COLORS.purple, COLORS.red, COLORS.grey];
const ROLE_LABEL = { doctor: 'Doctor', labstaff: 'Lab staff', pharmacist: 'Pharmacist' };
const STATUS_LABEL = {
  pending: 'Awaiting check-in',
  checked_in: 'Checked in',
  triaged: 'Triaged',
  in_progress: 'In progress',
  referred: 'Referred',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

// ---------- formatting ----------

function fmtMin(n) {
  if (n == null) return '—';
  if (n < 60) return `${n} min`;
  return `${Math.floor(n / 60)}h ${Math.round(n % 60)}m`;
}

const minTooltip = (v) => (v == null ? '—' : `${v} min`);

function localDateKey(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

function lastDays(n) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (n - 1));
  return { from: localDateKey(from), to: localDateKey(to) };
}

// ---------- CSV export ----------

const csvCell = (v) => {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvLine = (cells) => cells.map(csvCell).join(',');

function section(out, title, headers, rows) {
  out.push('', csvLine([title]), csvLine(headers));
  rows.forEach((r) => out.push(csvLine(r)));
}

export function buildSummaryCsv(data) {
  const s = data.summary;
  const out = [
    csvLine(['Queue Management System - analytics report']),
    csvLine(['Period (Kenya time)', data.range.from, 'to', data.range.to]),
    csvLine(['Generated', new Date().toLocaleString()]),
  ];
  section(out, 'Summary', ['Metric', 'Value'], [
    ['Tickets registered', s.totalTickets],
    ['Unique patients', s.uniquePatients],
    ['Completed', s.completed],
    ['Cancelled', s.cancelled],
    ['Still in the system', s.inProgress],
    ['Completion rate (%)', s.completionRate],
    ['Cancellation rate (%)', s.cancellationRate],
    ['Average wait (min)', s.avgWaitMin],
    ['Median wait (min)', s.medianWaitMin],
    ['Longest wait (min)', s.maxWaitMin],
    ['Average service time (min)', s.avgServiceMin],
    ['Average total visit (min)', s.avgVisitMin],
    ['Average delay before check-in (min)', s.avgReceptionDelayMin],
    ['Peak hour', s.peakHour],
    ['Busiest day of week', s.busiestDay],
  ]);
  section(out, 'Tickets per day', ['Date', 'Registered', 'Completed', 'Cancelled', 'Avg wait (min)'],
    data.byDay.map((d) => [d.date, d.created, d.completed, d.cancelled, d.avgWaitMin]));
  section(out, 'Tickets by hour of day', ['Hour', 'Tickets'], data.byHour.map((h) => [h.hour, h.tickets]));
  section(out, 'Tickets by day of week', ['Day', 'Tickets'], data.byWeekday.map((d) => [d.day, d.tickets]));
  section(out, 'Wait time distribution', ['Wait', 'Visits'], data.waitDistribution.map((b) => [b.bucket, b.count]));
  section(out, 'By department', ['Department', 'Visits', 'Avg wait (min)', 'Avg service (min)'],
    data.byDepartment.map((d) => [d.department, d.visits, d.avgWaitMin, d.avgServiceMin]));
  section(out, 'By service type', ['Service', 'Tickets'], data.byServiceType.map((x) => [x.name, x.value]));
  section(out, 'By channel', ['Channel', 'Tickets'], data.byChannel.map((x) => [x.name, x.value]));
  section(out, 'By status', ['Status', 'Tickets'], data.byStatus.map((x) => [STATUS_LABEL[x.name] || x.name, x.value]));
  section(out, 'Staff', ['Name', 'Role', 'Department', 'Patients served', 'Avg service (min)', 'Avg wait (min)'],
    data.staff.map((f) => [f.name, ROLE_LABEL[f.role] || f.role, f.department, f.served, f.avgServiceMin, f.avgWaitMin]));
  return out.join('\r\n');
}

export function buildTicketsCsv(rows) {
  if (!rows.length) return 'No tickets in this period';
  const headers = Object.keys(rows[0]);
  return [csvLine(headers), ...rows.map((r) => csvLine(headers.map((h) => r[h])))].join('\r\n');
}

function downloadCsv(text, filename) {
  // The BOM makes Excel read the file as UTF-8.
  const blob = new Blob([`\ufeff${text}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------- small building blocks ----------

function Kpi({ label, value, hint }) {
  return (
    <div className="an-kpi">
      <div className="an-kpi-label">{label}</div>
      <div className="an-kpi-value">{value}</div>
      {hint && <div className="an-kpi-hint">{hint}</div>}
    </div>
  );
}

function ChartCard({ title, empty, children }) {
  return (
    <section className="card an-card">
      <h3>{title}</h3>
      {empty ? (
        <p className="an-empty">No data for this period.</p>
      ) : (
        <div className="an-chart">
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function DonutChart({ data, labelMap = {} }) {
  const named = data.map((d) => ({ ...d, name: labelMap[d.name] || d.name }));
  return (
    <PieChart>
      <Pie data={named} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2} isAnimationActive={false}>
        {named.map((_, i) => (
          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
        ))}
      </Pie>
      <Tooltip />
      <Legend />
    </PieChart>
  );
}

// ---------- the report itself (pure display, so it can be tested with sample data) ----------

export function AnalyticsView({ data }) {
  const s = data.summary;
  const dq = data.dataQuality;
  const shortDate = (d) => d.slice(5); // 2026-10-21 -> 10-21
  const hasWaits = data.byDay.some((d) => d.avgWaitMin != null);

  if (s.totalTickets === 0) {
    return (
      <section className="card">
        <p className="an-empty">No tickets were registered in this period.</p>
      </section>
    );
  }

  return (
    <>
      {dq.services === 0 && (
        <p className="an-note">
          No tickets have been routed to staff yet, so wait and service times can't be calculated.
        </p>
      )}
      {dq.services > 0 && dq.withWaitTime === 0 && (
        <p className="an-note">
          Wait and service times are recorded from the moment timestamps were added to the system. Tickets
          processed before then have none. Process a few new tickets, or load the demo data, to see them.
        </p>
      )}

      <div className="an-kpis">
        <Kpi label="Tickets registered" value={s.totalTickets} hint={`${s.uniquePatients} unique patients`} />
        <Kpi label="Completed" value={s.completed} hint={`${s.completionRate}% of tickets`} />
        <Kpi label="Cancelled" value={s.cancelled} hint={`${s.cancellationRate}% of tickets`} />
        <Kpi label="Avg wait" value={fmtMin(s.avgWaitMin)} hint={`median ${fmtMin(s.medianWaitMin)}, longest ${fmtMin(s.maxWaitMin)}`} />
        <Kpi label="Avg service time" value={fmtMin(s.avgServiceMin)} hint="start to finish with staff" />
        <Kpi label="Avg total visit" value={fmtMin(s.avgVisitMin)} hint="registration to completion" />
        <Kpi label="Delay before check-in" value={fmtMin(s.avgReceptionDelayMin)} hint="registration to reception" />
        <Kpi label="Peak hour" value={s.peakHour || '—'} hint={s.busiestDay ? `busiest day: ${s.busiestDay}` : undefined} />
      </div>

      <div className="an-grid">
        <ChartCard title="Patients per day (by registration date)">
          <LineChart data={data.byDay} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={24} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="created" name="Registered" stroke={COLORS.blue} dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="completed" name="Completed" stroke={COLORS.teal} dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="cancelled" name="Cancelled" stroke={COLORS.red} dot={false} strokeWidth={2} />
          </LineChart>
        </ChartCard>

        <ChartCard title="Average wait by day (minutes)" empty={!hasWaits}>
          <LineChart data={data.byDay} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={24} />
            <YAxis />
            <Tooltip formatter={minTooltip} />
            <Line type="monotone" dataKey="avgWaitMin" name="Avg wait" stroke={COLORS.amber} strokeWidth={2} connectNulls dot={false} />
          </LineChart>
        </ChartCard>

        <ChartCard title="Busiest hours (Kenya time)">
          <BarChart data={data.byHour} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="hour" interval={1} tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="tickets" name="Tickets" fill={COLORS.blue} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Busiest days of the week">
          <BarChart data={data.byWeekday} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="tickets" name="Tickets" fill={COLORS.purple} />
          </BarChart>
        </ChartCard>

        <ChartCard title="How long patients wait" empty={dq.withWaitTime === 0}>
          <BarChart data={data.waitDistribution} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="bucket" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" name="Visits" fill={COLORS.amber} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Wait vs service time by department (minutes)" empty={data.byDepartment.length === 0}>
          <BarChart data={data.byDepartment} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="department" tick={{ fontSize: 11 }} />
            <YAxis />
            <Tooltip formatter={minTooltip} />
            <Legend />
            <Bar dataKey="avgWaitMin" name="Avg wait" fill={COLORS.amber} />
            <Bar dataKey="avgServiceMin" name="Avg service" fill={COLORS.teal} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Tickets by service type" empty={data.byServiceType.length === 0}>
          <BarChart data={data.byServiceType} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" allowDecimals={false} />
            <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="value" name="Tickets" fill={COLORS.teal} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Registration channel" empty={data.byChannel.length === 0}>
          <DonutChart data={data.byChannel} />
        </ChartCard>

        <ChartCard title="Where tickets stand now" empty={data.byStatus.length === 0}>
          <DonutChart data={data.byStatus} labelMap={STATUS_LABEL} />
        </ChartCard>
      </div>

      <section className="card an-card">
        <h3>Staff performance</h3>
        {data.staff.length === 0 ? (
          <p className="an-empty">No staff activity in this period.</p>
        ) : (
          <table className="queue-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Department</th>
                <th>Patients served</th>
                <th>Avg service time</th>
                <th>Avg wait of their patients</th>
              </tr>
            </thead>
            <tbody>
              {data.staff.map((f) => (
                <tr key={`${f.name}-${f.department}`}>
                  <td>{f.name}</td>
                  <td>{ROLE_LABEL[f.role] || f.role}</td>
                  <td>{f.department}</td>
                  <td>{f.served}</td>
                  <td>{fmtMin(f.avgServiceMin)}</td>
                  <td>{fmtMin(f.avgWaitMin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

// ---------- the page: date range, loading, downloads ----------

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [range, setRange] = useState(() => lastDays(30));
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [exporting, setExporting] = useState(false);

  const isAdmin = user?.staffType === 'administrator';

  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get(`/api/analytics?from=${range.from}&to=${range.to}`)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, reloadKey, isAdmin]);

  if (!isAdmin) {
    return (
      <div className="page">
        <main className="content">
          <section className="card">
            <p>Analytics are available to administrators only.</p>
          </section>
        </main>
      </div>
    );
  }

  const filename = (kind) => `queue-${kind}_${range.from}_to_${range.to}.csv`;

  async function handleTicketsCsv() {
    setExporting(true);
    setError(null);
    try {
      const detail = await api.get(`/api/analytics?from=${range.from}&to=${range.to}&detail=1`);
      downloadCsv(buildTicketsCsv(detail.tickets || []), filename('tickets'));
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  const presetDays = [7, 30, 90];
  const isPreset = (n) => {
    const p = lastDays(n);
    return p.from === range.from && p.to === range.to;
  };

  return (
    <div className="page an-page">
      <main className="content">
        <div className="an-header">
          <div>
            <h1>Analytics</h1>
            <p className="subtitle">
              {range.from} to {range.to} · times in Kenya time
            </p>
          </div>

          <div className="an-controls no-print">
            {presetDays.map((n) => (
              <button key={n} className={isPreset(n) ? 'an-active' : ''} onClick={() => setRange(lastDays(n))}>
                Last {n} days
              </button>
            ))}
            <label>
              From
              <input
                type="date"
                value={range.from}
                max={range.to}
                onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={range.to}
                min={range.from}
                onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))}
              />
            </label>
            <button onClick={() => setReloadKey((k) => k + 1)} disabled={loading}>
              Refresh
            </button>
           
            
            <button onClick={() => window.print()} disabled={!data}>
              Print / Save as PDF
            </button>
          </div>
        </div>

        {error && <p className="error">{error}</p>}
        {loading && !data && <p>Loading…</p>}
        {data && <AnalyticsView data={data} />}
      </main>
    </div>
  );
}
