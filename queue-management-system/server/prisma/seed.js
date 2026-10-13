

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

async function main() {
  
  await prisma.notification.deleteMany();
  await prisma.serviceAssignment.deleteMany();
  await prisma.service.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.report.deleteMany();
  await prisma.receptionist.deleteMany();
  await prisma.triageNurse.deleteMany();
  await prisma.facilitator.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.administrator.deleteMany();
  await prisma.serviceType.deleteMany();
  await prisma.department.deleteMany();

  // Every seeded staff member shares this password -- local dev only.
  const passwordHash = await bcrypt.hash("password123", 10);

  // 1. Departments. General Medicine MUST stay first (intake default).
  const generalMedicine = await prisma.department.create({
    data: { departmentName: "General Medicine", roomName: "Room 1", isActive: true },
  });
  const dermatology = await prisma.department.create({
    data: { departmentName: "Dermatology", roomName: "Room 2", isActive: true },
  });
  const respiratory = await prisma.department.create({
    data: { departmentName: "Respiratory", roomName: "Room 3", isActive: true },
  });
  const cardiology = await prisma.department.create({
    data: { departmentName: "Cardiology", roomName: "Room 4", isActive: true },
  });
  const laboratory = await prisma.department.create({
    data: { departmentName: "Laboratory", roomName: "Room 5", isActive: true },
  });
  const pharmacy = await prisma.department.create({
    data: { departmentName: "Pharmacy", roomName: "Room 6", isActive: true },
  });
   
  const consultation = await prisma.serviceType.create({
    data: { serviceName: "Consultation", description: "General consultation with a doctor" },
  });
  await prisma.serviceType.create({
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

  // 2. Staff -- at least one per department, because triage assigns the
  // least-busy facilitator working in whichever department the nurse
  // picks (any role: doctors in clinics, a lab technician in Laboratory,
  // a pharmacist in Pharmacy). A department with nobody in it can't be
  // routed to.
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
  const drPeter = await prisma.facilitator.create({
    data: {
      facilitatorName: "Dr. Peter Kimani",
      departmentId: dermatology.departmentId,
      role: "doctor",
      numberOfQueuedPatients: 0,
      username: "peter.kimani",
      passwordHash,
    },
  });
  const drLucy = await prisma.facilitator.create({
    data: {
      facilitatorName: "Dr. Lucy Achieng",
      departmentId: respiratory.departmentId,
      role: "doctor",
      numberOfQueuedPatients: 0,
      username: "lucy.achieng",
      passwordHash,
    },
  });
  const drHassan = await prisma.facilitator.create({
    data: {
      facilitatorName: "Dr. Hassan Ali",
      departmentId: cardiology.departmentId,
      role: "doctor",
      numberOfQueuedPatients: 0,
      username: "hassan.ali",
      passwordHash,
    },
  });
  await prisma.facilitator.create({ data: {
    facilitatorName: "Sam Otieno", departmentId: laboratory.departmentId,
    role: "labstaff", numberOfQueuedPatients: 0, username: "sam.otieno", passwordHash } });
  await prisma.facilitator.create({ data: {
    facilitatorName: "Ann Wekesa", departmentId: pharmacy.departmentId,
    role: "pharmacist", numberOfQueuedPatients: 0, username: "ann.wekesa", passwordHash } });
  const labTechSam = await prisma.facilitator.create({
    data: {
      facilitatorName: "Sam Otieno",
      departmentId: laboratory.departmentId,
      role: "labstaff",
      numberOfQueuedPatients: 0,
      username: "sam.otieno",
      passwordHash,
    },
  });
  const pharmacistAisha = await prisma.facilitator.create({
    data: {
      facilitatorName: "Aisha Kariuki",
      departmentId: pharmacy.departmentId,
      role: "pharmacist",
      numberOfQueuedPatients: 0,
      username: "aisha.kariuki",
      passwordHash,
    },
  });

  // 3. A ticket already being served, so dashboards aren't empty.
  const ticket = await prisma.ticket.create({
    data: {
      patientId: patientMaxwell.patientId,
      serviceId: consultation.serviceId,
      departmentId: generalMedicine.departmentId,
      status: "pending",
      channel: "ussd",
    },
  });

  // 4. Report
  const report = await prisma.report.create({
    data: {
      generatedBy: adminKevin.adminId,
      numberOfPatientsServed: 1,
      avgServiceTime: 12.5,
    },
  });

  // 5. Triage nurse + receptionist work out of the intake department
  // (receptionist's department is resolved via their supervising
  // facilitator, Dr. Jane).
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

  // 6. Service for the seeded ticket, with the ticket's status brought in
  // line so the data is reachable through the real flow.
  const service = await prisma.service.create({
    data: {
      ticketNumber: ticket.ticketNumber,
      completionStatus: "in_progress",
      facilitatorId: drJane.facilitatorId,
    },
  });
  await prisma.ticket.update({
    where: { ticketNumber: ticket.ticketNumber },
    data: { status: "in_progress" },
  });

  await prisma.serviceAssignment.create({
    data: {
      facilitatorId: drJane.facilitatorId,
      nurseId: nurseMary.nurseId,
      serviceId: service.serviceId,
    },
  });

  await prisma.notification.create({
    data: {
      ticketNumber: ticket.ticketNumber,
      sentAt: new Date(),
      status: "sent",
      channel: "sms",
    },
  });

  console.log("Seed complete:", {
    departments: [
      generalMedicine.departmentName,
      dermatology.departmentName,
      respiratory.departmentName,
      cardiology.departmentName,
      laboratory.departmentName,
      pharmacy.departmentName,
    ],
    staff: [drJane, drPeter, drLucy, drHassan, labTechSam, pharmacistAisha].map(
      (d) => d.facilitatorName
    ),
    patient: patientMaxwell.patientName,
    ticketNumber: ticket.ticketNumber,
    reportId: report.reportId,
    loginCredentials: {
      note: 'password for all of these is "password123"',
      administrator: adminKevin.username,
      receptionist: receptionistGrace.username,
      triage_nurse: nurseMary.username,
      facilitator_general_medicine: drJane.username,
      facilitator_dermatology: drPeter.username,
      facilitator_respiratory: drLucy.username,
      facilitator_cardiology: drHassan.username,
      facilitator_laboratory: labTechSam.username,
      facilitator_pharmacy: pharmacistAisha.username,
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