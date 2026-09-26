// prisma/seed.js
//
// Rewritten to be fully idempotent: every insert uses upsert() keyed
// on a natural unique field, so running `npx prisma db seed` any
// number of times produces the exact same data, never duplicates.
// This requires unique constraints on department_name, service_name,
// and phoneNumber (already unique on patient) -- see the migration
// note at the bottom if those constraints don't exist in your DB yet.

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  // 1. Independent tables -- upsert on the natural unique key, not id.
  const generalMedicine = await prisma.department.upsert({
    where: { departmentName: "General Medicine" },
    update: {},
    create: { departmentName: "General Medicine", roomName: "Room 1", isActive: true },
  });
  const laboratory = await prisma.department.upsert({
    where: { departmentName: "Laboratory" },
    update: {},
    create: { departmentName: "Laboratory", roomName: "Room 2", isActive: true },
  });

  const consultation = await prisma.serviceType.upsert({
    where: { serviceName: "Consultation" },
    update: {},
    create: { serviceName: "Consultation", description: "General consultation with a doctor" },
  });
  const labTest = await prisma.serviceType.upsert({
    where: { serviceName: "Lab test" },
    update: {},
    create: { serviceName: "Lab test", description: "Sample collection and testing" },
  });
  await prisma.serviceType.upsert({
    where: { serviceName: "Pharmacy purchase" },
    update: {},
    create: { serviceName: "Pharmacy purchase", description: "Dispensing prescribed medication" },
  });

  const patientMaxwell = await prisma.patient.upsert({
    where: { phoneNumber: "0722000006" },
    update: {},
    create: {
      patientName: "Maxwell Gatua",
      phoneNumber: "0722000006",
      nationalId: "30112233",
      dateOfBirth: new Date("1990-04-12"),
      checkInTime: new Date(),
    },
  });

  const adminKevin = await prisma.administrator.upsert({
    where: { username: "kevin.mutua" },
    update: {},
    create: {
      adminName: "Kevin Mutua",
      phoneNumber: "0722000005",
      username: "kevin.mutua",
      passwordHash,
    },
  });

  // 2. Facilitator (needs department)
  const drJane = await prisma.facilitator.upsert({
    where: { username: "jane.doe" },
    update: {},
    create: {
      facilitatorName: "Dr. Jane Doe",
      departmentId: generalMedicine.departmentId,
      role: "doctor",
      numberOfQueuedPatients: 0,
      username: "jane.doe",
      passwordHash,
    },
  });
  const labTechSam = await prisma.facilitator.upsert({
    where: { username: "sam.otieno" },
    update: {},
    create: {
      facilitatorName: "Sam Otieno",
      departmentId: laboratory.departmentId,
      role: "lab",
      numberOfQueuedPatients: 0,
      username: "sam.otieno",
      passwordHash,
    },
  });

  // 3. Ticket -- no natural unique key, so guard with findFirst instead
  // of upsert (Prisma's upsert requires a unique `where`). This checks
  // "does this exact seed ticket already exist" before creating one.
  let ticket = await prisma.ticket.findFirst({
    where: { patientId: patientMaxwell.patientId, serviceId: consultation.serviceId, channel: "ussd" },
  });
  if (!ticket) {
    ticket = await prisma.ticket.create({
      data: {
        patientId: patientMaxwell.patientId,
        serviceId: consultation.serviceId,
        departmentId: generalMedicine.departmentId,
        status: "pending",
        channel: "ussd",
      },
    });
  }

  // 4. Report
  let report = await prisma.report.findFirst({ where: { generatedBy: adminKevin.adminId } });
  if (!report) {
    report = await prisma.report.create({
      data: { generatedBy: adminKevin.adminId, numberOfPatientsServed: 1, avgServiceTime: 12.5 },
    });
  }

  // 5. TriageNurse
  const nurseMary = await prisma.triageNurse.upsert({
    where: { username: "mary.wanjiru" },
    update: {},
    create: {
      facilitatorId: drJane.facilitatorId,
      nurseName: "Mary Wanjiru",
      departmentId: generalMedicine.departmentId,
      station: "Triage desk 1",
      username: "mary.wanjiru",
      passwordHash,
    },
  });

  // 6. Receptionist
  const receptionistGrace = await prisma.receptionist.upsert({
    where: { username: "grace.njeri" },
    update: {},
    create: {
      receptionistName: "Grace Njeri",
      nurseId: nurseMary.nurseId,
      facilitatorId: drJane.facilitatorId,
      station: "Front desk",
      checkInStatus: true,
      username: "grace.njeri",
      passwordHash,
    },
  });

  // 7. Service
  let service = await prisma.service.findFirst({ where: { ticketNumber: ticket.ticketNumber } });
  if (!service) {
    service = await prisma.service.create({
      data: {
        ticketNumber: ticket.ticketNumber,
        completionStatus: "in_progress",
        facilitatorId: drJane.facilitatorId,
      },
    });
  }

  // 8. ServiceAssignment
  const existingAssignment = await prisma.serviceAssignment.findFirst({
    where: { serviceId: service.serviceId },
  });
  if (!existingAssignment) {
    await prisma.serviceAssignment.create({
      data: { facilitatorId: drJane.facilitatorId, nurseId: nurseMary.nurseId, serviceId: service.serviceId },
    });
  }

  // 9. Notification
  const existingNotification = await prisma.notification.findFirst({
    where: { ticketNumber: ticket.ticketNumber },
  });
  if (!existingNotification) {
    await prisma.notification.create({
      data: { ticketNumber: ticket.ticketNumber, sentAt: new Date(), status: "sent", channel: "sms" },
    });
  }

  console.log("Seed complete (idempotent -- safe to re-run):", {
    departments: [generalMedicine.departmentName, laboratory.departmentName],
    facilitators: [drJane.facilitatorName, labTechSam.facilitatorName],
    patient: patientMaxwell.patientName,
    ticketNumber: ticket.ticketNumber,
    reportId: report.reportId,
    receptionist: receptionistGrace.receptionistName,
    labTestServiceTypeId: labTest.serviceId,
    loginCredentials: {
      note: 'password for all of these is "password123"',
      administrator: adminKevin.username,
      facilitator: drJane.username,
      triage_nurse: nurseMary.username,
      receptionist: receptionistGrace.username,
    },
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