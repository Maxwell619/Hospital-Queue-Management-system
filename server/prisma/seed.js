const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Departments
  const outpatient = await prisma.department.create({
    data: {
      departmentName: 'Outpatient',
    },
  });

  const laboratory = await prisma.department.create({
    data: {
      departmentName: 'Laboratory',
    },
  });

  const pharmacy = await prisma.department.create({
    data: {
      departmentName: 'Pharmacy',
    },
  });

  // Facilitators
  const doctor = await prisma.facilitator.create({
    data: {
      facilitatorName: 'Dr. John Kamau',
      facilitatorType: 'doctor',
      departmentId: outpatient.departmentId,
      phoneNumber: '0712345678',
      specialization: 'General Medicine',
    },
  });

  const labFacilitator = await prisma.facilitator.create({
    data: {
      facilitatorName: 'Jane Wanjiku',
      facilitatorType: 'lab',
      departmentId: laboratory.departmentId,
      phoneNumber: '0723456789',
    },
  });

  const pharmacist = await prisma.facilitator.create({
    data: {
      facilitatorName: 'Peter Otieno',
      facilitatorType: 'pharmacist',
      departmentId: pharmacy.departmentId,
      phoneNumber: '0734567890',
    },
  });

  // Triage nurse
  const nurse = await prisma.triageNurse.create({
    data: {
      nurseName: 'Mary Achieng',
      departmentId: outpatient.departmentId,
      phoneNumber: '0745678901',
      station: 'Triage Station 1',
    },
  });

  // Receptionist
  await prisma.receptionist.create({
    data: {
      receptionistName: 'Lucy Mwangi',
      nurseId: nurse.nurseId,
      facilitatorId: doctor.facilitatorId,
      station: 'Reception 1',
      phoneNumber: '0756789012',
      checkInStatus: true,
    },
  });

  // Administrator
  await prisma.administrator.create({
    data: {
      adminName: 'System Administrator',
      phoneNumber: '0767890123',
    },
  });

  // Service types
  await prisma.serviceType.createMany({
    data: [
      {
        serviceName: 'General Consultation',
        description: 'General medical consultation',
      },
      {
        serviceName: 'Laboratory Test',
        description: 'Laboratory investigation',
      },
      {
        serviceName: 'Pharmacy',
        description: 'Medication dispensing',
      },
    ],
  });

  // Patients
  const patient1 = await prisma.patient.create({
    data: {
      patientName: 'Kevin Maina',
      phoneNumber: '0771234567',
      nationalId: '12345678',
      age: 25,
      checkInTime: new Date(),
    },
  });

  const patient2 = await prisma.patient.create({
    data: {
      patientName: 'Sarah Njeri',
      phoneNumber: '0782345678',
      nationalId: '23456789',
      age: 31,
      checkInTime: new Date(),
    },
  });

  console.log('✅ Seed completed successfully!');
  console.log('Created departments:', {
    outpatient: outpatient.departmentId,
    laboratory: laboratory.departmentId,
    pharmacy: pharmacy.departmentId,
  });

  console.log('Created patients:', {
    patient1: patient1.patientId,
    patient2: patient2.patientId,
  });
}

main()
  .catch((error) => {
    console.error('❌ Seed failed:');
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });