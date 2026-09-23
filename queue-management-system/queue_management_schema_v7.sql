-- ============================================================
-- Web-Based Queue Management System with USSD and WhatsApp Support
-- Database schema v7 (PostgreSQL) -- normalized to Third Normal Form
-- Generated from the updated Facilitator/Department class diagram.
-- ============================================================
--
-- 3NF NORMALIZATION NOTES (read this before the CREATE TABLE
-- statements -- it explains every column that's missing compared to
-- the class diagram's attribute lists):
--
-- 1NF check: every column holds a single atomic value. The one thing
-- that would have violated this -- Department.facilitatorList[], an
-- array of Facilitator objects -- is not a real column at all; it's
-- implemented the normal relational way, as facilitator.department_id
-- pointing back at department. Storing it as an array column instead
-- would itself be a 1NF violation (a repeating group).
--
-- 2NF check: 2NF violations (a non-key attribute depending on only
-- part of a composite primary key) can't occur here, because every
-- table uses a single-column surrogate key (an auto-incrementing ID),
-- never a composite primary key. So 2NF is satisfied automatically.
--
-- 3NF check (the one that actually required changes): a 3NF violation
-- is a non-key attribute that depends on another non-key attribute
-- rather than directly on the primary key ("transitive dependency").
-- Four columns in the class diagram fail this test, and are removed
-- below:
--   - facilitator.departmentName -- this value is fully determined by
--     department_id (department_id -> department.department_name),
--     not by facilitator_id directly. Get it via a JOIN to department
--     instead of storing a copy that can drift out of sync.
--   - triage_nurse.department (the String one, alongside
--     department_id) -- same issue, same fix.
--   - service.facilitatorName -- determined by facilitator_id
--     (facilitator_id -> facilitator.facilitator_name), not by
--     service_id. JOIN to facilitator instead.
--   - service.serviceName -- reachable via
--     service.ticket_number -> ticket.service_id ->
--     service_type.service_name, a two-hop transitive path. JOIN
--     through ticket and service_type instead of storing a copy.
-- Removing these four is what makes this schema 3NF; every remaining
-- non-key column depends only on its own table's primary key.
-- ============================================================

CREATE TABLE department (
    department_id     SERIAL PRIMARY KEY,
    department_name   VARCHAR(100) NOT NULL,
    room_name         VARCHAR(100),
    is_active         BOOLEAN NOT NULL DEFAULT TRUE
);

-- Doctor, LabStaff and Pharmacist all extend Facilitator with zero
-- added attributes (only added methods), so -- same reasoning as
-- earlier schema versions -- they're stored in one table with a
-- discriminator column. The class diagram already names this
-- discriminator explicitly as `role`, so it's used as-is here.
CREATE TABLE facilitator (
    facilitator_id             SERIAL PRIMARY KEY,
    facilitator_name           VARCHAR(150) NOT NULL,
    department_id              INTEGER NOT NULL REFERENCES department(department_id),
    role                        VARCHAR(20) NOT NULL, -- 'doctor' | 'labstaff' | 'pharmacist'
    number_of_queued_patients   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE triage_nurse (
    nurse_id         SERIAL PRIMARY KEY,
    facilitator_id   INTEGER NOT NULL REFERENCES facilitator(facilitator_id),
    nurse_name       VARCHAR(150) NOT NULL,
    department_id    INTEGER NOT NULL REFERENCES department(department_id),
    ticket_number    INTEGER,  -- nullable: the ticket this nurse is currently handling, if any
    station          VARCHAR(50)
);

CREATE TABLE receptionist (
    receptionist_id     SERIAL PRIMARY KEY,
    receptionist_name   VARCHAR(150) NOT NULL,
    nurse_id             INTEGER REFERENCES triage_nurse(nurse_id),
    facilitator_id       INTEGER REFERENCES facilitator(facilitator_id), -- nullable: only set for follow-up assignment
    station               VARCHAR(50),
    check_in_status       BOOLEAN NOT NULL DEFAULT FALSE
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
    patient_name        VARCHAR(150) NOT NULL,
    phone_number        VARCHAR(20) NOT NULL,
    national_id          VARCHAR(30),
    date_of_birth         DATE,
    check_in_time         TIMESTAMP,
    check_out_time        TIMESTAMP,
    UNIQUE (phone_number)
);

CREATE TABLE service_type (
    service_id     SERIAL PRIMARY KEY,
    description    TEXT,
    service_name   VARCHAR(100) NOT NULL
);

CREATE TABLE ticket (
    ticket_number    SERIAL PRIMARY KEY,
    patient_id       INTEGER NOT NULL REFERENCES patient(patient_id) ON DELETE CASCADE,
    service_id       INTEGER NOT NULL REFERENCES service_type(service_id),
    department_id    INTEGER NOT NULL REFERENCES department(department_id),
    status           VARCHAR(30) NOT NULL DEFAULT 'pending',
    channel          VARCHAR(20) NOT NULL
);

-- facilitator_name and service_name removed -- see the 3NF notes above.
CREATE TABLE service (
    service_id          SERIAL PRIMARY KEY,
    ticket_number       INTEGER NOT NULL REFERENCES ticket(ticket_number) ON DELETE CASCADE,
    completion_status   VARCHAR(20),
    facilitator_id      INTEGER NOT NULL REFERENCES facilitator(facilitator_id)
);

-- NEW: junction table connecting facilitator, service and triage_nurse,
-- as requested. Records which facilitator and which triage nurse were
-- jointly involved in a given service instance.
CREATE TABLE service_assignment (
    assignment_id   SERIAL PRIMARY KEY,
    facilitator_id  INTEGER NOT NULL REFERENCES facilitator(facilitator_id),
    nurse_id        INTEGER NOT NULL REFERENCES triage_nurse(nurse_id),
    service_id      INTEGER NOT NULL REFERENCES service(service_id)
);

CREATE TABLE notification (
    notification_id   SERIAL PRIMARY KEY,
    ticket_number     INTEGER NOT NULL REFERENCES ticket(ticket_number) ON DELETE CASCADE,
    sent_at           TIMESTAMP,
    status            VARCHAR(20) NOT NULL DEFAULT 'pending',
    channel           VARCHAR(20) NOT NULL
);

-- ============================================================
-- Additional notes:
--
-- 1. `service_assignment` is named descriptively since you didn't
--    specify a name this time (unlike the earlier `registration`
--    table) -- rename it if you'd prefer something else.
--
-- 2. To get a facilitator's or service's full readable name/type in
--    a query, JOIN rather than read a stored column, e.g.:
--      SELECT s.service_id, f.facilitator_name, f.role
--      FROM service s JOIN facilitator f ON s.facilitator_id = f.facilitator_id;
--
-- 3. `receptionist.facilitator_id` and `receptionist.nurse_id` are
--    left nullable here (not forced mandatory like schema v6), since
--    "assigns" only applies to follow-up patients -- a receptionist
--    handling a new patient legitimately has no doctor to assign yet.
-- ============================================================
