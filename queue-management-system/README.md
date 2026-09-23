# Web-Based Queue Management System with USSD and WhatsApp Support

Public hospital outpatient queue management system with three patient-facing
channels (web, USSD, WhatsApp) sharing one queue engine.

## Structure

```
/server   Express API + PostgreSQL (Prisma ORM) -- build this first
/client   Staff web dashboard -- build after the API works
```

## Getting started (see full roadmap in the proposal's Design chapter)

1. `cd server && npm install`
2. Create a PostgreSQL database, then run the schema:
   `psql -d your_db_name -f ../queue_management_schema_v7.sql`
   (copy queue_management_schema_v7.sql into this folder, or point psql at
   wherever you saved it)
3. Copy `.env.example` to `.env` and fill in your DATABASE_URL
4. `npx prisma generate`
5. `npx prisma db seed` -- schema v7 still requires
   department -> facilitator -> triage_nurse to exist (those FKs are
   mandatory), so the seed script creates one baseline row of each,
   plus a system administrator and a default "New visit" service type.
   Unlike v6, tickets and patients have NO hidden dependency on a
   placeholder report or receptionist -- those columns don't exist in
   v7 -- so this step is smaller than before.
6. `npm run dev`
7. Visit `http://localhost:3000/health` -- you should see `{ "status": "ok" }`

Once the API is running, test the full remote-join-then-check-in flow:
- `POST /api/tickets` with
  `{ patientName, phoneNumber, dateOfBirth, nationalId, serviceId, channel }`
  creates a patient + ticket. `nationalId` is optional, matching the
  join-queue wireframe.
- `PATCH /api/tickets/:ticketNumber/check-in` moves the ticket to
  `checked_in` and stamps the patient's `checkInTime`. Note: v7 has no
  column recording which receptionist performed the check-in -- that's
  a known, flagged gap, not an oversight; add one if you want that
  audit trail back.

Then move on to Triage and Routing modules (step 4 of the roadmap).
