const express = require('express');
const router = express.Router();
const prisma = require('../db');

/**
 * POST /api/triage/:ticketNumber
 * Combines two steps from the design in one atomic call:
 *   1. Triage nurse marks the patient as triaged (matches
 *      TriageNurse.routePatientToService() / getNextTriagePatient()
 *      from the sequence diagrams).
 *   2. Routing auto-assigns the least-busy on-duty-equivalent
 *      facilitator (by role) in the ticket's department -- since
 *      priority/urgency was deliberately left out of this schema,
 *      "least busy" (lowest numberOfQueuedPatients) is the only
 *      ranking signal available, per your last decision.
 *
 * Every write happens in a single Prisma transaction so a failure
 * partway through (e.g. no facilitator available) doesn't leave the
 * ticket triaged but unassigned.
 *
 * Body: { nurseId, role } -- role is which kind of facilitator this
 * ticket needs next ('doctor' | 'labstaff' | 'pharmacist').
 */
router.post('/:ticketNumber', async (req, res) => {
  const ticketNumber = Number(req.params.ticketNumber);
  const { nurseId, role } = req.body;

  if (!nurseId || !role) {
    return res.status(400).json({ error: 'nurseId and role are required' });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findUnique({ where: { ticketNumber } });
      if (!ticket) {
        throw Object.assign(new Error('Ticket not found'), { statusCode: 404 });
      }

      // Find the least-busy facilitator of the requested role in this
      // ticket's department -- the only ranking signal we have without
      // a priority field.
      const facilitator = await tx.facilitator.findFirst({
        where: { departmentId: ticket.departmentId, role },
        orderBy: { numberOfQueuedPatients: 'asc' },
      });

      if (!facilitator) {
        throw Object.assign(
          new Error(`No ${role} available in this department`),
          { statusCode: 409 }
        );
      }

      // 1. Mark the nurse as currently handling this ticket.
      await tx.triageNurse.update({
        where: { nurseId: Number(nurseId) },
        data: { ticketNumber },
      });

      // 2. Move the ticket to 'triaged'.
      const updatedTicket = await tx.ticket.update({
        where: { ticketNumber },
        data: { status: 'triaged' },
      });

      // 3. Create the service record -- this is what actually assigns
      //    the facilitator to this ticket.
      const service = await tx.service.create({
        data: {
          ticketNumber,
          facilitatorId: facilitator.facilitatorId,
          completionStatus: 'pending',
        },
      });

      // 4. Record the joint facilitator + nurse + service assignment,
      //    using the service_assignment junction table.
      await tx.serviceAssignment.create({
        data: {
          facilitatorId: facilitator.facilitatorId,
          nurseId: Number(nurseId),
          serviceId: service.serviceId,
        },
      });

      // 5. Reflect the new load on the facilitator.
      await tx.facilitator.update({
        where: { facilitatorId: facilitator.facilitatorId },
        data: { numberOfQueuedPatients: { increment: 1 } },
      });

      return { ticket: updatedTicket, service, facilitator };
    });

    const io = req.app.get('io');
    io.emit('ticket:updated', result.ticket);

    // TODO: fire a patient-facing notification here once the
    // Notification module exists (step 5 of the roadmap).

    res.json(result);
  } catch (err) {
    console.error(err);
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message || 'Could not triage ticket' });
  }
});

module.exports = router;
