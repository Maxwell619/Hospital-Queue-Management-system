const { Router } = require("express");
const prisma = require('../db');
const asyncHandler = require("../lib/asyncHandler");
const ApiError = require("../lib/ApiError");

const router = Router();

// POST /api/services/call-next
// The "alertNextPatientOnQueue + start service" action from the sequence
// diagrams, in one call: finds the oldest checked_in ticket in the given
// department, flips it to in_progress, and opens a Service row for the
// calling facilitator.
//
// Uses updateMany's affected-row count as a cheap optimistic lock: if two
// facilitators call this at the same instant for the same ticket, only
// one update actually matches status: "checked_in" and wins. The loser
// gets a 409 and should just retry (there will be a different next
// ticket, or none left).
router.post(
  "/call-next",
  asyncHandler(async (req, res) => {
    const { departmentId, facilitatorId } = req.body;
    if (!departmentId || !facilitatorId) {
      throw new ApiError(400, "departmentId and facilitatorId are required");
    }

    const nextTicket = await prisma.ticket.findFirst({
      where: { departmentId: Number(departmentId), status: "checked_in" },
      orderBy: { ticketNumber: "asc" },
      include: { patient: true, serviceType: true },
    });

    if (!nextTicket) {
      throw new ApiError(404, "No checked-in patients waiting in this department");
    }

    const result = await prisma.$transaction(async (tx) => {
      const { count } = await tx.ticket.updateMany({
        where: { ticketNumber: nextTicket.ticketNumber, status: "checked_in" },
        data: { status: "in_progress" },
      });

      if (count === 0) {
        // Someone else already called this exact ticket a moment ago.
        return null;
      }

      const service = await tx.service.create({
        data: {
          ticketNumber: nextTicket.ticketNumber,
          facilitatorId: Number(facilitatorId),
          completionStatus: "in_progress",
        },
      });

      return service;
    });

    if (!result) {
      throw new ApiError(409, "That ticket was just claimed by someone else — try again");
    }

    const io = req.app.get("io");
    io.emit("ticket:updated", { ...nextTicket, status: "in_progress" });

    res.status(201).json({ ticket: nextTicket, service: result });
  })
);

// PATCH /api/services/:serviceId/complete
// Marks the service done and closes out the ticket in the same transaction.
router.patch(
  "/:serviceId/complete",
  asyncHandler(async (req, res) => {
    const serviceId = Number(req.params.serviceId);
    if (!Number.isInteger(serviceId)) throw new ApiError(400, "serviceId must be an integer");

    const service = await prisma.service.findUnique({ where: { serviceId } });
    if (!service) throw new ApiError(404, "Service not found");

    const [updatedService] = await prisma.$transaction([
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
    io.emit("ticket:updated", { ticketNumber: service.ticketNumber, status: "completed" });

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
