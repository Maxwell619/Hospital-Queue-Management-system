const { Router } = require("express");
const prisma = require('../db');
const asyncHandler = require("../lib/asyncHandler");
const ApiError = require("../lib/ApiError");
const { authenticate, requireRole } = require("../middleware/authenticate");

const router = Router();

// GET /api/services?completionStatus=pending
// A facilitator's own worklist: services already assigned to them by
// routes/triage.js, not yet started or completed.
router.get(
  "/",
  authenticate,
  requireRole("facilitator"),
  asyncHandler(async (req, res) => {
    const { completionStatus } = req.query;

    const services = await prisma.service.findMany({
      where: {
        facilitatorId: req.user.id,
        completionStatus: completionStatus || "pending",
      },
      include: { ticket: { include: { patient: true, serviceType: true } } },
      orderBy: { serviceId: "asc" },
    });

    res.json(services);
  })
);

// PATCH /api/services/:serviceId/start
// pending -> in_progress, and the ticket follows: triaged -> in_progress.
router.patch(
  "/:serviceId/start",
  authenticate,
  requireRole("facilitator"),
  asyncHandler(async (req, res) => {
    const serviceId = Number(req.params.serviceId);
    if (!Number.isInteger(serviceId)) throw new ApiError(400, "serviceId must be an integer");

    const service = await prisma.service.findUnique({ where: { serviceId } });
    if (!service) throw new ApiError(404, "Service not found");
    if (service.facilitatorId !== req.user.id) {
      throw new ApiError(403, "You can only start services assigned to you");
    }
    if (service.completionStatus !== "pending") {
      throw new ApiError(409, `Cannot start a service with status "${service.completionStatus}"`);
    }

    const [updatedService, updatedTicket] = await prisma.$transaction([
      prisma.service.update({
        where: { serviceId },
        data: { completionStatus: "in_progress" },
      }),
      prisma.ticket.update({
        where: { ticketNumber: service.ticketNumber },
        data: { status: "in_progress" },
      }),
    ]);

    const io = req.app.get("io");
    io.emit("ticket:updated", updatedTicket);

    res.json(updatedService);
  })
);

// PATCH /api/services/:serviceId/complete
// Only the facilitator it's assigned to (or an administrator) can close it out.
router.patch(
  "/:serviceId/complete",
  authenticate,
  requireRole("facilitator", "administrator"),
  asyncHandler(async (req, res) => {
    const serviceId = Number(req.params.serviceId);
    if (!Number.isInteger(serviceId)) throw new ApiError(400, "serviceId must be an integer");

    const service = await prisma.service.findUnique({ where: { serviceId } });
    if (!service) throw new ApiError(404, "Service not found");

    if (req.user.staffType === "facilitator" && service.facilitatorId !== req.user.id) {
      throw new ApiError(403, "You can only complete services assigned to you");
    }
    if (service.completionStatus !== "in_progress") {
      throw new ApiError(409, `Cannot complete a service with status "${service.completionStatus}"`);
    }

    const [updatedService, updatedTicket] = await prisma.$transaction([
      prisma.service.update({
        where: { serviceId },
        data: { completionStatus: "completed" },
      }),
      prisma.ticket.update({
        where: { ticketNumber: service.ticketNumber },
        data: { status: "completed" },
      }),
    ]);

    const io = req.app.get("io");
    io.emit("ticket:updated", updatedTicket);

    res.json(updatedService);
  })
);

// GET /api/services/:serviceId
router.get(
  "/:serviceId",
  asyncHandler(async (req, res) => {
    const serviceId = Number(req.params.serviceId);
    if (!Number.isInteger(serviceId)) throw new ApiError(400, "serviceId must be an integer");

    const service = await prisma.service.findUnique({
      where: { serviceId },
      include: { ticket: { include: { patient: true } }, facilitator: true },
    });
    if (!service) throw new ApiError(404, "Service not found");

    res.json(service);
  })
);

module.exports = router;