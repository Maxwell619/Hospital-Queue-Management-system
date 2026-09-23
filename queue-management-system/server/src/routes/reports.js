const { Router } = require("express");
const prisma = require('../db');
const asyncHandler = require("../lib/asyncHandler");
const ApiError = require("../lib/ApiError");

const router = Router();

/**
 * POST /api/reports/generate
 * Matches generateReport(reportType, dateRange) from the Administrator
 * sequence diagram. Computes numberOfPatientsServed from completed
 * tickets; optionally scoped to a department.
 *
 * TODO: avgServiceTime is left null here -- neither ticket nor service
 * has start/end timestamps in v7, so there's no real duration to
 * average yet. Needs a timestamp column (e.g. service.startedAt /
 * completedAt) before this can be computed instead of manually supplied.
 *
 * Body: { generatedBy, departmentId (optional), avgServiceTime (optional), feedback (optional) }
 */
router.post(
  "/generate",
  asyncHandler(async (req, res) => {
    const { generatedBy, departmentId, avgServiceTime, feedback } = req.body;
    if (!generatedBy) throw new ApiError(400, "generatedBy is required");

    const numberOfPatientsServed = await prisma.ticket.count({
      where: {
        status: "completed",
        ...(departmentId ? { departmentId: Number(departmentId) } : {}),
      },
    });

    const report = await prisma.report.create({
      data: {
        generatedBy: Number(generatedBy),
        numberOfPatientsServed,
        avgServiceTime: avgServiceTime != null ? avgServiceTime : null,
        feedback: feedback || null,
      },
    });

    res.status(201).json(report);
  })
);

// GET /api/reports/:id
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const reportId = Number(req.params.id);
    if (!Number.isInteger(reportId)) throw new ApiError(400, "id must be an integer");

    const report = await prisma.report.findUnique({ where: { reportId } });
    if (!report) throw new ApiError(404, "Report not found");

    res.json(report);
  })
);

// GET /api/reports?generatedBy=
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { generatedBy } = req.query;

    const reports = await prisma.report.findMany({
      where: generatedBy ? { generatedBy: Number(generatedBy) } : undefined,
      orderBy: { createdAt: "desc" },
    });

    res.json(reports);
  })
);

module.exports = router;
