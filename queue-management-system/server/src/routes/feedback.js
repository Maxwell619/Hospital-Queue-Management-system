const { Router } = require('express');
const prisma = require('../db');
const asyncHandler = require('../lib/asyncHandler');
const ApiError = require('../lib/ApiError');
const { authenticate, requireRole } = require('../middleware/authenticate');

const router = Router();

// Reading patient feedback is for administrators only.
router.use(authenticate, requireRole('administrator'));

// Same Kenya-time handling as the analytics route (UTC+3, no daylight saving).
const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 5000;

const toEat = (d) => new Date(new Date(d).getTime() + EAT_OFFSET_MS);
const dateKey = (d) => toEat(d).toISOString().slice(0, 10);
const eatStamp = (d) => toEat(d).toISOString().replace('T', ' ').slice(0, 16);
const round1 = (n) => Math.round(n * 10) / 10;
const avg = (xs) => (xs.length ? round1(xs.reduce((s, x) => s + x, 0) / xs.length) : null);

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

// GET /api/feedback?from=2026-10-01&to=2026-10-31[&rating=1-5][&comments=1][&limit=200]
// The summary and charts always cover the whole date range. rating, comments and
// limit only affect the list of individual responses. The list shows the ticket,
// department and staff member but never the patient's name or phone number.
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

    let ratingFilter = null;
    if (req.query.rating) {
      ratingFilter = Number(req.query.rating);
      if (!Number.isInteger(ratingFilter) || ratingFilter < 1 || ratingFilter > 5) {
        throw new ApiError(400, 'rating must be a whole number from 1 to 5');
      }
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);

    const [all, completedTickets] = await Promise.all([
      prisma.feedback.findMany({
        where: { createdAt: { gte: from, lte: to } },
        orderBy: { createdAt: 'desc' },
        include: {
          ticket: {
            select: {
              department: { select: { departmentName: true } },
              serviceType: { select: { serviceName: true } },
              services: {
                orderBy: { serviceId: 'desc' },
                take: 1,
                include: { facilitator: { select: { facilitatorName: true, role: true } } },
              },
            },
          },
        },
      }),
      prisma.ticket.count({ where: { status: 'completed', completedAt: { gte: from, lte: to } } }),
    ]);

    const ratings = all.map((f) => f.rating);
    const days = new Map(dayKeys(fromKey, toKey).map((k) => [k, []]));
    const byDept = new Map();
    const byStaff = new Map();
    const byChannel = new Map();
    const distribution = [1, 2, 3, 4, 5].map((rating) => ({ rating, count: 0 }));

    const rows = all.map((f) => {
      const department = f.ticket?.department?.departmentName || 'Unknown';
      const last = f.ticket?.services?.[0]?.facilitator;
      const staff = last?.facilitatorName || '';

      distribution[f.rating - 1].count += 1;
      days.get(dateKey(f.createdAt))?.push(f.rating);
      byChannel.set(f.channel, (byChannel.get(f.channel) || 0) + 1);
      (byDept.get(department) || byDept.set(department, []).get(department)).push(f.rating);
      if (staff) (byStaff.get(staff) || byStaff.set(staff, { role: last.role, ratings: [] }).get(staff)).ratings.push(f.rating);

      return {
        feedbackId: f.feedbackId,
        ticketNumber: f.ticketNumber,
        submittedAt: eatStamp(f.createdAt),
        rating: f.rating,
        comment: f.comment || '',
        channel: f.channel,
        department,
        service: f.ticket?.serviceType?.serviceName || '',
        staff,
      };
    });

    const filtered = rows.filter(
      (r) => (!ratingFilter || r.rating === ratingFilter) && (req.query.comments !== '1' || r.comment)
    );

    res.json({
      range: { from: fromKey, to: toKey },
      summary: {
        total: all.length,
        averageRating: avg(ratings),
        withComments: all.filter((f) => f.comment).length,
        completedTickets,
        // Rough: feedback received in the range over visits completed in the range.
        responseRate: completedTickets ? Math.min(100, round1((all.length / completedTickets) * 100)) : null,
        distribution,
        byChannel: [...byChannel.entries()].map(([name, value]) => ({ name, value })),
      },
      byDay: [...days.entries()].map(([date, rs]) => ({ date, count: rs.length, avgRating: avg(rs) })),
      byDepartment: [...byDept.entries()]
        .map(([department, rs]) => ({ department, count: rs.length, avgRating: avg(rs) }))
        .sort((a, b) => b.count - a.count),
      byStaff: [...byStaff.entries()]
        .map(([name, v]) => ({ name, role: v.role, count: v.ratings.length, avgRating: avg(v.ratings) }))
        .sort((a, b) => b.count - a.count),
      itemsTotal: filtered.length,
      items: filtered.slice(0, limit),
    });
  })
);

module.exports = router;