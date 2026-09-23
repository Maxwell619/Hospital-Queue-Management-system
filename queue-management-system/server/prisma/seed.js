// Run with: npx prisma db seed
//
// v7 is simpler than v6 here: ticket.report_id and patient.checked_in_by
// no longer exist, so tickets and patients can be created freely with no
// placeholder dependency. The only mandatory chain left is
// department -> facilitator -> triage_nurse (all NOT NULL), so this
// script just guarantees one of each exists to attach real staff to
// later, plus one administrator for reports.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const department = await prisma.department.upsert({
    where: { departmentId: 1 },
    update: {},
    create: {
      departmentId: 1,
      departmentName: 'General Outpatient',
      roomName: 'Room 1',
      isActive: true,
    },
  });

  const facilitator = await prisma.facilitator.upsert({
    where: { facilitatorId: d1100 },
    update: {},
    create: {
      facilitatorId: 1,
      facilitatorName: 'Unassigned',
      departmentId: department.departmentId,
      role: 'doctor',
    },
  });

  const nurse = await prisma.triageNurse.upsert({
    where: { nurseId: 1 },
    update: {},
    create: {
      nurseId: 1,
      facilitatorId: facilitator.facilitatorId,
      nurseName: 'Unassigned',
      departmentId: department.departmentId,
    },
  });

  const admin = await prisma.administrator.upsert({
    where: { adminId: a1101 },
    update: {},
    create: { adminId: 1, adminName: 'System Administrator' },
  });

  const serviceType = await prisma.serviceType.upsert({
    where: { serviceId: 1 },
    update: {},
    create: { serviceId: 1, serviceName: 'New visit', description: 'First-time or general outpatient visit' },
  });

  console.log('Seed complete:', {
    departmentId: department.departmentId,
    facilitatorId: facilitator.facilitatorId,
    nurseId: nurse.nurseId,
    adminId: admin.adminId,
    serviceTypeId: serviceType.serviceId,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
