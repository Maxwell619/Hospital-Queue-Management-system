const express = require('express');
const router = express.Router();
const prisma = require('../db');

/**
 * PATCH /api/services/:serviceId/complete
 * Matches Doctor.markConsultationComplete() / LabStaff.markCollectionComplete()
 * / Pharmacist.markPurchaseComplete() from the class diagram -- all three
 * collapse into one endpoint here since the schema stores them as the
 * same completion_status field regardless of facilitator role.
 *
 * Decrements the facilitator's numberOfQueuedPatients, since this is
 * what makes "least busy" routing (in triage.js) actually mean
 * something over time -- without this, every facilitator's count would
 * only ever go up.
 */
router.patch('/:serviceId/complete', async (req, res) => {
  const serviceId = Number(req.params.serviceId);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const service = await tx.service.findUnique({ where: { serviceId } });
      if (!service) {
        throw Object.assign(new Error('Service not found'), { statusCode: 404 });
      }

      const updatedService = await tx.service.update({
        where: { serviceId },
        data: { completionStatus: 'complete' },
      });

      await tx.facilitator.update({
        where: { facilitatorId: service.facilitatorId },
        data: { numberOfQueuedPatients: { decrement: 1 } },
      });

      const ticket = await tx.ticket.update({
        where: { ticketNumber: service.ticketNumber },
        data: { status: 'complete' },
      });

      return { service: updatedService, ticket };
    });

    const io = req.app.get('io');
    io.emit('ticket:updated', result.ticket);

    res.json(result);
  } catch (err) {
    console.error(err);
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message || 'Could not complete service' });
  }
});

module.exports = router;
