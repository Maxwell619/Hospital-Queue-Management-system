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
   `psql -d your_db_name -f ../queue_management_schema_v5.sql`
   (copy queue_management_schema_v5.sql into this folder, or point psql at
   wherever you saved it)
3. Copy `.env.example` to `.env` and fill in your DATABASE_URL
4. `npx prisma generate`
5. `npm run dev`
6. Visit `http://localhost:3000/health` -- you should see `{ "status": "ok" }`

Once the API is running, build the ticket endpoints in
`src/routes/tickets.js` (stubbed with TODOs matching your sequence diagrams),
then move on to triage/routing, notifications, and finally the USSD and
WhatsApp channel integrations.
