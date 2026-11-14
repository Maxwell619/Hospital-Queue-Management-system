const { Router } = require('express');
const prisma = require('../db');
const asyncHandler = require('../lib/asyncHandler');
const ApiError = require('../lib/ApiError');
const { authenticate, requireRole } = require('../middleware/authenticate');

const router = Router();

// Choosing which services skip triage is for administrators only.
router.use(authenticate, requireRole('administrator'));

// Who a service can be sent straight to. null means "the normal way, via the triage nurse".
const DIRECT_ROLES = ['labstaff', 'pharmacist'];

// GET /api/service-routing
// Every service with where it goes after reception, plus how many staff exist for
// each target so the screen can warn when a route has nobody behind it.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [services, counts] = await Promise.all([
      prisma.serviceType.findMany({
        orderBy: { serviceName: 'asc' },
        select: { serviceId: true, serviceName: true, directRouteRole: true },
      }),
      prisma.facilitator.groupBy({ by: ['role'], _count: { _all: true } }),
    ]);
    const staffCounts = Object.fromEntries(DIRECT_ROLES.map((r) => [r, 0]));
    counts.forEach((c) => {
      if (c.role in staffCounts) staffCounts[c.role] = c._count._all;
    });
    res.json({ services, staffCounts });
  })
);

// PATCH /api/service-routing/:id      body: { directRouteRole: "labstaff" | "pharmacist" | null }
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new ApiError(400, 'id must be an integer');
    if (!('directRouteRole' in req.body)) {
      throw new ApiError(400, 'directRouteRole is required (send null for the normal triage route)');
    }
    const role = req.body.directRouteRole;
    if (role !== null && !DIRECT_ROLES.includes(role)) {
      throw new ApiError(400, `directRouteRole must be null or one of: ${DIRECT_ROLES.join(', ')}`);
    }

    try {
      const row = await prisma.serviceType.update({
        where: { serviceId: id },
        data: { directRouteRole: role },
        select: { serviceId: true, serviceName: true, directRouteRole: true },
      });
      res.json(row);
    } catch (err) {
      if (err.code === 'P2025') throw new ApiError(404, 'Service not found');
      throw err;
    }
  })
);

module.exports = router;