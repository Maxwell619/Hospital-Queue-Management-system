const ApiError = require('../lib/ApiError');

// A "room" record is any place patients can be sent to.
const ROOM_TYPES = ['room', 'lab', 'pharmacy'];
const TYPE_LABEL = { room: 'consultation room', lab: 'laboratory', pharmacy: 'pharmacy' };

// Which kind of place each kind of staff member works in.
const ROLE_ROOM_TYPE = { doctor: 'room', labstaff: 'lab', pharmacist: 'pharmacy' };
const ROLE_LABEL = { doctor: 'Doctors', labstaff: 'Lab staff', pharmacist: 'Pharmacists' };

const MAX_ROOM_NAME_LENGTH = 40;

// Throws unless `room` is a sensible place for this staff member:
//   - the right type (a doctor can't be placed in a lab), and
//   - if the room belongs to a department, the same department as the staff member.
// `staff` is { role, departmentId }.
function checkRoomFits(room, staff) {
  const needed = ROLE_ROOM_TYPE[staff.role];
  if (needed && room.roomType !== needed) {
    throw new ApiError(
      409,
      `${ROLE_LABEL[staff.role]} work in a ${TYPE_LABEL[needed]}, but "${room.roomName}" is a ${TYPE_LABEL[room.roomType]}`
    );
  }
  if (room.departmentId != null && room.departmentId !== staff.departmentId) {
    throw new ApiError(409, `"${room.roomName}" belongs to a different department`);
  }
}

module.exports = { ROOM_TYPES, TYPE_LABEL, ROLE_ROOM_TYPE, MAX_ROOM_NAME_LENGTH, checkRoomFits };