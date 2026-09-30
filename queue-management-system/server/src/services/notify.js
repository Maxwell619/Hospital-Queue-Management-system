const prisma = require('../db');

/**
 * Persists a notification for a ticket and pushes a live update to the
 * web dashboard. Every route should call this instead of writing to
 * `notification` directly, so there's one place that knows how a
 * patient actually gets reached.
 * TODO (USSD/WhatsApp integration steps): branch on ticket.channel and
 * call the real Africa's Talking SMS API / WhatsApp Cloud API here.
 * Until then this only persists the row and logs, so notifications are
 * visible during testing without an actual message being sent.
 */
async function notify(io, ticket, message) {
  const notification = await prisma.notification.create({
    data: {
      ticketNumber: ticket.ticketNumber,
      channel: ticket.channel,
      status: 'sent', // optimistic -- no real send yet, see TODO above
      sentAt: new Date(),
    },
  });

  if (io) {
    io.emit('notification:new', {
      ticketNumber: ticket.ticketNumber,
      channel: ticket.channel,
      message,
    });
  }

  console.log(`[notify] ticket #${ticket.ticketNumber} (${ticket.channel}): ${message}`);

  return notification;
}

module.exports = { notify };