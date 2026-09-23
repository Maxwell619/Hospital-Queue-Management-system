const { Router } = require("express");
const prisma = require('../db');
const asyncHandler = require("../lib/asyncHandler");
const ApiError = require("../lib/ApiError");

const router = Router();

// POST /api/triage-nurses
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { nurseName, facilitatorId, departmentId, station } = req.body;
    if (!nurseName || !facilitatorId || !departmentId) {
      throw new ApiError(400, "nurseName, facilitatorId, and departmentId are required");
    }

    const nurse = await prisma.triageNurse.create({
      data: {
        nurseName,
        facilitatorId: Number(facilitatorId),
        departmentId: Number(departmentId),
        station: station || null,
      },
    });

    res.status(201).json(nurse);
  })
);

// GET /api/triage-nurses?departmentId=
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { departmentId } = req.query;

    const nurses = await prisma.triageNurse.findMany({
      where: departmentId ? { departmentId: Number(departmentId) } : undefined,
      orderBy: { nurseName: "asc" },
    });

    res.json(nurses);
  })
);

// GET /api/triage-nurses/:id
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const nurseId = Number(req.params.id);
    if (!Number.isInteger(nurseId)) throw new ApiError(400, "id must be an integer");

    const nurse = await prisma.triageNurse.findUnique({ where: { nurseId } });
    if (!nurse) throw new ApiError(404, "Triage nurse not found");

    res.json(nurse);
  })
);

module.exports = router;
