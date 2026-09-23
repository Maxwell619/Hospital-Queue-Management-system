const { Router } = require("express");
const prisma = require('../db');
const asyncHandler = require("../lib/asyncHandler");
const ApiError = require("../lib/ApiError");

const router = Router();

// POST /api/service-assignments
// Links a facilitator, a triage nurse, and a service together for a
// given visit -- the "who actually handled this" record, separate from
// service.facilitatorId (who's responsible for the work itself).
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { facilitatorId, nurseId, serviceId } = req.body;
    if (!facilitatorId || !nurseId || !serviceId) {
      throw new ApiError(400, "facilitatorId, nurseId, and serviceId are required");
    }

    const assignment = await prisma.serviceAssignment.create({
      data: {
        facilitatorId: Number(facilitatorId),
        nurseId: Number(nurseId),
        serviceId: Number(serviceId),
      },
    });

    res.status(201).json(assignment);
  })
);

// GET /api/service-assignments/:id
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const assignmentId = Number(req.params.id);
    if (!Number.isInteger(assignmentId)) throw new ApiError(400, "id must be an integer");

    const assignment = await prisma.serviceAssignment.findUnique({
      where: { assignmentId },
      include: { facilitator: true, nurse: true, service: true },
    });
    if (!assignment) throw new ApiError(404, "Service assignment not found");

    res.json(assignment);
  })
);

// GET /api/service-assignments?serviceId=&facilitatorId=&nurseId=
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { serviceId, facilitatorId, nurseId } = req.query;

    const assignments = await prisma.serviceAssignment.findMany({
      where: {
        ...(serviceId ? { serviceId: Number(serviceId) } : {}),
        ...(facilitatorId ? { facilitatorId: Number(facilitatorId) } : {}),
        ...(nurseId ? { nurseId: Number(nurseId) } : {}),
      },
      include: { facilitator: true, nurse: true },
      orderBy: { assignmentId: "desc" },
    });

    res.json(assignments);
  })
);

module.exports = router;