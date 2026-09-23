const express = require('express');
const router = express.Router();
const prisma = require('../db');
const asyncHandler = require('../lib/asyncHandler');
const ApiError = require('../lib/ApiError');

const MINUTES_PER_PATIENT = 7; // placeholder estimate until real service-time data exists
const DEFAULT_DEPARTMENT_ID = 1; // TODO: replace with real department routing logic

/**
 * POST /api/tickets
 * Matches createTicket(patientId, serviceType) from the Patient sequence
 * diagram. Called by the Channel Gateway regardless of whether the
 * patient came in through web, USSD, or WhatsApp -- the `channel` field
 * in the request body is what tells you which one.
 *
 * Body: { patientName, phoneNumber, dateOfBirth, nationalId (optional), serviceId, channel }
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { patientName, phoneNumber, dateOfBirth, nationalId, serviceId, channel } = req.body;

    if (!patientName || !phoneNumber || !serviceId || !channel) {
      throw new ApiError(400, 'patientName, phoneNumber, serviceId and channel are required');
    }

    const patient = await prisma.patient.upsert({
      where: { phoneNumber },
      update: {},
      create: {
        patientName,
        phoneNumber,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
        nationalId: nationalId || undefined, // optional, per the join-queue wireframe
      },
    });

    const ticket = await prisma.ticket.create({
      data: {
        patientId: patient.patientId,
        serviceId: Number(serviceId),
        departmentId: DEFAULT_DEPARTMENT_ID,
        channel,
        status: 'pending',
      },
    });

    // TODO: push a "ticket created" notification back through the
    // Notification module once that's built (step 5 of the roadmap).

    res.status(201).json(ticket);
  })
);

/**
 * GET /api/tickets/:ticketNumber
 * Matches requestQueueStatus() / getStatus(ticketId) from the Patient
 * sequence diagram. Includes live queue position + a rough wait
 * estimate once the ticket has actually been checked in.
 */
router.get(
  '/:ticketNumber',
  asyncHandler(async (req, res) => {
    const ticketNumber = Number(req.params.ticketNumber);
    if (!Number.isInteger(ticketNumber)) throw new ApiError(400, 'ticketNumber must be an integer');

    const ticket = await prisma.ticket.findUnique({
      where: { ticketNumber },
      include: { patient: true, serviceType: true },
    });
    if (!ticket) throw new ApiError(404, 'Ticket not found');

    let position = null;
    let estimatedWaitMinutes = null;

    if (ticket.status === 'checked_in') {
      const aheadCount = await prisma.ticket.count({
        where: {
          departmentId: ticket.departmentId,
          status: 'checked_in',
          ticketNumber: { lt: ticket.ticketNumber },
        },
      });
      position = aheadCount + 1;
      estimatedWaitMinutes = aheadCount * MINUTES_PER_PATIENT;
    }

    res.json({ ...ticket, position, estimatedWaitMinutes });
  })
);

/**
 * GET /api/tickets?departmentId=1&status=checked_in
 * The queue view each facilitator role (nurse/doctor/lab/pharmacist) uses.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { departmentId, status } = req.query;
    if (!departmentId) throw new ApiError(400, 'departmentId query param is required');

    const tickets = await prisma.ticket.findMany({
      where: {
        departmentId: Number(departmentId),
        status: status || 'checked_in',
      },
      include: { patient: true, serviceType: true },
      orderBy: { ticketNumber: 'asc' },
    });

    res.json(tickets);
  })
);

/**
 * PATCH /api/tickets/:ticketNumber/check-in
 * Matches activateTicket(ticketId) from the Receptionist sequence
 * diagram -- this is the mandatory human-verified gate: only a
 * receptionist calling this endpoint moves a ticket from 'pending' to
 * 'checked_in'.
 *
 * v7 note: schema v7 has no column recording WHICH receptionist did
 * this (patient.checked_in_by was removed) -- known gap, flagged when
 * v7's ERD was first generated. If you want that audit trail back, it
 * needs a column added to either ticket or patient.
 */
router.patch(
  '/:ticketNumber/check-in',
  asyncHandler(async (req, res) => {
    const ticketNumber = Number(req.params.ticketNumber);
    if (!Number.isInteger(ticketNumber)) throw new ApiError(400, 'ticketNumber must be an integer');

    const current = await prisma.ticket.findUnique({ where: { ticketNumber } });
    if (!current) throw new ApiError(404, 'Ticket not found');
    if (current.status !== 'pending') {
      throw new ApiError(409, `Cannot check in a ticket with status "${current.status}"`);
    }

    const ticket = await prisma.ticket.update({
      where: { ticketNumber },
      data: { status: 'checked_in' },
    });

    await prisma.patient.update({
      where: { patientId: ticket.patientId },
      data: { checkInTime: new Date() },
    });

    // Push the live update to any connected dashboard clients.
    const io = req.app.get('io');
    io.emit('ticket:updated', ticket);

    // TODO: also fire a patient-facing notification here (step 5).

    res.json(ticket);
  })
);

/**
 * PATCH /api/tickets/:ticketNumber/cancel
 * The "cancel ticket" action from the USSD/web wireframes. Only valid
 * before a facilitator has actually started the service.
 */
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
