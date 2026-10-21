// Fills the database with ~30 days of realistic DEMO history so the analytics
// charts have something to show.
//
//   node prisma/seedAnalytics.js            add demo data (replaces earlier demo data)
//   node prisma/seedAnalytics.js --clear    remove all demo data
//
// Demo patients are named "Demo Patient N" with phone numbers 0700000001...,
// so they are easy to find and remove. Nothing else is touched, no SMS is sent,
// and staff load counters are left alone. Run it from the server folder.
try {
    require('dotenv').config();
  } catch {
    /* dotenv not installed: DATABASE_URL must already be set */
  }
  const prisma = require('../src/db');
  
  const DAYS = 30;
  const DEMO_PREFIX = 'Demo Patient';
  const EAT_OFFSET_H = 3;
  
  // Small deterministic random generator, so reruns produce the same shape of data.
  let seed = 20261020;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const between = (lo, hi) => lo + rand() * (hi - lo);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const minutes = (n) => n * 60000;
  
  // Relative arrival volume by hour of day (Kenya time): busy mornings, quieter evenings.
  const HOUR_WEIGHTS = { 7: 3, 8: 8, 9: 10, 10: 10, 11: 9, 12: 6, 13: 5, 14: 7, 15: 7, 16: 5, 17: 2 };
  const PEAK_HOURS = [9, 10, 11];
  const hourPool = Object.entries(HOUR_WEIGHTS).flatMap(([h, w]) => Array(w).fill(Number(h)));
  
  // How long each kind of staff member spends with a patient (minutes).
  const SERVICE_RANGE = { doctor: [8, 25], labstaff: [5, 14], pharmacist: [3, 9] };
  
  async function clearDemo() {
    const { count } = await prisma.patient.deleteMany({ where: { patientName: { startsWith: DEMO_PREFIX } } });
    return count; // tickets and services go with them (cascade)
  }
  
  async function main() {
    const removed = await clearDemo();
    if (process.argv.includes('--clear')) {
      console.log(`Removed ${removed} demo patients and their tickets.`);
      return;
    }
  
    const [serviceTypes, facilitators] = await Promise.all([
      prisma.serviceType.findMany(),
      prisma.facilitator.findMany({ include: { department: true } }),
    ]);
    if (!serviceTypes.length || !facilitators.length) {
      throw new Error('Need at least one service type and one facilitator. Run your normal seed first.');
    }
    const defaultDept = await prisma.department.findFirst({ where: { isActive: true }, orderBy: { departmentId: 'asc' } });
    const doctors = facilitators.filter((f) => f.role === 'doctor');
    const labStaff = facilitators.filter((f) => f.role === 'labstaff');
    const pharmacists = facilitators.filter((f) => f.role === 'pharmacist');
    const firstStops = doctors.length ? doctors : facilitators;
  
    const now = Date.now();
    const patientIds = new Map(); // phone -> patientId
    let patientCounter = 0;
    async function getPatient() {
      // Roughly 40% of visits are by returning patients.
      if (patientIds.size > 5 && rand() < 0.4) return pick([...patientIds.values()]);
      patientCounter += 1;
      const phone = `0700${String(patientCounter).padStart(6, '0')}`;
      const p = await prisma.patient.create({
        data: { patientName: `${DEMO_PREFIX} ${patientCounter}`, phoneNumber: phone },
      });
      patientIds.set(phone, p.patientId);
      return p.patientId;
    }
  
    let ticketCount = 0;
    let completedCount = 0;
    let cancelledCount = 0;
  
    for (let back = DAYS - 1; back >= 0; back -= 1) {
      // Local (Kenya) calendar day `back` days ago.
      const base = new Date(now + EAT_OFFSET_H * 3600000 - back * 86400000);
      const y = base.getUTCFullYear();
      const m = base.getUTCMonth();
      const d = base.getUTCDate();
      const weekday = base.getUTCDay();
      const volume = weekday === 0 || weekday === 6 ? Math.round(between(6, 14)) : Math.round(between(24, 42));
  
      for (let i = 0; i < volume; i += 1) {
        const hour = pick(hourPool);
        const createdAt = new Date(Date.UTC(y, m, d, hour - EAT_OFFSET_H, Math.floor(rand() * 60), Math.floor(rand() * 60)));
        if (createdAt.getTime() > now - minutes(120)) continue; // keep today's demo tickets finished
  
        const patientId = await getPatient();
        const serviceType = pick(serviceTypes);
        const channel = rand() < 0.55 ? 'web' : 'ussd';
  
        // Some people leave before being seen.
        if (rand() < 0.07) {
          await prisma.ticket.create({
            data: {
              patientId,
              serviceId: serviceType.serviceId,
              departmentId: defaultDept.departmentId,
              channel,
              status: 'cancelled',
              createdAt,
              checkedInAt: rand() < 0.5 ? new Date(createdAt.getTime() + minutes(between(2, 12))) : null,
            },
          });
          ticketCount += 1;
          cancelledCount += 1;
          continue;
        }
  
        const checkedInAt = new Date(createdAt.getTime() + minutes(between(1, 20)));
        const triagedAt = new Date(checkedInAt.getTime() + minutes(between(3, 12)));
  
        // Build the chain of stops: usually one, sometimes a referral on to lab or pharmacy.
        const stops = [pick(firstStops)];
        if (stops[0].role === 'doctor' && rand() < 0.25) {
          const next = rand() < 0.6 ? labStaff : pharmacists;
          if (next.length) stops.push(pick(next));
        }
  
        const peak = PEAK_HOURS.includes(hour) ? 1 : 0;
        const services = [];
        let cursor = triagedAt;
        stops.forEach((staff, idx) => {
          const queueStart = idx === 0 ? checkedInAt : cursor; // first wait runs from check-in
          const assignedAt = idx === 0 ? triagedAt : cursor;
          const wait = (6 + 14 * peak) * (0.4 + rand() * 1.2);
          const startedAt = new Date(Math.max(assignedAt.getTime(), queueStart.getTime() + minutes(wait)));
          const [lo, hi] = SERVICE_RANGE[staff.role] || [5, 15];
          const completedAt = new Date(startedAt.getTime() + minutes(between(lo, hi)));
          services.push({ staff, createdAt: assignedAt, startedAt, completedAt });
          cursor = completedAt;
        });
  
        const last = services[services.length - 1];
        await prisma.ticket.create({
          data: {
            patientId,
            serviceId: serviceType.serviceId,
            departmentId: last.staff.departmentId,
            channel,
            status: 'completed',
            createdAt,
            checkedInAt,
            completedAt: last.completedAt,
            services: {
              create: services.map((s) => ({
                facilitatorId: s.staff.facilitatorId,
                completionStatus: 'completed',
                createdAt: s.createdAt,
                startedAt: s.startedAt,
                completedAt: s.completedAt,
              })),
            },
          },
        });
        ticketCount += 1;
        completedCount += 1;
      }
    }
  
    console.log(
      `Created ${ticketCount} demo tickets (${completedCount} completed, ${cancelledCount} cancelled) ` +
        `for ${patientIds.size} demo patients over the last ${DAYS} days.` +
        (removed ? ` Replaced ${removed} earlier demo patients.` : '')
    );
  }
  
  main()
    .catch((err) => {
      console.error(err.message);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());