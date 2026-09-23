// prisma/seed.js
//
// v7 dropped the two links that forced ordering tricks in the previous
// version (ticket -> report and patient -> receptionist), so this is now
// a straightforward top-down insert: independent tables first, then
// facilitator, then everything that references facilitator/ticket.

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

async function main() {
  // Every seeded staff member gets this same password for local dev --
  // never do this in a real environment. Login with the username shown
  // in the console output below and password "password123".
  const passwordHash = await bcrypt.hash("password123", 10);

  // 1. Independent tables
  const generalMedicine = await prisma.department.create({
    data: { departmentName: "General Medicine", roomName: "Room 1", isActive: true },
  });
  const laboratory = await prisma.department.create({
    data: { departmentName: "Laboratory", roomName: "Room 2", isActive: true },
  });

  const consultation = await prisma.serviceType.create({
    data: { serviceName: "Consultation", description: "General consultation with a doctor" },
  });
  const labTest = await prisma.serviceType.create({
    data: { serviceName: "Lab test", description: "Sample collection and testing" },
  });
  await prisma.serviceType.create({
    data: { serviceName: "Pharmacy purchase", description: "Dispensing prescribed medication" },
  });

  const patientMaxwell = await prisma.patient.create({
    data: {
      patientName: "Maxwell Gatua",
      phoneNumber: "0722000006",
      nationalId: "30112233",
      dateOfBirth: new Date("1990-04-12"),
      checkInTime: new Date(),
    },
  });

  const adminKevin = await prisma.administrator.create({
    data: {
      adminName: "Kevin Mutua",
      phoneNumber: "0722000005",
      username: "kevin.mutua",
      passwordHash,
    },
  });

  // 2. Facilitator (needs department)
  const drJane = await prisma.facilitator.create({
    data: {
      facilitatorName: "Dr. Jane Doe",
      departmentId: generalMedicine.departmentId,
      role: "doctor",
      numberOfQueuedPatients: 0,
      username: "jane.doe",
      passwordHash,
    },
  });
  const labTechSam = await prisma.facilitator.create({
    data: {
      facilitatorName: "Sam Otieno",
      departmentId: laboratory.departmentId,
      role: "lab",
      numberOfQueuedPatients: 0,
      username: "sam.otieno",
      passwordHash,
    },
  });

  // 3. Ticket (needs patient, service_type, department -- no report link anymore)
  const ticket = await prisma.ticket.create({
    data: {
      patientId: patientMaxwell.patientId,
      serviceId: consultation.serviceId,
      departmentId: generalMedicine.departmentId,
      status: "pending",
      channel: "ussd",
    },
  });

  // 4. Report (needs administrator only -- independent of ticket in v7)
  const report = await prisma.report.create({
    data: {
      generatedBy: adminKevin.adminId,
      numberOfPatientsServed: 1,
      avgServiceTime: 12.5,
    },
  });

  // 5. TriageNurse (needs facilitator, department)
  const nurseMary = await prisma.triageNurse.create({
    data: {
      facilitatorId: drJane.facilitatorId,
      nurseName: "Mary Wanjiru",
      departmentId: generalMedicine.departmentId,
      station: "Triage desk 1",
      username: "mary.wanjiru",
      passwordHash,
    },
  });

  // 6. Receptionist (needs nurse, facilitator -- no longer linked to patient)
  const receptionistGrace = await prisma.receptionist.create({
    data: {
      receptionistName: "Grace Njeri",
      nurseId: nurseMary.nurseId,
      facilitatorId: drJane.facilitatorId,
      station: "Front desk",
      checkInStatus: true,
      username: "grace.njeri",
      passwordHash,
    },
  });

  // 7. Service (needs ticket, facilitator)
  const service = await prisma.service.create({
    data: {
      ticketNumber: ticket.ticketNumber,
      completionStatus: "in_progress",
      facilitatorId: drJane.facilitatorId,
    },
  });

  // 8. ServiceAssignment (needs facilitator, nurse, service -- no receptionist column in v7)
  await prisma.serviceAssignment.create({
    data: {
      facilitatorId: drJane.facilitatorId,
      nurseId: nurseMary.nurseId,
      serviceId: service.serviceId,
    },
  });

  // 9. Notification (needs ticket)
  await prisma.notification.create({
    data: {
      ticketNumber: ticket.ticketNumber,
      sentAt: new Date(),
      status: "sent",
      channel: "sms",
    },
  });

  console.log("Seed complete:", {
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