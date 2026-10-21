const { Router } = require('express');
const prisma = require('../db');
const asyncHandler = require('../lib/asyncHandler');
const ApiError = require('../lib/ApiError');
const { authenticate, requireRole } = require('../middleware/authenticate');

const router = Router();

// Analytics expose operational data for the whole hospital: administrators only.
router.use(authenticate, requireRole('administrator'));

// Kenya is UTC+3 all year (no daylight saving). Days and hours are grouped in
// local time, otherwise a ticket registered at 00:30 would count for the
// previous day on a server running in UTC.
const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ACTIVE_STATUSES = ['pending', 'checked_in', 'triaged', 'in_progress', 'referred'];
const WAIT_BUCKETS = [
  { label: '0-5 min', max: 5 },
  { label: '5-15 min', max: 15 },
  { label: '15-30 min', max: 30 },
  { label: '30-60 min', max: 60 },
  { label: '60+ min', max: Infinity },
];

const toEat = (d) => new Date(new Date(d).getTime() + EAT_OFFSET_MS);
const dateKey = (d) => toEat(d).toISOString().slice(0, 10);
const eatStamp = (d) => (d ? toEat(d).toISOString().replace('T', ' ').slice(0, 16) : '');
const minutesBetween = (a, b) => (a && b ? (new Date(b) - new Date(a)) / 60000 : null);
const isDuration = (n) => n != null && Number.isFinite(n) && n >= 0;
const round1 = (n) => Math.round(n * 10) / 10;
const avg = (xs) => (xs.length ? round1(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return round1(s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2);
};
const pct = (part, whole) => (whole ? round1((part / whole) * 100) : 0);

function parseDay(value, fallback) {
  if (!value) return fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError(400, 'from and to must look like 2026-10-31');
  return value;
}

function dayKeys(fromKey, toKey) {
  const keys = [];
  for (let d = new Date(`${fromKey}T00:00:00Z`); d <= new Date(`${toKey}T00:00:00Z`); d = new Date(d.getTime() + DAY_MS)) {
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

// Increment a counter in a Map.
const bump = (map, key, by = 1) => map.set(key, (map.get(key) || 0) + by);

// GET /api/analytics?from=2026-10-01&to=2026-10-31[&detail=1]
// Everything is computed for tickets REGISTERED in the range. With detail=1 the
// response also lists one anonymised row per ticket (no patient names or phone
// numbers) for the CSV export.
//
// Definitions
//   wait     time from joining a staff member's queue to being called. For the
//            first stop that is check-in; for a referral it is the referral.
//   service  time from start to complete.
//   visit    registration to completion.
//   reception delay  registration to check-in.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const toKey = parseDay(req.query.to, dateKey(new Date()));
    const fromKey = parseDay(req.query.from, dateKey(new Date(Date.now() - 29 * DAY_MS)));
    const from = new Date(`${fromKey}T00:00:00+03:00`);
    const to = new Date(`${toKey}T23:59:59.999+03:00`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new ApiError(400, 'Invalid date');
    if (from > to) throw new ApiError(400, 'from must be on or before to');
    if ((to - from) / DAY_MS > MAX_RANGE_DAYS) throw new ApiError(400, `Choose a range of at most ${MAX_RANGE_DAYS} days`);

    const tickets = await prisma.ticket.findMany({
      where: { createdAt: { gte: from, lte: to } },
      orderBy: { ticketNumber: 'asc' },
      include: {
        serviceType: { select: { serviceName: true } },
        department: { select: { departmentName: true } },
        services: {
          orderBy: { serviceId: 'asc' },
          include: {
            facilitator: {
              select: {
                facilitatorId: true,
                facilitatorName: true,
                role: true,
                department: { select: { departmentName: true } },
              },
            },
          },
        },
      },
    });

    const days = new Map(dayKeys(fromKey, toKey).map((k) => [k, { date: k, created: 0, completed: 0, cancelled: 0, waits: [] }]));
    const hourly = Array(24).fill(0);
    const weekday = Array(7).fill(0);
    const byChannel = new Map();
    const byStatus = new Map();
    const byServiceType = new Map();
    const byDept = new Map(); // department -> { services, waits, durations }
    const byStaff = new Map(); // facilitatorId -> { name, role, department, served, waits, durations }

    const waits = [];
    const serviceTimes = [];
    const visits = [];
    const receptionDelays = [];
    let servicesTotal = 0;
    const patients = new Set();
    const rows = [];

    for (const t of tickets) {
      patients.add(t.patientId);
      const day = days.get(dateKey(t.createdAt));
      const eat = toEat(t.createdAt);
      hourly[eat.getUTCHours()] += 1;
      weekday[eat.getUTCDay()] += 1;
      bump(byChannel, t.channel);
      bump(byStatus, t.status);
      bump(byServiceType, t.serviceType?.serviceName || 'Unknown');
      if (day) {
        day.created += 1;
        if (t.status === 'completed') day.completed += 1;
        if (t.status === 'cancelled') day.cancelled += 1;
      }

      const reception = minutesBetween(t.createdAt, t.checkedInAt);
      if (isDuration(reception)) receptionDelays.push(reception);
      const visit = minutesBetween(t.createdAt, t.completedAt);
      if (isDuration(visit)) visits.push(visit);

      let ticketWait = 0;
      let ticketService = 0;
      let hasWait = false;
      let hasService = false;

      t.services.forEach((s, i) => {
        servicesTotal += 1;
        const queueStart = i === 0 ? t.checkedInAt || s.createdAt : s.createdAt;
        const wait = minutesBetween(queueStart, s.startedAt);
        const duration = minutesBetween(s.startedAt, s.completedAt);
        const dept = s.facilitator?.department?.departmentName || 'Unknown';

        const d = byDept.get(dept) || { services: 0, waits: [], durations: [] };
        d.services += 1;
        byDept.set(dept, d);

        const f = byStaff.get(s.facilitatorId) || {
          name: s.facilitator?.facilitatorName || `Staff #${s.facilitatorId}`,
          role: s.facilitator?.role || '',
          department: dept,
          served: 0,
          waits: [],
          durations: [],
        };
        byStaff.set(s.facilitatorId, f);

        if (isDuration(wait)) {
          waits.push(wait);
          d.waits.push(wait);
          f.waits.push(wait);
          if (day) day.waits.push(wait);
          ticketWait += wait;
          hasWait = true;
        }
        if (isDuration(duration)) {
          serviceTimes.push(duration);
          d.durations.push(duration);
          f.durations.push(duration);
          ticketService += duration;
          hasService = true;
        }
        if (s.completionStatus === 'completed') f.served += 1;
      });

      if (req.query.detail === '1') {
        rows.push({
          ticketNumber: t.ticketNumber,
          registeredAt: eatStamp(t.createdAt),
          channel: t.channel,
          serviceType: t.serviceType?.serviceName || '',
          department: t.department?.departmentName || '',
          status: t.status,
          receptionDelayMin: isDuration(reception) ? round1(reception) : '',
          waitMin: hasWait ? round1(ticketWait) : '',
          serviceMin: hasService ? round1(ticketService) : '',
          visitMin: isDuration(visit) ? round1(visit) : '',
          stops: t.services.length,
          staff: t.services.map((s) => s.facilitator?.facilitatorName).filter(Boolean).join(' > '),
        });
      }
    }

    const total = tickets.length;
    const completed = byStatus.get('completed') || 0;
    const cancelled = byStatus.get('cancelled') || 0;
    const active = ACTIVE_STATUSES.reduce((sum, s) => sum + (byStatus.get(s) || 0), 0);
    const peak = hourly.indexOf(Math.max(...hourly));
    const busiest = weekday.indexOf(Math.max(...weekday));
    const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`;

    const response = {
      range: { from: fromKey, to: toKey },
      summary: {
        totalTickets: total,
        uniquePatients: patients.size,
        completed,
        cancelled,
        inProgress: active,
        completionRate: pct(completed, total),
        cancellationRate: pct(cancelled, total),
        avgWaitMin: avg(waits),
        medianWaitMin: median(waits),
        maxWaitMin: waits.length ? round1(Math.max(...waits)) : null,
        avgServiceMin: avg(serviceTimes),
        avgVisitMin: avg(visits),
        avgReceptionDelayMin: avg(receptionDelays),
        peakHour: total ? hourLabel(peak) : null,
        busiestDay: total ? DAY_NAMES[busiest] : null,
      },
      byDay: [...days.values()].map((d) => ({
        date: d.date,
        created: d.created,
        completed: d.completed,
        cancelled: d.cancelled,
        avgWaitMin: avg(d.waits),
      })),
      byHour: hourly.map((count, h) => ({ hour: hourLabel(h), tickets: count })),
      byWeekday: weekday.map((count, i) => ({ day: DAY_NAMES[i], tickets: count })),
      waitDistribution: WAIT_BUCKETS.map((b, i) => {
        const lower = i === 0 ? 0 : WAIT_BUCKETS[i - 1].max;
        return { bucket: b.label, count: waits.filter((w) => w >= lower && w < b.max).length };
      }),
      byDepartment: [...byDept.entries()]
        .map(([department, d]) => ({
          department,
          visits: d.services,
          avgWaitMin: avg(d.waits),
          avgServiceMin: avg(d.durations),
        }))
        .sort((a, b) => b.visits - a.visits),
      byServiceType: [...byServiceType.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      byChannel: [...byChannel.entries()].map(([name, value]) => ({ name, value })),
      byStatus: [...byStatus.entries()].map(([name, value]) => ({ name, value })),
      staff: [...byStaff.values()]
        .map((f) => ({
          name: f.name,
          role: f.role,
          department: f.department,
          served: f.served,
          avgServiceMin: avg(f.durations),
          avgWaitMin: avg(f.waits),
        }))
        .sort((a, b) => b.served - a.served),
      dataQuality: {
        services: servicesTotal,
        withWaitTime: waits.length,
        withServiceTime: serviceTimes.length,
      },
    };
    if (req.query.detail === '1') response.tickets = rows;

    res.json(response);
  })
);

module.exports = router;