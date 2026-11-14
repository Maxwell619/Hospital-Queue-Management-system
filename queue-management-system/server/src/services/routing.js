// Direct routing: some services (lab tests, pharmacy pickups) skip the triage
// nurse. When the receptionist checks such a ticket in, it is sent straight to
// the least-busy staff member with the right role: the same choice triage and
// referrals make.
//
// Must be called inside a transaction (`tx`). Returns null when no staff member
// with that role exists, so the caller can leave the ticket for the triage nurse.
async function routeDirectly(tx, ticketNumber, role) {
    const staff = await tx.facilitator.findFirst({
      where: { role },
      orderBy: { numberOfQueuedPatients: 'asc' },
      include: {
        department: { select: { departmentName: true, roomName: true } },
        assignedRoom: { select: { roomName: true } },
      },
    });
    if (!staff) return null;
  
    // Same end state triage produces: "triaged" means routed and waiting to be called.
    const ticket = await tx.ticket.update({
      where: { ticketNumber },
      data: { status: 'triaged', departmentId: staff.departmentId },
    });
    await tx.service.create({
      data: { ticketNumber, facilitatorId: staff.facilitatorId, completionStatus: 'pending' },
    });
    await tx.facilitator.update({
      where: { facilitatorId: staff.facilitatorId },
      data: { numberOfQueuedPatients: { increment: 1 } },
    });
  
    return {
      ticket,
      staffName: staff.facilitatorName,
      role: staff.role,
      department: staff.department.departmentName,
      room: staff.assignedRoom?.roomName || staff.room || staff.department.roomName || null,
    };
  }
  
  // What the receptionist can choose at check-in, and which staff role each choice means.
  const ROUTE_CHOICES = ['triage', 'lab', 'pharmacy'];
  const ROUTE_ROLE = { lab: 'labstaff', pharmacy: 'pharmacist' };
  
  module.exports = { routeDirectly, ROUTE_CHOICES, ROUTE_ROLE };