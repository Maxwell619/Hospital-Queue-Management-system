const express = require('express');
const router = express.Router();
const prisma = require('../db');

/**
 * POST /api/tickets
 * Matches createTicket(patientId, serviceType) from the Patient sequence
 * diagram. Called by the Channel Gateway regardless of whether the
 * patient came in through web, USSD, or WhatsApp -- the `channel` field
 * in the request body is what tells you which one.
 *
 * Body: { patientId, serviceId, channel }
 */
router.post('/', async (req, res) => {
  const { patientId, serviceId, channel } = req.body;

  if (!patientId || !serviceId || !channel) {
    return res.status(400).json({ error: 'patientId, serviceId and channel are required' });
  }

  try {
    const ticket = await prisma.ticket.create({
      data: {
        patientId: Number(patientId),
        serviceId: Number(serviceId),
        channel,
        status: 'pending',
      },
    });

    // TODO: push a "ticket created" notification back through the
    // Notification module once that's built (step 5 of the roadmap).

    res.status(201).json(ticket);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create ticket' });
  }
});

/**
 * GET /api/tickets/:ticketNumber
 * Matches requestQueueStatus() / getStatus(ticketId) from the Patient
 * sequence diagram.
 */
router.get('/:ticketNumber', async (req, res) => {
  const ticketNumber = Number(req.params.ticketNumber);

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { ticketNumber },
      include: { patient: true, serviceType: true },
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    res.json(ticket);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch ticket' });
  }
});

/**
 * PATCH /api/tickets/:ticketNumber/check-in
 * Matches activateTicket(ticketId) from the Receptionist sequence
 * diagram -- this is the mandatory human-verified gate discussed
 * earlier: only a receptionist calling this endpoint moves a ticket
 * from 'pending' to 'checked_in'.
 */
router.patch('/:ticketNumber/check-in', async (req, res) => {
  const ticketNumber = Number(req.params.ticketNumber);

  try {
    const ticket = await prisma.ticket.update({
      where: { ticketNumber },
      data: { status: 'checked_in' },
    });

    // Push the live update to any connected dashboard clients.
    const io = req.app.get('io');
    io.emit('ticket:updated', ticket);

    // TODO: also fire a patient-facing notification here (step 5).

    res.json(ticket);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not check in ticket' });
  }
});

module.exports = router;
