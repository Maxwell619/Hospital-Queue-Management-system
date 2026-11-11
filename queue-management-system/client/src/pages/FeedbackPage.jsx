import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import './Analytics.css'; 

const RATING_COLORS = { 1: '#dc2626', 2: '#ea580c', 3: '#d97706', 4: '#65a30d', 5: '#16a34a' };
const RATING_LABELS = { 1: 'Very poor', 2: 'Poor', 3: 'Okay', 4: 'Good', 5: 'Excellent' };
const ROLE_LABEL = { doctor: 'Doctor', labstaff: 'Lab staff', pharmacist: 'Pharmacist' };
const CHANNEL_LABEL = { web: 'Web', ussd: 'USSD' };

const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

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

// ---------- CSV ----------

const csvCell = (v) => {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function buildFeedbackCsv(items) {
  const headers = ['Submitted (Kenya time)', 'Ticket', 'Rating', 'Comment', 'Channel', 'Department', 'Service', 'Staff'];
  const lines = items.map((i) =>
    [i.submittedAt, i.ticketNumber, i.rating, i.comment, i.channel, i.department, i.service, i.staff]
      .map(csvCell)
      .join(',')
  );
  return [headers.map(csvCell).join(','), ...lines].join('\r\n');
}

function downloadCsv(text, filename) {
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

// ---------- display ----------

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

export function FeedbackView({ data }) {
  const s = data.summary;
  const shortDate = (d) => d.slice(5);

  if (s.total === 0) {
    return (
      <section className="card">
        <p className="an-empty">No feedback was received in this period.</p>
      </section>
    );
  }

  const distribution = s.distribution.map((d) => ({ ...d, label: `${d.rating} ★` }));

  return (
    <>
      <div className="an-kpis">
        <Kpi label="Responses" value={s.total} hint={s.byChannel.map((c) => `${c.value} ${CHANNEL_LABEL[c.name] || c.name}`).join(', ')} />
        <Kpi
          label="Average rating"
          value={s.averageRating != null ? `${s.averageRating} / 5` : '—'}
          hint={s.averageRating != null ? stars(Math.round(s.averageRating)) : undefined}
        />
        <Kpi
          label="Response rate"
          value={s.responseRate != null ? `${s.responseRate}%` : '—'}
          hint={`of ${s.completedTickets} completed visits`}
        />
        <Kpi label="With a comment" value={s.withComments} hint={`${s.total ? Math.round((s.withComments / s.total) * 100) : 0}% of responses`} />
      </div>

      <div className="an-grid">
        <ChartCard title="How patients rated their visit">
          <BarChart data={distribution} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" name="Responses">
              {distribution.map((d) => (
                <Cell key={d.rating} fill={RATING_COLORS[d.rating]} />
              ))}
            </Bar>
          </BarChart>
        </ChartCard>

        <ChartCard title="Average rating by department" empty={data.byDepartment.length === 0}>
          <BarChart data={data.byDepartment} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="department" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 5]} />
            <Tooltip />
            <Bar dataKey="avgRating" name="Avg rating" fill="#2563eb" />
          </BarChart>
        </ChartCard>

        <ChartCard title="Average rating by day" empty={!data.byDay.some((d) => d.avgRating != null)}>
          <LineChart data={data.byDay} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={24} />
            <YAxis domain={[1, 5]} />
            <Tooltip />
            <Line type="monotone" dataKey="avgRating" name="Avg rating" stroke="#7c3aed" strokeWidth={2} connectNulls dot={false} />
          </LineChart>
        </ChartCard>
      </div>

      {data.byStaff.length > 0 && (
        <section className="card an-card" style={{ marginBottom: '1rem' }}>
          <h3>Ratings by staff member</h3>
          <table className="queue-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Responses</th>
                <th>Average rating</th>
              </tr>
            </thead>
            <tbody>
              {data.byStaff.map((p) => (
                <tr key={p.name}>
                  <td>{p.name}</td>
                  <td>{ROLE_LABEL[p.role] || p.role}</td>
                  <td>{p.count}</td>
                  <td>
                    {p.avgRating} {stars(Math.round(p.avgRating))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card an-card">
        <h3>Individual responses</h3>
        {data.items.length === 0 ? (
          <p className="an-empty">No responses match these filters.</p>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="queue-table">
                <thead>
                  <tr>
                    <th>Submitted</th>
                    <th>Ticket</th>
                    <th>Rating</th>
                    <th>Comment</th>
                    <th>Channel</th>
                    <th>Department</th>
                    <th>Staff</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((i) => (
                    <tr key={i.feedbackId}>
                      <td>{i.submittedAt}</td>
                      <td>#{i.ticketNumber}</td>
                      <td title={RATING_LABELS[i.rating]} style={{ whiteSpace: 'nowrap' }}>
                        {stars(i.rating)}
                      </td>
                      <td>{i.comment || <span style={{ color: '#999' }}>—</span>}</td>
                      <td>{CHANNEL_LABEL[i.channel] || i.channel}</td>
                      <td>{i.department}</td>
                      <td>{i.staff || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.itemsTotal > data.items.length && (
              <p style={{ fontSize: '0.85rem', color: '#666' }}>
                Showing the latest {data.items.length} of {data.itemsTotal}. Download the CSV to get them all.
              </p>
            )}
          </>
        )}
      </section>
    </>
  );
}

// ---------- page ----------

export default function FeedbackPage() {
  const { user } = useAuth();
  const [range, setRange] = useState(() => lastDays(30));
  const [ratingFilter, setRatingFilter] = useState('');
  const [commentsOnly, setCommentsOnly] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [exporting, setExporting] = useState(false);

  const isAdmin = user?.staffType === 'administrator';

  const query = (extra = '') =>
    `/api/feedback?from=${range.from}&to=${range.to}` +
    `${ratingFilter ? `&rating=${ratingFilter}` : ''}${commentsOnly ? '&comments=1' : ''}${extra}`;

  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get(query())
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, ratingFilter, commentsOnly, reloadKey, isAdmin]);

  if (!isAdmin) {
    return (
      <div className="page">
        <main className="content">
          <section className="card">
            <p>Patient feedback is available to administrators only.</p>
          </section>
        </main>
      </div>
    );
  }

  async function handleCsv() {
    setExporting(true);
    setError(null);
    try {
      const all = await api.get(query('&limit=5000'));
      downloadCsv(buildFeedbackCsv(all.items), `queue-feedback_${range.from}_to_${range.to}.csv`);
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  const isPreset = (n) => {
    const p = lastDays(n);
    return p.from === range.from && p.to === range.to;
  };

  return (
    <div className="page an-page">
      <main className="content">
        <div className="an-header">
          <div>
            <h1>Patient feedback</h1>
            <p className="subtitle">
              {range.from} to {range.to} · times in Kenya time
            </p>
          </div>

          <div className="an-controls no-print">
            {[7, 30, 90].map((n) => (
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
            <label>
              Rating
              <select value={ratingFilter} onChange={(e) => setRatingFilter(e.target.value)} style={{ margin: 0, width: 'auto' }}>
                <option value="">All</option>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} ★
                  </option>
                ))}
              </select>
            </label>
            <label>
              <input type="checkbox" checked={commentsOnly} onChange={(e) => setCommentsOnly(e.target.checked)} style={{ width: 'auto', margin: 0 }} />
              With comments only
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
        {data && <FeedbackView data={data} />}
      </main>
    </div>
  );
}
