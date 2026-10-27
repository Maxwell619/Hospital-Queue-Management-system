const prisma = require('../db');
const ApiError = require('../lib/ApiError');

const MINUTES_PER_PATIENT = 7; // placeholder estimate until real service-time data exists

// New tickets start in the first active department until triage routes them.
async function getDefaultDepartmentId() {
  const dept = await prisma.department.findFirst({
    where: { isActive: true },
    orderBy: { departmentId: 'asc' },
  });
  if (!dept) throw new ApiError(500, 'No active department exists — run the seed');
  return dept.departmentId;
}

// Queue position and estimated wait for a ticket, or nulls if it isn't waiting.
// Shared by the ticket page (GET /api/tickets/:n) and the USSD menu.
async function getQueueInfo(ticket) {
  let position = null;
  let estimatedWaitMinutes = null;

  if (ticket.status === 'checked_in') {
    // Waiting at intake: count the other checked-in tickets ahead of this one.
    const aheadCount = await prisma.ticket.count({
      where: {
        departmentId: ticket.departmentId,
        status: 'checked_in',
        ticketNumber: { lt: ticket.ticketNumber },
      },
    });
    position = aheadCount + 1;
    estimatedWaitMinutes = aheadCount * MINUTES_PER_PATIENT;
  } else if (ticket.status === 'triaged' || ticket.status === 'referred') {
    // Routed (or referred on by a doctor) and waiting for the assigned staff member: count the pending
    // services ahead of this one in that person's queue (oldest first).
    // Once their service starts it is no longer pending, so the position
    // disappears.
    const service = await prisma.service.findFirst({
      where: { ticketNumber: ticket.ticketNumber, completionStatus: 'pending' },
      orderBy: { serviceId: 'desc' },
    });
    if (service) {
      const [aheadCount, inProgressCount] = await Promise.all([
        prisma.service.count({
          where: {
            facilitatorId: service.facilitatorId,
            completionStatus: 'pending',
            serviceId: { lt: service.serviceId },
          },
        }),
        prisma.service.count({
          where: { facilitatorId: service.facilitatorId, completionStatus: 'in_progress' },
        }),
      ]);
      position = aheadCount + 1;
      // Include the patient being served right now, who is also ahead of them.
      estimatedWaitMinutes = (aheadCount + inProgressCount) * MINUTES_PER_PATIENT;
    }
  }

  return { position, estimatedWaitMinutes };
}

// Who is dealing with this ticket right now and where to find them: the staff
// member on the ticket's open service (waiting or in progress). Their own room
// is used, falling back to the department's room. Null if the ticket has no
// open service (not triaged yet, finished or cancelled).
async function getAssignment(ticket) {
  const service = await prisma.service.findFirst({
    where: {
      ticketNumber: ticket.ticketNumber,
      completionStatus: { in: ['pending', 'in_progress'] },
    },
    orderBy: { serviceId: 'desc' },
    include: {
      facilitator: {
        select: {
          facilitatorName: true,
          role: true,
          room: true,
          department: { select: { departmentName: true, roomName: true } },
        },
      },
    },
  });
  if (!service) return null;

  const f = service.facilitator;
  return {
    staffName: f.facilitatorName,
    role: f.role,
    department: f.department?.departmentName || null,
    room: f.room || f.department?.roomName || null,
    status: service.completionStatus,
  };
}

module.exports = { MINUTES_PER_PATIENT, getDefaultDepartmentId, getQueueInfo, getAssignment };