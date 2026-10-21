const { Router } = require("express");
const prisma = require('../db');
const asyncHandler = require("../lib/asyncHandler");
const ApiError = require("../lib/ApiError");
const { authenticate, requireRole } = require("../middleware/authenticate");
const { notify } = require("../services/notify");
const { notifyTicketBySms } = require("../services/ticketSms");

const router = Router();

// How each facilitator role is described to a patient in notifications.
const ROLE_LABEL = { doctor: "consultation", labstaff: "lab test", pharmacist: "pharmacy visit" };

// Where a doctor can refer a patient: request value -> facilitator role.
const REFERRAL_ROLE = { lab: "labstaff", pharmacy: "pharmacist" };

// Releases one unit of a facilitator's load without ever going below zero
// (the seeded in-progress service starts with a count of 0).
// Deliberately NOT async: the array form of prisma.$transaction([...])
// needs the raw Prisma promise, and an async wrapper would break it.
const releaseLoad = (db, facilitatorId) =>
  db.facilitator.updateMany({
    where: { facilitatorId, numberOfQueuedPatients: { gt: 0 } },
    data: { numberOfQueuedPatients: { decrement: 1 } },
  });

// GET /api/services?completionStatus=pending
// A facilitator's own worklist: services already assigned to them by
// routes/triage.js. Includes the facilitator's role so the dashboard can
// show the "refer" buttons to doctors only.
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
      include: {
        ticket: { include: { patient: true, serviceType: true } },
        facilitator: { select: { role: true } },
      },
      orderBy: { serviceId: "asc" },
    });

    res.json(services);
  })
);

// PATCH /api/services/:serviceId/start
// pending -> in_progress, and the ticket follows.
// A facilitator serves one patient at a time: starting another while one is
// still in progress is refused. Check the current patient out first (the
// dashboard's "Check out & call next" does both in order).
router.patch(
  "/:serviceId/start",
  authenticate,
  requireRole("facilitator"),
  asyncHandler(async (req, res) => {
    const serviceId = Number(req.params.serviceId);
    if (!Number.isInteger(serviceId)) throw new ApiError(400, "serviceId must be an integer");

    const service = await prisma.service.findUnique({
      where: { serviceId },
      include: { facilitator: { select: { role: true } } },
    });
    if (!service) throw new ApiError(404, "Service not found");
    if (service.facilitatorId !== req.user.id) {
      throw new ApiError(403, "You can only start services assigned to you");
    }
    if (service.completionStatus !== "pending") {
      throw new ApiError(409, `Cannot start a service with status "${service.completionStatus}"`);
    }

    const alreadyServing = await prisma.service.count({
      where: { facilitatorId: req.user.id, completionStatus: "in_progress" },
    });
    if (alreadyServing > 0) {
      throw new ApiError(409, "Check out the patient you're serving before starting another");
    }

    const [updatedService, updatedTicket] = await prisma.$transaction([
      prisma.service.update({
        where: { serviceId },
        data: { completionStatus: "in_progress", startedAt: new Date() },
      }),
      prisma.ticket.update({
        where: { ticketNumber: service.ticketNumber },
        data: { status: "in_progress" },
      }),
    ]);

    const io = req.app.get("io");
    io.emit("ticket:updated", updatedTicket);
    await notify(io, updatedTicket, `Your ${ROLE_LABEL[service.facilitator.role] ?? "service"} has started.`);
    notifyTicketBySms(updatedTicket.ticketNumber, "started"); // not awaited on purpose

    res.json(updatedService);
  })
);

// PATCH /api/services/:serviceId/complete
// Closes the service AND the whole visit. To send the patient on to the
// lab or pharmacy instead, use /refer below.
// Only the facilitator it's assigned to (or an administrator) can do this.
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

    // Releasing the load here is what keeps "least busy" routing honest.
    const [updatedService, updatedTicket] = await prisma.$transaction([
      prisma.service.update({
        where: { serviceId },
        data: { completionStatus: "completed", completedAt: new Date() },
      }),
      prisma.ticket.update({
        where: { ticketNumber: service.ticketNumber },
        data: { status: "completed", completedAt: new Date() },
      }),
      releaseLoad(prisma, service.facilitatorId),
    ]);

    const io = req.app.get("io");
    io.emit("ticket:updated", updatedTicket);
    await notify(io, updatedTicket, "Your visit is complete. Thank you for coming.");

    res.json(updatedService);
  })
);

// PATCH /api/services/:serviceId/refer      body: { to: "lab" | "pharmacy" }
// A doctor finishes their part and sends the patient on. In one
// transaction this completes the doctor's service, releases their load,
// creates a pending service for the least-busy lab/pharmacy staff member,
// and moves the ticket to that department with status "referred".
// The ticket stays open; it closes when that next service is completed.
router.patch(
  "/:serviceId/refer",
  authenticate,
  requireRole("facilitator"),
  asyncHandler(async (req, res) => {
    const serviceId = Number(req.params.serviceId);
    if (!Number.isInteger(serviceId)) throw new ApiError(400, "serviceId must be an integer");

    const targetRole = REFERRAL_ROLE[req.body.to];
    if (!targetRole) throw new ApiError(400, 'to must be "lab" or "pharmacy"');

    const result = await prisma.$transaction(async (tx) => {
      const service = await tx.service.findUnique({
        where: { serviceId },
        include: { facilitator: { select: { role: true } } },
      });
      if (!service) throw new ApiError(404, "Service not found");
      if (service.facilitatorId !== req.user.id) {
        throw new ApiError(403, "You can only refer services assigned to you");
      }
      if (service.facilitator.role !== "doctor") {
        throw new ApiError(403, "Only doctors can refer a patient onward");
      }
      if (service.completionStatus !== "in_progress") {
        throw new ApiError(409, `Cannot refer a service with status "${service.completionStatus}"`);
      }

      const target = await tx.facilitator.findFirst({
        where: { role: targetRole },
        orderBy: { numberOfQueuedPatients: "asc" },
        include: { department: true },
      });
      if (!target) throw new ApiError(409, `No ${req.body.to} staff available`);

      await tx.service.update({
        where: { serviceId },
        data: { completionStatus: "completed", completedAt: new Date() },
      });
      await releaseLoad(tx, service.facilitatorId);

      const nextService = await tx.service.create({
        data: {
          ticketNumber: service.ticketNumber,
          facilitatorId: target.facilitatorId,
          completionStatus: "pending",
        },
      });
      await tx.facilitator.update({
        where: { facilitatorId: target.facilitatorId },
        data: { numberOfQueuedPatients: { increment: 1 } },
      });

      const ticket = await tx.ticket.update({
        where: { ticketNumber: service.ticketNumber },
        data: { status: "referred", departmentId: target.departmentId },
      });

      return { ticket, nextService, departmentName: target.department.departmentName };
    });

    const io = req.app.get("io");
    io.emit("ticket:updated", result.ticket);
    await notify(
      io,
      result.ticket,
      `Please proceed to ${result.departmentName} for your ${ROLE_LABEL[targetRole]}.`
    );
    notifyTicketBySms(result.ticket.ticketNumber, "referred"); // not awaited on purpose

    res.json({ ticket: result.ticket, service: result.nextService });
  })
);

// GET /api/services/:serviceId
// Now requires login, and only exposes the facilitator's public fields --
// previously this returned the whole facilitator row, passwordHash included.
router.get(
  "/:serviceId",
  authenticate,
  asyncHandler(async (req, res) => {
    const serviceId = Number(req.params.serviceId);
    if (!Number.isInteger(serviceId)) throw new ApiError(400, "serviceId must be an integer");

    const service = await prisma.service.findUnique({
      where: { serviceId },
      include: {
        ticket: { include: { patient: true } },
        facilitator: { select: { facilitatorId: true, facilitatorName: true, role: true } },
      },
    });
    if (!service) throw new ApiError(404, "Service not found");

    res.json(service);
  })
);

module.exports = router;