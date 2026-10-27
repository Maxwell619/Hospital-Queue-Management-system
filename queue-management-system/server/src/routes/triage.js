const express = require('express');
const router = express.Router();
const prisma = require('../db');
const asyncHandler = require('../lib/asyncHandler');
const ApiError = require('../lib/ApiError');
const { authenticate, requireRole } = require('../middleware/authenticate');
const { notifyTicketBySms } = require('../services/ticketSms');


router.post(
  '/:ticketNumber',
  authenticate,
  requireRole('triage_nurse'),
  asyncHandler(async (req, res) => {
    const ticketNumber = Number(req.params.ticketNumber);
    if (!Number.isInteger(ticketNumber)) throw new ApiError(400, 'ticketNumber must be an integer');

    const departmentId = Number(req.body.departmentId);
    if (!Number.isInteger(departmentId)) throw new ApiError(400, 'departmentId is required');

    const nurseId = req.user.id;

    const result = await prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findUnique({ where: { ticketNumber } });
      if (!ticket) throw new ApiError(404, 'Ticket not found');
      if (ticket.status !== 'checked_in') {
        throw new ApiError(409, `Only checked-in tickets can be triaged (this one is "${ticket.status}")`);
      }

      const department = await tx.department.findUnique({ where: { departmentId } });
      if (!department || !department.isActive) {
        throw new ApiError(404, 'Department not found or not active');
      }

      const facilitator = await tx.facilitator.findFirst({
        where: { departmentId },
        orderBy: { numberOfQueuedPatients: 'asc' },
      });
      if (!facilitator) {
        throw new ApiError(409, `No staff are assigned to ${department.departmentName} yet`);
      }

      await tx.triageNurse.update({
        where: { nurseId },
        data: { ticketNumber },
      });

      // Routing = changing the ticket's department to the chosen one.
      const updatedTicket = await tx.ticket.update({
        where: { ticketNumber },
        data: { status: 'triaged', departmentId },
      });

      const service = await tx.service.create({
        data: {
          ticketNumber,
          facilitatorId: facilitator.facilitatorId,
          completionStatus: 'pending',
        },
      });

      await tx.serviceAssignment.create({
        data: {
          facilitatorId: facilitator.facilitatorId,
          nurseId,
          serviceId: service.serviceId,
        },
      });

      await tx.facilitator.update({
        where: { facilitatorId: facilitator.facilitatorId },
        data: { numberOfQueuedPatients: { increment: 1 } },
      });

      // Only return what the caller needs -- the full facilitator row
      // includes username and passwordHash, which must never leave the server.
      return {
        ticket: updatedTicket,
        service,
        facilitator: {
          facilitatorId: facilitator.facilitatorId,
          facilitatorName: facilitator.facilitatorName,
          role: facilitator.role,
          room: facilitator.room || department.roomName || null,
        },
        department,
      };
    });

    const io = req.app.get('io');
    io.emit('ticket:updated', result.ticket);

    // Text the patient where to go. Sent after the transaction commits, and
    // not awaited, so an SMS problem can never undo or delay the routing.
    notifyTicketBySms(ticketNumber, 'triaged');

    res.json(result);
  })
);

module.exports = router;