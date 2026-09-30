const express = require('express');
const router = express.Router();
const prisma = require('../db');
const asyncHandler = require('../lib/asyncHandler');
const ApiError = require('../lib/ApiError');
const { notify } = require('../services/notify');

const MINUTES_PER_PATIENT = 7; // placeholder estimate until real service-time data exists

async function getDefaultDepartmentId() {
  const dept = await prisma.department.findFirst({
    where: { isActive: true },
    orderBy: { departmentId: 'asc' },
  });
  if (!dept) throw new ApiError(500, 'No active department exists — run the seed');
  return dept.departmentId;
}


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

    
    const io = req.app.get('io');
io.emit('ticket:updated', ticket);
await notify(io, ticket, "You're checked in. We'll notify you when it's your turn.");

res.json(ticket);
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
