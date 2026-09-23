const { Router } = require("express");
const prisma = require('../db');
const asyncHandler = require("../lib/asyncHandler");
const ApiError = require("../lib/ApiError");

const router = Router();

// POST /api/facilitators
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { facilitatorName, departmentId, role } = req.body;
    if (!facilitatorName || !departmentId || !role) {
      throw new ApiError(400, "facilitatorName, departmentId, and role are required");
    }

    const facilitator = await prisma.facilitator.create({
      data: {
        facilitatorName,
        departmentId: Number(departmentId),
        role,
        numberOfQueuedPatients: 0,
      },
    });

    res.status(201).json(facilitator);
  })
);

// GET /api/facilitators?departmentId=&role=
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { departmentId, role } = req.query;

    const facilitators = await prisma.facilitator.findMany({
      where: {
        ...(departmentId ? { departmentId: Number(departmentId) } : {}),
        ...(role ? { role } : {}),
      },
      orderBy: { facilitatorName: "asc" },
    });

    res.json(facilitators);
  })
);

// GET /api/facilitators/:id
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const facilitatorId = Number(req.params.id);
    if (!Number.isInteger(facilitatorId)) throw new ApiError(400, "id must be an integer");

    const facilitator = await prisma.facilitator.findUnique({ where: { facilitatorId } });
    if (!facilitator) throw new ApiError(404, "Facilitator not found");

    res.json(facilitator);
  })
);

module.exports = router;
