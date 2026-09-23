const { Router } = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../db');
const asyncHandler = require('../lib/asyncHandler');
const ApiError = require('../lib/ApiError');

const router = Router();

// Maps the login-time "staffType" to the right table, its id column, and
// its display-name column. staffType is the auth/permission tier
// (facilitator/triage_nurse/receptionist/administrator) -- not to be
// confused with facilitator.role (doctor/lab/pharmacist), which is a
// separate, finer-grained field only facilitators have.
const STAFF_TABLES = {
  facilitator: { model: 'facilitator', idField: 'facilitatorId', nameField: 'facilitatorName' },
  triage_nurse: { model: 'triageNurse', idField: 'nurseId', nameField: 'nurseName' },
  receptionist: { model: 'receptionist', idField: 'receptionistId', nameField: 'receptionistName' },
  administrator: { model: 'administrator', idField: 'adminId', nameField: 'adminName' },
};

// POST /api/auth/login
// Body: { staffType, username, password }
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { staffType, username, password } = req.body;

    if (!staffType || !username || !password) {
      throw new ApiError(400, 'staffType, username, and password are required');
    }

    const table = STAFF_TABLES[staffType];
    if (!table) {
      throw new ApiError(400, `staffType must be one of: ${Object.keys(STAFF_TABLES).join(', ')}`);
    }

    const staffMember = await prisma[table.model].findUnique({ where: { username } });

    // Same error for "no such user" and "wrong password" -- don't leak
    // which one it was.
    if (!staffMember) {
      throw new ApiError(401, 'Invalid username or password');
    }

    const passwordMatches = await bcrypt.compare(password, staffMember.passwordHash);
    if (!passwordMatches) {
      throw new ApiError(401, 'Invalid username or password');
    }

    const id = staffMember[table.idField];
    const name = staffMember[table.nameField];

    const token = jwt.sign(
      { id, staffType, username, name },
      process.env.JWT_SECRET,
      { expiresIn: '8h' } // one shift
    );

    res.json({ token, staffType, id, name });
  })
);

module.exports = router;