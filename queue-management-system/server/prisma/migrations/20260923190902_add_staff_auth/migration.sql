-- CreateTable
CREATE TABLE "department" (
    "department_id" SERIAL NOT NULL,
    "department_name" TEXT NOT NULL,
    "room_name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "department_pkey" PRIMARY KEY ("department_id")
);

-- CreateTable
CREATE TABLE "facilitator" (
    "facilitator_id" SERIAL NOT NULL,
    "facilitator_name" TEXT NOT NULL,
    "department_id" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "number_of_queued_patients" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "facilitator_pkey" PRIMARY KEY ("facilitator_id")
);

-- CreateTable
CREATE TABLE "triage_nurse" (
    "nurse_id" SERIAL NOT NULL,
    "facilitator_id" INTEGER NOT NULL,
    "nurse_name" TEXT NOT NULL,
    "department_id" INTEGER NOT NULL,
    "ticket_number" INTEGER,
    "station" TEXT,

    CONSTRAINT "triage_nurse_pkey" PRIMARY KEY ("nurse_id")
);

-- CreateTable
CREATE TABLE "receptionist" (
    "receptionist_id" SERIAL NOT NULL,
    "receptionist_name" TEXT NOT NULL,
    "nurse_id" INTEGER,
    "facilitator_id" INTEGER,
    "station" TEXT,
    "check_in_status" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "receptionist_pkey" PRIMARY KEY ("receptionist_id")
);

-- CreateTable
CREATE TABLE "administrator" (
    "admin_id" SERIAL NOT NULL,
    "admin_name" TEXT NOT NULL,
    "phone_number" TEXT,

    CONSTRAINT "administrator_pkey" PRIMARY KEY ("admin_id")
);

-- CreateTable
CREATE TABLE "report" (
    "report_id" SERIAL NOT NULL,
    "number_of_patients_served" INTEGER,
    "generated_by" INTEGER NOT NULL,
    "avg_service_time" DOUBLE PRECISION,
    "feedback" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_pkey" PRIMARY KEY ("report_id")
);

-- CreateTable
CREATE TABLE "patient" (
    "patient_id" SERIAL NOT NULL,
    "patient_name" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "national_id" TEXT,
    "date_of_birth" DATE,
    "check_in_time" TIMESTAMP(3),
    "check_out_time" TIMESTAMP(3),

    CONSTRAINT "patient_pkey" PRIMARY KEY ("patient_id")
);

-- CreateTable
CREATE TABLE "service_type" (
    "service_id" SERIAL NOT NULL,
    "description" TEXT,
    "service_name" TEXT NOT NULL,

    CONSTRAINT "service_type_pkey" PRIMARY KEY ("service_id")
);

-- CreateTable
CREATE TABLE "ticket" (
    "ticket_number" SERIAL NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "service_id" INTEGER NOT NULL,
    "department_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "channel" TEXT NOT NULL,

    CONSTRAINT "ticket_pkey" PRIMARY KEY ("ticket_number")
);

-- CreateTable
CREATE TABLE "service" (
    "service_id" SERIAL NOT NULL,
    "ticket_number" INTEGER NOT NULL,
    "completion_status" TEXT,
    "facilitator_id" INTEGER NOT NULL,

    CONSTRAINT "service_pkey" PRIMARY KEY ("service_id")
);

-- CreateTable
CREATE TABLE "service_assignment" (
    "assignment_id" SERIAL NOT NULL,
    "facilitator_id" INTEGER NOT NULL,
    "nurse_id" INTEGER NOT NULL,
    "service_id" INTEGER NOT NULL,

    CONSTRAINT "service_assignment_pkey" PRIMARY KEY ("assignment_id")
);

-- CreateTable
CREATE TABLE "notification" (
    "notification_id" SERIAL NOT NULL,
    "ticket_number" INTEGER NOT NULL,
    "sent_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "channel" TEXT NOT NULL,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("notification_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "patient_phone_number_key" ON "patient"("phone_number");

-- AddForeignKey
ALTER TABLE "facilitator" ADD CONSTRAINT "facilitator_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("department_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triage_nurse" ADD CONSTRAINT "triage_nurse_facilitator_id_fkey" FOREIGN KEY ("facilitator_id") REFERENCES "facilitator"("facilitator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triage_nurse" ADD CONSTRAINT "triage_nurse_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("department_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receptionist" ADD CONSTRAINT "receptionist_nurse_id_fkey" FOREIGN KEY ("nurse_id") REFERENCES "triage_nurse"("nurse_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receptionist" ADD CONSTRAINT "receptionist_facilitator_id_fkey" FOREIGN KEY ("facilitator_id") REFERENCES "facilitator"("facilitator_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "administrator"("admin_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("patient_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "service_type"("service_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("department_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service" ADD CONSTRAINT "service_ticket_number_fkey" FOREIGN KEY ("ticket_number") REFERENCES "ticket"("ticket_number") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service" ADD CONSTRAINT "service_facilitator_id_fkey" FOREIGN KEY ("facilitator_id") REFERENCES "facilitator"("facilitator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_assignment" ADD CONSTRAINT "service_assignment_facilitator_id_fkey" FOREIGN KEY ("facilitator_id") REFERENCES "facilitator"("facilitator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_assignment" ADD CONSTRAINT "service_assignment_nurse_id_fkey" FOREIGN KEY ("nurse_id") REFERENCES "triage_nurse"("nurse_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_assignment" ADD CONSTRAINT "service_assignment_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "service"("service_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_ticket_number_fkey" FOREIGN KEY ("ticket_number") REFERENCES "ticket"("ticket_number") ON DELETE CASCADE ON UPDATE CASCADE;
