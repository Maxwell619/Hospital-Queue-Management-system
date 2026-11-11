// One-off helper: turns the old free-text rooms typed against staff into real
// Room records and links the staff to them.
//
//   node prisma/migrateRooms.js
//
// Run it once, after adding the Room model and Facilitator.roomId to schema.prisma
// and running `npx prisma db push`. For each distinct (name, type) it creates a
// room (type is worked out from the staff member's role) and clears the old text.
// A room used by staff from several departments is left without a department.
// Safe to run again: staff already linked are skipped.
try {
    require('dotenv').config();
  } catch {
    /* dotenv not installed: DATABASE_URL must already be set */
  }
  const prisma = require('../src/db');
  
  const ROLE_TYPE = { doctor: 'room', labstaff: 'lab', pharmacist: 'pharmacy' };
  
  async function main() {
    const staff = await prisma.facilitator.findMany({
      where: { roomId: null, NOT: { room: null } },
      select: { facilitatorId: true, role: true, room: true, departmentId: true },
    });
  
    const groups = new Map(); // "type|name" -> { roomName, roomType, departments:Set, ids:[] }
    const blankIds = [];
    for (const f of staff) {
      const name = (f.room || '').trim();
      if (!name) {
        blankIds.push(f.facilitatorId); // whitespace only: nothing worth keeping
        continue;
      }
      const type = ROLE_TYPE[f.role] || 'room';
      const key = `${type}|${name}`;
      if (!groups.has(key)) groups.set(key, { roomName: name, roomType: type, departments: new Set(), ids: [] });
      const g = groups.get(key);
      g.departments.add(f.departmentId);
      g.ids.push(f.facilitatorId);
    }
  
    let created = 0;
    let linked = 0;
    for (const g of groups.values()) {
      const departmentId = g.departments.size === 1 ? [...g.departments][0] : null;
      let room = await prisma.room.findUnique({
        where: { roomName_roomType: { roomName: g.roomName, roomType: g.roomType } },
      });
      if (!room) {
        room = await prisma.room.create({ data: { roomName: g.roomName, roomType: g.roomType, departmentId } });
        created += 1;
      }
      const { count } = await prisma.facilitator.updateMany({
        where: { facilitatorId: { in: g.ids } },
        data: { roomId: room.roomId, room: null },
      });
      linked += count;
    }
  
    if (blankIds.length) {
      await prisma.facilitator.updateMany({ where: { facilitatorId: { in: blankIds } }, data: { room: null } });
    }
  
    console.log(`Created ${created} rooms and linked ${linked} staff members.` + (staff.length === 0 ? ' Nothing to migrate.' : ''));
  }
  
  main()
    .catch((err) => {
      console.error(err.message);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());