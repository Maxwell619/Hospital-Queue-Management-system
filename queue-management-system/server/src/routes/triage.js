const express = require('express');
const router = express.Router();
const prisma = require('../db');
const asyncHandler = require('../lib/asyncHandler');
const ApiError = require('../lib/ApiError');
const { authenticate, requireRole } = require('../middleware/authenticate');

/**
 * POST /api/triage/:ticketNumber
 * The triage nurse routes a checked-in patient to a clinical department
 * (Dermatology, Respiratory, ...). In one atomic transaction this:
 *   1. moves the ticket into the chosen department and marks it 'triaged'
 *   2. assigns the least-busy doctor in that department (lowest
 *      numberOfQueuedPatients -- the only ranking signal without a
 *      priority field)
 *   3. creates the pending Service + ServiceAssignment rows and bumps
 *      that doctor's load
 * If anything fails (e.g. no doctor in the department), nothing is
 * written, so a ticket is never left triaged-but-unassigned.
 *
 * Body: { departmentId }
 * The nurse is identified by the login token, not the request body.
 */
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
        where: { departmentId, role: 'doctor' },
        orderBy: { numberOfQueuedPatients: 'asc' },
      });
      if (!facilitator) {
        throw new ApiError(409, `No doctor available in ${department.departmentName}`);
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

      return { ticket: updatedTicket, service, facilitator, department };
    });

    const io = req.app.get('io');
    io.emit('ticket:updated', result.ticket);

    // TODO: fire a patient-facing notification here ("go to <department>")
    // once the Notification module actually dispatches messages.

    res.json(result);
  })
);

module.exports = router;