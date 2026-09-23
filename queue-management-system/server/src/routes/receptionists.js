const { Router } = require("express");
const prisma = require('../db');
const asyncHandler = require("../lib/asyncHandler");
const ApiError = require("../lib/ApiError");

const router = Router();

// POST /api/receptionists
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { receptionistName, nurseId, facilitatorId, station } = req.body;
    if (!receptionistName || !nurseId || !facilitatorId) {
      throw new ApiError(400, "receptionistName, nurseId, and facilitatorId are required");
    }

    const receptionist = await prisma.receptionist.create({
      data: {
        receptionistName,
        nurseId: Number(nurseId),
        facilitatorId: Number(facilitatorId),
        station: station || null,
        checkInStatus: false,
      },
    });

    res.status(201).json(receptionist);
  })
);

// GET /api/receptionists?facilitatorId=
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { facilitatorId } = req.query;

    const receptionists = await prisma.receptionist.findMany({
      where: facilitatorId ? { facilitatorId: Number(facilitatorId) } : undefined,
      orderBy: { receptionistName: "asc" },
    });

    res.json(receptionists);
  })
);

// GET /api/receptionists/:id
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const receptionistId = Number(req.params.id);
    if (!Number.isInteger(receptionistId)) throw new ApiError(400, "id must be an integer");

    const receptionist = await prisma.receptionist.findUnique({ where: { receptionistId } });
    if (!receptionist) throw new ApiError(404, "Receptionist not found");

    res.json(receptionist);
  })
);

module.exports = router;
