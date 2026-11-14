const express = require('express');
const router = express.Router();
const prisma = require('../db');
const asyncHandler = require('../lib/asyncHandler');
const ApiError = require('../lib/ApiError');
const { notify } = require('../services/notify');
const { getDefaultDepartmentId, getQueueInfo, getAssignment } = require('../services/queue');
const { notifyTicketBySms } = require('../services/ticketsms');
const { submitFeedback } = require('../services/feedback');
const { routeDirectly, ROUTE_CHOICES, ROUTE_ROLE } = require('../services/routing');

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { patientName, phoneNumber, dateOfBirth, nationalId, serviceId, channel } = req.body;

    if (!patientName || !phoneNumber || !serviceId || !channel) {
      throw new ApiError(400, 'patientName, phoneNumber, serviceId and channel are required');
    }

    const patient = await prisma.patient.upsert({
      where: { phoneNumber },
      update: {
        patientName,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
        nationalId: nationalId || undefined,
      },
      create: {
        patientName,
        phoneNumber,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
        nationalId: nationalId || undefined,
      },
    });

    const departmentId = await getDefaultDepartmentId();
    const ticket = await prisma.ticket.create({
      data: {
        patientId: patient.patientId,
        serviceId: Number(serviceId),
        departmentId,
        channel,
        status: 'pending',
      },
    });

    notifyTicketBySms(ticket.ticketNumber, 'created'); // not awaited on purpose

    res.status(201).json(ticket);
  })
);

router.get(
  '/:ticketNumber',
  asyncHandler(async (req, res) => {
    const ticketNumber = Number(req.params.ticketNumber);
    if (!Number.isInteger(ticketNumber)) throw new ApiError(400, 'ticketNumber must be an integer');

    const ticket = await prisma.ticket.findUnique({
      where: { ticketNumber },
      include: {
        patient: true,
        serviceType: true,
        department: true,
        feedback: { select: { rating: true, comment: true, createdAt: true } },
      },
    });
    if (!ticket) throw new ApiError(404, 'Ticket not found');

    const [{ position, estimatedWaitMinutes }, assignment] = await Promise.all([
      getQueueInfo(ticket),
      getAssignment(ticket),
    ]);

    res.json({ ...ticket, position, estimatedWaitMinutes, assignment });
  })
);

// GET /api/tickets?status=...&departmentId=...
// departmentId is optional: receptionists and triage nurses aren't tied to a
// department, so they call this with just a status and see the whole hospital.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { departmentId, status } = req.query;

    const where = { status: status || 'checked_in' };
    if (departmentId !== undefined && departmentId !== '') {
      const id = Number(departmentId);
      if (!Number.isInteger(id)) throw new ApiError(400, 'departmentId must be an integer');
      where.departmentId = id;
    }

    const tickets = await prisma.ticket.findMany({
      where,
      include: { patient: true, serviceType: true, department: true },
      orderBy: { ticketNumber: 'asc' },
    });

    res.json(tickets);
  })
);

// POST /api/tickets/:ticketNumber/feedback      body: { rating: 1-5, comment?: string }
// The patient rates a completed visit from the ticket page. Like the other
// patient-facing ticket routes, it has no login.
router.post(
  '/:ticketNumber/feedback',
  asyncHandler(async (req, res) => {
    const saved = await submitFeedback({
      ticketNumber: req.params.ticketNumber,
      rating: req.body.rating,
      comment: req.body.comment,
      channel: 'web',
    });
    res.status(201).json({ rating: saved.rating, comment: saved.comment, createdAt: saved.createdAt });
  })
);

router.patch(
  '/:ticketNumber/check-in',
  asyncHandler(async (req, res) => {
    const ticketNumber = Number(req.params.ticketNumber);
    if (!Number.isInteger(ticketNumber)) throw new ApiError(400, 'ticketNumber must be an integer');

    // Optional body { route: "triage" | "lab" | "pharmacy" }: where the receptionist sends the
    // patient. Left out, the service type's default applies (lab and pharmacy services skip triage).
    const choice = req.body?.route;
    if (choice !== undefined && !ROUTE_CHOICES.includes(choice)) {
      throw new ApiError(400, `route must be one of: ${ROUTE_CHOICES.join(', ')}`);
    }

    // Check-in and (for lab / pharmacy services) the direct routing happen together,
    // so a ticket is never left half way between reception and its staff member.
    const { ticket, routed, directRole } = await prisma.$transaction(async (tx) => {
      const current = await tx.ticket.findUnique({
        where: { ticketNumber },
        include: { serviceType: { select: { directRouteRole: true } } },
      });
      if (!current) throw new ApiError(404, 'Ticket not found');
      if (current.status !== 'pending') {
        throw new ApiError(409, `Cannot check in a ticket with status "${current.status}"`);
      }

      // Claim the ticket in one atomic step: only a still-pending ticket matches, so if
      // two receptionists click at the same moment exactly one of them wins.
      const claimed = await tx.ticket.updateMany({
        where: { ticketNumber, status: 'pending' },
        data: { status: 'checked_in', checkedInAt: new Date() },
      });
      if (claimed.count === 0) {
        throw new ApiError(409, 'This ticket was just checked in by someone else');
      }
      const checkedIn = await tx.ticket.findUnique({ where: { ticketNumber } });
      await tx.patient.update({
        where: { patientId: checkedIn.patientId },
        data: { checkInTime: new Date() },
      });

      // Services marked "skip triage" go straight to the lab or pharmacy. If nobody
      // with that role exists the ticket simply stays checked in for the nurse.
      // The receptionist's choice wins over the service type's default; "triage" means no direct route.
      const role = choice === undefined ? current.serviceType?.directRouteRole || null : ROUTE_ROLE[choice] || null;
      const direct = role ? await routeDirectly(tx, ticketNumber, role) : null;
      return { ticket: direct ? direct.ticket : checkedIn, routed: direct, directRole: role };
    });

    const io = req.app.get('io');
    io.emit('ticket:updated', ticket);
    if (routed) {
      const place = [routed.department, routed.room].filter(Boolean).join(', ');
      await notify(io, ticket, `You're checked in. Please go to ${place}.`);
      notifyTicketBySms(ticket.ticketNumber, 'triaged'); // one text: where to go, not two
    } else {
      await notify(io, ticket, "You're checked in. We'll notify you when it's your turn.");
      notifyTicketBySms(ticket.ticketNumber, 'checked_in'); // not awaited on purpose
    }

    res.json({
      ...ticket,
      routing: routed
        ? { staffName: routed.staffName, role: routed.role, department: routed.department, room: routed.room }
        : null,
      directRouteUnavailable: Boolean(directRole && !routed),
    });
  })
);

router.patch(
  '/:ticketNumber/cancel',
  asyncHandler(async (req, res) => {
    const ticketNumber = Number(req.params.ticketNumber);
    if (!Number.isInteger(ticketNumber)) throw new ApiError(400, 'ticketNumber must be an integer');

    const current = await prisma.ticket.findUnique({ where: { ticketNumber } });
    if (!current) throw new ApiError(404, 'Ticket not found');
    if (!['pending', 'checked_in'].includes(current.status)) {
      throw new ApiError(409, `Cannot cancel a ticket with status "${current.status}"`);
    }

    const ticket = await prisma.ticket.update({
      where: { ticketNumber },
      data: { status: 'cancelled' },
    });

    const io = req.app.get('io');
    io.emit('ticket:updated', ticket);

    res.json(ticket);
  })
);

module.exports = router;