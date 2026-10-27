const prisma = require('../db');
const { sendSms } = require('./sms');
const { getQueueInfo, getAssignment } = require('./queue');

function waitText(position, estimatedWaitMinutes) {
  if (position == null) return '';
  return ` Position ${position}, est. wait ${estimatedWaitMinutes} min.`;
}

// "Dermatology, Room 3" (or just "Dermatology" if no room is set)
function whereText(ticket, assignment) {
  return [ticket.department?.departmentName, assignment?.room].filter(Boolean).join(', ');
}

function buildMessage(event, ticket, info, assignment) {
  const n = ticket.ticketNumber;
  switch (event) {
    case 'created':
      return `Ticket #${n} created for ${ticket.serviceType?.serviceName}. Please check in at reception.`;
    case 'checked_in':
      return `Ticket #${n}: you're checked in.${waitText(info.position, info.estimatedWaitMinutes)}`;
    case 'started':
      return `Ticket #${n}: it's your turn. Please proceed to ${whereText(ticket, assignment)}.`;
    case 'triaged':
    case 'referred':
      return (
        `Ticket #${n}: please go to ${whereText(ticket, assignment)}.` +
        waitText(info.position, info.estimatedWaitMinutes)
      );
    default:
      return null;
  }
}

// Text the patient about their ticket. `event` is 'created', 'checked_in',
// 'triaged', 'referred' or 'started'. Call it without await: it never throws
// and never blocks the response, and it records each attempt in the
// Notification table.
async function notifyTicketBySms(ticketNumber, event) {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { ticketNumber: Number(ticketNumber) },
      include: { patient: true, serviceType: true, department: true },
    });
    if (!ticket?.patient?.phoneNumber) return;

    const [info, assignment] = await Promise.all([getQueueInfo(ticket), getAssignment(ticket)]);
    const message = buildMessage(event, ticket, info, assignment);
    if (!message) return;

    const result = await sendSms(ticket.patient.phoneNumber, message);
    if (result.skipped) return; // SMS isn't configured, so there is nothing to record

    await prisma.notification.create({
      data: {
        ticketNumber: ticket.ticketNumber,
        channel: 'sms',
        status: result.ok ? 'sent' : 'failed',
        sentAt: result.ok ? new Date() : null,
      },
    });
  } catch (err) {
    console.error('SMS notification failed:', err);
  }
}

module.exports = { notifyTicketBySms, buildMessage };