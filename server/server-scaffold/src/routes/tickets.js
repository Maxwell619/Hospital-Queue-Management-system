const { Router } = require("express");
const prisma = require("../lib/prisma");
const asyncHandler = require("../lib/asyncHandler");
const ApiError = require("../lib/ApiError");

const router = Router();

// Ticket lifecycle. "pending" = issued but not yet checked in at
// reception; "checked_in" = in the live queue; "in_progress" = a Service
// row exists and work has started; "completed" / "cancelled" are terminal.
const STATUSES = ["pending", "checked_in", "in_progress", "completed", "cancelled"];
const ALLOWED_TRANSITIONS = {
  pending: ["checked_in", "cancelled"],
  checked_in: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

const MINUTES_PER_PATIENT = 7; // placeholder estimate until real service-time data exists

// POST /api/tickets
// Issues a ticket for an existing patient. This is the "select service,
// get a ticket" step from the USSD/web flows.
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { patientId, serviceId, departmentId, channel } = req.body;

    if (!patientId || !serviceId || !departmentId || !channel) {
      throw new ApiError(400, "patientId, serviceId, departmentId, and channel are required");
    }

    const ticket = await prisma.ticket.create({
      data: {
        patientId: Number(patientId),
        serviceId: Number(serviceId),
        departmentId: Number(departmentId),
        channel,
        status: "pending",
      },
    });

    res.status(201).json(ticket);
  })
);

// GET /api/tickets/:ticketNumber
// Returns the ticket plus its live queue position and a rough wait
// estimate, matching the "check queue" screens from the wireframes.
router.get(
  "/:ticketNumber",
  asyncHandler(async (req, res) => {
    const ticketNumber = Number(req.params.ticketNumber);
    if (!Number.isInteger(ticketNumber)) throw new ApiError(400, "ticketNumber must be an integer");

    const ticket = await prisma.ticket.findUnique({
      where: { ticketNumber },
      include: { patient: true, serviceType: true, department: true },
    });
    if (!ticket) throw new ApiError(404, "Ticket not found");

    let position = null;
    let estimatedWaitMinutes = null;

    if (ticket.status === "checked_in") {
      const aheadCount = await prisma.ticket.count({
        where: {
          departmentId: ticket.departmentId,
          status: "checked_in",
          ticketNumber: { lt: ticket.ticketNumber },
        },
      });
      position = aheadCount + 1;
      estimatedWaitMinutes = aheadCount * MINUTES_PER_PATIENT;
    }

    res.json({ ...ticket, position, estimatedWaitMinutes });
  })
);

// GET /api/tickets?departmentId=1&status=checked_in
// The queue view each facilitator role (nurse/doctor/lab/pharmacist) uses.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { departmentId, status } = req.query;
    if (!departmentId) throw new ApiError(400, "departmentId query param is required");

    const tickets = await prisma.ticket.findMany({
      where: {
        departmentId: Number(departmentId),
        status: status || "checked_in",
      },
      include: { patient: true, serviceType: true },
      orderBy: { ticketNumber: "asc" },
    });

    res.json(tickets);
  })
);

// PATCH /api/tickets/:ticketNumber/status
// Drives every status transition: reception check-in, starting/completing
// service, and cancellation, all through one validated endpoint.
router.patch(
  "/:ticketNumber/status",
  asyncHandler(async (req, res) => {
    const ticketNumber = Number(req.params.ticketNumber);
    if (!Number.isInteger(ticketNumber)) throw new ApiError(400, "ticketNumber must be an integer");

    const { status } = req.body;
    if (!STATUSES.includes(status)) {
      throw new ApiError(400, `status must be one of: ${STATUSES.join(", ")}`);
    }

    const ticket = await prisma.ticket.findUnique({ where: { ticketNumber } });
    if (!ticket) throw new ApiError(404, "Ticket not found");

    const allowed = ALLOWED_TRANSITIONS[ticket.status];
    if (!allowed.includes(status)) {
      throw new ApiError(
        409,
        `Cannot move ticket from "${ticket.status}" to "${status}". Allowed: ${allowed.join(", ") || "none (terminal state)"}`
      );
    }

    const updated = await prisma.ticket.update({
      where: { ticketNumber },
      data: { status },
    });

    res.json(updated);
  })
);

module.exports = router;
