const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { getDefaultDepartmentId, getQueueInfo } = require('../services/queue');
const { notifyTicketBySms } = require('../services/ticketsms');

// The gateway posts form-encoded data (not JSON).
router.use(express.urlencoded({ extended: false }));

const MAIN_MENU =
  'CON Queue Management\n1. Join queue\n2. Check my ticket\n3. Cancel my ticket';

const STATUS_LABELS = {
  pending: 'Awaiting check-in at reception',
  checked_in: 'In queue',
  triaged: 'Waiting to be called',
  referred: 'Referred, waiting to be called',
  in_progress: 'Being served now',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

// Before triage a ticket only holds a default department, so don't show it.
const NOT_ROUTED_YET = ['pending', 'checked_in', 'cancelled'];

const MAX_SERVICES_SHOWN = 6; // a USSD screen only fits a few lines

// The gateway sends +2547XXXXXXXX; the web form stores 07XXXXXXXX. Patients are
// matched by phone number, so convert to the web format to avoid duplicates.
function toLocalNumber(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return `0${digits.slice(3)}`;
  return digits;
}

// The gateway joins the user's answers with "*" in its `text` field, so a name
// typed with a "*" in it arrives as two answers and ends the session with
// "Invalid choice". Names are trimmed and capped to keep screens short.
function cleanName(raw) {
  return String(raw || '').trim().slice(0, 50);
}

async function latestTicket(phone) {
  return prisma.ticket.findFirst({
    where: { patient: { phoneNumber: phone } },
    orderBy: { ticketNumber: 'desc' },
    include: { department: true, serviceType: true },
  });
}

// 1 -> join queue
async function joinQueue(phone, rest) {
  if (rest.length === 0) return 'CON Enter your full name:';

  const name = cleanName(rest[0]);
  if (name.length < 2) return 'END That name is too short. Please dial again.';

  const services = await prisma.serviceType.findMany({
    orderBy: { serviceId: 'asc' },
    take: MAX_SERVICES_SHOWN,
  });
  if (services.length === 0) return 'END No services are available right now.';

  if (rest.length === 1) {
    const lines = services.map((s, i) => `${i + 1}. ${s.serviceName.slice(0, 22)}`);
    return `CON Select service:\n${lines.join('\n')}`;
  }

  const service = services[Number(rest[1]) - 1];
  if (!service) return 'END Invalid choice. Please dial again.';

  const patient = await prisma.patient.upsert({
    where: { phoneNumber: phone },
    update: { patientName: name },
    create: { patientName: name, phoneNumber: phone },
  });
  const ticket = await prisma.ticket.create({
    data: {
      patientId: patient.patientId,
      serviceId: service.serviceId,
      departmentId: await getDefaultDepartmentId(),
      channel: 'ussd',
      status: 'pending',
    },
  });

  notifyTicketBySms(ticket.ticketNumber, 'created'); // not awaited on purpose

  return (
    `END Ticket #${ticket.ticketNumber} created for ${service.serviceName}.\n` +
    'Please check in at reception. Dial again and choose 2 to see your place in the queue.'
  );
}

// 2 -> check my ticket
async function ticketStatus(phone) {
  const ticket = await latestTicket(phone);
  if (!ticket) return 'END No ticket found for this number.';

  const { position, estimatedWaitMinutes } = await getQueueInfo(ticket);
  const lines = [
    `Ticket #${ticket.ticketNumber}`,
    `Status: ${STATUS_LABELS[ticket.status] || ticket.status}`,
  ];
  if (!NOT_ROUTED_YET.includes(ticket.status)) {
    lines.push(`Dept: ${ticket.department?.departmentName}`);
  }
  if (position != null) {
    lines.push(`Position: ${position}`, `Est. wait: ${estimatedWaitMinutes} min`);
  }
  return `END ${lines.join('\n')}`;
}

// 3 -> cancel my ticket (with confirmation)
async function cancelTicket(phone, rest, req) {
  const ticket = await latestTicket(phone);
  if (!ticket) return 'END No ticket found for this number.';
  if (!['pending', 'checked_in'].includes(ticket.status)) {
    const label = STATUS_LABELS[ticket.status] || ticket.status;
    return `END Ticket #${ticket.ticketNumber} is "${label}" and can't be cancelled.`;
  }

  if (rest.length === 0) return `CON Cancel ticket #${ticket.ticketNumber}?\n1. Yes\n2. No`;
  if (rest[0] !== '1') return 'END Your ticket was not cancelled.';

  const updated = await prisma.ticket.update({
    where: { ticketNumber: ticket.ticketNumber },
    data: { status: 'cancelled' },
  });
  const io = req.app.get('io');
  if (io) io.emit('ticket:updated', updated);
  return `END Ticket #${ticket.ticketNumber} has been cancelled.`;
}

async function handleUssd(req) {
  const phone = toLocalNumber(req.body.phoneNumber);
  const steps = req.body.text ? String(req.body.text).split('*') : [];

  if (steps.length === 0) return MAIN_MENU;

  const [choice, ...rest] = steps;
  if (choice === '1') return joinQueue(phone, rest);
  if (choice === '2') return ticketStatus(phone);
  if (choice === '3') return cancelTicket(phone, rest, req);
  return 'END Invalid choice. Please dial again.';
}

// POST /api/ussd/:secret
// The gateway can't send an auth token, so the callback URL itself carries a
// secret (USSD_SECRET in .env). Anything else gets a 404.
// Every response must start with CON (keep the session open) or END (close it),
// and must be plain text, so errors are caught here instead of going to the
// app's JSON error handler.
router.post('/:secret', async (req, res) => {
  const secret = process.env.USSD_SECRET;
  if (!secret || req.params.secret !== secret) return res.sendStatus(404);

  res.type('text/plain');
  try {
    res.send(await handleUssd(req));
  } catch (err) {
    console.error('USSD error:', err);
    res.send('END Something went wrong. Please try again later.');
  }
});

module.exports = router;