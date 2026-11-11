const { Router } = require('express');
const prisma = require('../db');
const asyncHandler = require('../lib/asyncHandler');
const ApiError = require('../lib/ApiError');
const { authenticate, requireRole } = require('../middleware/authenticate');
const { ROOM_TYPES, TYPE_LABEL, MAX_ROOM_NAME_LENGTH } = require('../services/rooms');

const router = Router();

// Managing rooms, labs and pharmacies is for administrators only.
router.use(authenticate, requireRole('administrator'));

function cleanName(value) {
  if (typeof value !== 'string' || !value.trim()) throw new ApiError(400, 'roomName is required');
  const name = value.trim();
  if (name.length > MAX_ROOM_NAME_LENGTH) {
    throw new ApiError(400, `roomName must be at most ${MAX_ROOM_NAME_LENGTH} characters`);
  }
  return name;
}

// Resolves an optional departmentId. null/"" means "not tied to a department".
async function resolveDepartment(value) {
  if (value == null || value === '') return null;
  const id = Number(value);
  if (!Number.isInteger(id)) throw new ApiError(400, 'departmentId must be an integer');
  const dept = await prisma.department.findUnique({ where: { departmentId: id } });
  if (!dept || !dept.isActive) throw new ApiError(404, 'Department not found or not active');
  return dept.departmentId;
}

const duplicateMessage = (name, type) => `A ${TYPE_LABEL[type]} called "${name}" already exists`;

const shape = (r) => ({
  roomId: r.roomId,
  roomName: r.roomName,
  roomType: r.roomType,
  departmentId: r.departmentId,
  department: r.department?.departmentName ?? null,
  staff: r.facilitators.map((f) => ({ id: f.facilitatorId, name: f.facilitatorName, role: f.role })),
});

// GET /api/rooms
// Every room with the staff currently assigned to it.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const rooms = await prisma.room.findMany({
      orderBy: [{ roomType: 'asc' }, { roomName: 'asc' }],
      include: {
        department: { select: { departmentName: true } },
        facilitators: { select: { facilitatorId: true, facilitatorName: true, role: true } },
      },
    });
    res.json(rooms.map(shape));
  })
);

// POST /api/rooms      body: { roomName, roomType: "room" | "lab" | "pharmacy", departmentId? }
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const roomName = cleanName(req.body.roomName);
    const { roomType } = req.body;
    if (!ROOM_TYPES.includes(roomType)) {
      throw new ApiError(400, `roomType must be one of: ${ROOM_TYPES.join(', ')}`);
    }
    const departmentId = await resolveDepartment(req.body.departmentId);

    let room;
    try {
      room = await prisma.room.create({
        data: { roomName, roomType, departmentId },
        include: {
          department: { select: { departmentName: true } },
          facilitators: { select: { facilitatorId: true, facilitatorName: true, role: true } },
        },
      });
    } catch (err) {
      if (err.code === 'P2002') throw new ApiError(409, duplicateMessage(roomName, roomType));
      throw err;
    }
    res.status(201).json(shape(room));
  })
);

// PATCH /api/rooms/:id      body: { roomName?, departmentId? (null clears it) }
// The type is fixed once a room exists: delete and recreate to change it.
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new ApiError(400, 'id must be an integer');

    const existing = await prisma.room.findUnique({
      where: { roomId: id },
      include: { facilitators: { select: { departmentId: true } } },
    });
    if (!existing) throw new ApiError(404, 'Room not found');

    const data = {};
    if (req.body.roomName !== undefined) data.roomName = cleanName(req.body.roomName);
    if (req.body.departmentId !== undefined) {
      const departmentId = await resolveDepartment(req.body.departmentId);
      // Don't strand staff in a room that no longer matches their department.
      if (departmentId != null && existing.facilitators.some((f) => f.departmentId !== departmentId)) {
        throw new ApiError(409, 'Staff from other departments are assigned here. Unassign them first');
      }
      data.departmentId = departmentId;
    }
    if (Object.keys(data).length === 0) throw new ApiError(400, 'Nothing to update');

    let room;
    try {
      room = await prisma.room.update({
        where: { roomId: id },
        data,
        include: {
          department: { select: { departmentName: true } },
          facilitators: { select: { facilitatorId: true, facilitatorName: true, role: true } },
        },
      });
    } catch (err) {
      if (err.code === 'P2002') throw new ApiError(409, duplicateMessage(data.roomName, existing.roomType));
      throw err;
    }
    res.json(shape(room));
  })
);

// DELETE /api/rooms/:id   (also accepted as POST /api/rooms/:id/delete, for HTTP
// helpers that only wrap get/post/patch, which is what the admin screen uses)
// Refused while staff are assigned, so patients are never sent to a place that no longer exists.
const removeRoom = asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new ApiError(400, 'id must be an integer');

    const assigned = await prisma.facilitator.count({ where: { roomId: id } });
    if (assigned > 0) {
      throw new ApiError(409, `${assigned} staff member${assigned === 1 ? ' is' : 's are'} still assigned here. Unassign them first`);
    }
    try {
      await prisma.room.delete({ where: { roomId: id } });
    } catch (err) {
      if (err.code === 'P2025') throw new ApiError(404, 'Room not found');
      throw err;
    }
    res.json({ deleted: true });
});
router.delete('/:id', removeRoom);
router.post('/:id/delete', removeRoom);

module.exports = router;