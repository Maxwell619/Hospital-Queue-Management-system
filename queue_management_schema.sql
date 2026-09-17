-- ============================================================
-- Web-Based Queue Management System with USSD 
-- Database schema v6 (PostgreSQL)
-- Adds: registration junction table (facilitator, receptionist,
-- triage_nurse, service), service_type <-> service link,
-- ticket <-> report link. All relationships are mandatory
-- one-to-many (NOT NULL foreign keys), no optional/zero sides.
-- ============================================================

CREATE TABLE department (
    department_id     SERIAL PRIMARY KEY,
    department_name   VARCHAR(100) NOT NULL
);

CREATE TABLE facilitator (
    facilitator_id             SERIAL PRIMARY KEY,
    facilitator_name           VARCHAR(150) NOT NULL,
    facilitator_type           VARCHAR(20) NOT NULL, -- 'doctor' | 'lab' | 'pharmacist'
    department_id              INTEGER NOT NULL REFERENCES department(department_id),
    phone_number                VARCHAR(20),
    specialization              VARCHAR(100),
    number_of_queued_patients   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE triage_nurse (
    nurse_id        SERIAL PRIMARY KEY,
    facilitator_id  INTEGER NOT NULL REFERENCES facilitator(facilitator_id),
    nurse_name      VARCHAR(150) NOT NULL,
    department_id   INTEGER NOT NULL REFERENCES department(department_id),
    phone_number    VARCHAR(20),
    station         VARCHAR(50)
);

CREATE TABLE receptionist (
    receptionist_id     SERIAL PRIMARY KEY,
    receptionist_name   VARCHAR(150) NOT NULL,
    nurse_id             INTEGER NOT NULL REFERENCES triage_nurse(nurse_id),
    facilitator_id       INTEGER NOT NULL REFERENCES facilitator(facilitator_id),
    station              VARCHAR(50),
    phone_number         VARCHAR(20),
    check_in_status      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE administrator (
    admin_id       SERIAL PRIMARY KEY,
    admin_name     VARCHAR(150) NOT NULL,
    phone_number   VARCHAR(20)
);

CREATE TABLE report (
    report_id                  SERIAL PRIMARY KEY,
    number_of_patients_served   INTEGER,
    generated_by                 INTEGER NOT NULL REFERENCES administrator(admin_id),
    avg_service_time             NUMERIC(6,2),
    feedback                     TEXT,
    created_at                    TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE patient (
    patient_id        SERIAL PRIMARY KEY,
    patient_name       VARCHAR(150) NOT NULL,
    phone_number       VARCHAR(20) NOT NULL,
    national_id        VARCHAR(30),
    age                INTEGER,
    check_in_time       TIMESTAMP,
    check_out_time      TIMESTAMP,
    checked_in_by       INTEGER NOT NULL REFERENCES receptionist(receptionist_id), -- see note 1
    UNIQUE (phone_number)
);

CREATE TABLE service_type (
    service_id     SERIAL PRIMARY KEY,
    description    TEXT,
    service_name   VARCHAR(100) NOT NULL
);

-- NOTE: report_id below is NOT NULL per the "all relationships mandatory"
-- instruction, but see note 2 -- this will block ticket creation in
-- practice until you address it.
CREATE TABLE ticket (
    ticket_number    SERIAL PRIMARY KEY,
    patient_id       INTEGER NOT NULL REFERENCES patient(patient_id) ON DELETE CASCADE,
    service_id       INTEGER NOT NULL REFERENCES service_type(service_id),
    department_id    INTEGER NOT NULL REFERENCES department(department_id),
    report_id        INTEGER NOT NULL REFERENCES report(report_id), -- see note 2
    status           VARCHAR(30) NOT NULL DEFAULT 'pending',
    channel          VARCHAR(20) NOT NULL
);

CREATE TABLE service (
    service_id          SERIAL PRIMARY KEY,
    ticket_number       INTEGER NOT NULL REFERENCES ticket(ticket_number) ON DELETE CASCADE,
    service_type_id     INTEGER NOT NULL REFERENCES service_type(service_id),
    completion_status   VARCHAR(20),
    facilitator_id      INTEGER NOT NULL REFERENCES facilitator(facilitator_id),
    facilitator_name    VARCHAR(150),
    service_name        VARCHAR(100)
);

-- Junction table linking facilitator, receptionist, triage_nurse and
-- service -- records which staff trio handled a given service instance.
CREATE TABLE registration (
    registration_id   SERIAL PRIMARY KEY,
    facilitator_id    INTEGER NOT NULL REFERENCES facilitator(facilitator_id),
    receptionist_id   INTEGER NOT NULL REFERENCES receptionist(receptionist_id),
    nurse_id          INTEGER NOT NULL REFERENCES triage_nurse(nurse_id),
    service_id        INTEGER NOT NULL REFERENCES service(service_id)
);

CREATE TABLE notification (
    notification_id   SERIAL PRIMARY KEY,
    ticket_number     INTEGER NOT NULL REFERENCES ticket(ticket_number) ON DELETE CASCADE,
    sent_at           TIMESTAMP,
    status            VARCHAR(20) NOT NULL DEFAULT 'pending',
    channel           VARCHAR(20) NOT NULL
);

-- ============================================================
-- Notes -- read before running this against a real application:
--
-- 1. `patient.checked_in_by` is a new column, added to back the
--    "receptionist checks in patient" relationship that existed only
--    as an unlabeled line in your diagram with no column behind it.
--    Making it NOT NULL means a patient record cannot be inserted
--    until a receptionist has checked them in -- which conflicts with
--    the "pending" ticket state (patient joins remotely, before any
--    receptionist has seen them) that the rest of this system relies
--    on. In practice you likely need this nullable, or need to
--    insert the patient row only at check-in time rather than at
--    remote ticket creation.
--
-- 2. `ticket.report_id NOT NULL` is the more serious version of the
--    same problem: a ticket is created the instant a patient joins
--    the queue, but a report is only generated later by an
--    administrator, covering many tickets over a date range. As
--    written, you cannot INSERT a new ticket until a report already
--    exists to reference -- which is backwards. This was requested
--    as a literal "make everything mandatory one-to-many" rule, but
--    this specific relationship should almost certainly stay
--    nullable (report_id INTEGER REFERENCES report(report_id), no
--    NOT NULL) so a ticket can exist unassigned to any report until
--    one is generated that includes it.
--
-- 3. `registration` requires all four foreign keys to be filled in
--    before a row can be inserted, meaning a registration record can
--    only be created once a facilitator, receptionist, triage nurse
--    AND a service all already exist for the same encounter. Confirm
--    this matches your actual workflow ordering (service is created
--    fairly late in the ticket lifecycle -- see the sequence diagrams).
--
-- 4. Table names here are singular (department, facilitator, ticket)
--    matching your uploaded diagram exactly, unlike v1-v5 which used
--    plural table names (departments, facilitators, tickets). Pick
--    one convention before this goes in your final submission --
--    mixing singular and plural across schema versions will look
--    inconsistent to an examiner.
-- ============================================================