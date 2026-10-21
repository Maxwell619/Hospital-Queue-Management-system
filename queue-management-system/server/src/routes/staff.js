const { Router } = require("express");
const bcrypt = require("bcryptjs");
const prisma = require("../db");
const asyncHandler = require("../lib/asyncHandler");
const ApiError = require("../lib/ApiError");
const { authenticate, requireRole } = require("../middleware/authenticate");

const router = Router();

// Everything in this file is administrator-only.
router.use(authenticate, requireRole("administrator"));

const STAFF_TYPES = ["facilitator", "triage_nurse", "receptionist", "administrator"];
const FACILITATOR_ROLES = ["doctor", "labstaff", "pharmacist"];
const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/;
const MIN_PASSWORD_LENGTH = 8;

// POST /api/staff
// Body: { staffType, name, username, password, departmentId?, role?, station? }
//   facilitator   -> needs departmentId and role (doctor | labstaff | pharmacist)
//   triage_nurse  -> no department; station optional
//   receptionist  -> no department; station optional
//   administrator -> no department
//
// Triage nurses and receptionists work across the whole hospital, so
// departmentId is neither required nor stored for them. This relies on
// TriageNurse.facilitatorId and TriageNurse.departmentId being optional in
// schema.prisma (Receptionist.facilitatorId already is).
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { staffType, name, username, password, departmentId, role, station } = req.body;

    if (!STAFF_TYPES.includes(staffType)) {
      throw new ApiError(400, `staffType must be one of: ${STAFF_TYPES.join(", ")}`);
    }
    if (typeof name !== "string" || !name.trim()) throw new ApiError(400, "name is required");
    if (typeof username !== "string" || !USERNAME_PATTERN.test(username)) {
      throw new ApiError(
        400,
        "username must be 3-30 characters: lowercase letters, digits, dots, dashes or underscores"
      );
    }
    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
      throw new ApiError(400, `password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }

    // Only facilitators belong to a department.
    let department = null;
    if (staffType === "facilitator") {
      const id = Number(departmentId);
      if (!Number.isInteger(id)) throw new ApiError(400, "departmentId is required");
      department = await prisma.department.findUnique({ where: { departmentId: id } });
      if (!department || !department.isActive) {
        throw new ApiError(404, "Department not found or not active");
      }
      if (!FACILITATOR_ROLES.includes(role)) {
        throw new ApiError(400, `role must be one of: ${FACILITATOR_ROLES.join(", ")}`);
      }
    }

    const cleanName = name.trim();
    const cleanStation = typeof station === "string" && station.trim() ? station.trim() : undefined;
    const passwordHash = await bcrypt.hash(password, 10);

    let created;
    try {
      if (staffType === "facilitator") {
        const row = await prisma.facilitator.create({
          data: {
            facilitatorName: cleanName,
            departmentId: department.departmentId,
            role,
            username,
            passwordHash,
          },
        });
        created = { id: row.facilitatorId, role: row.role };
      } else if (staffType === "triage_nurse") {
        const row = await prisma.triageNurse.create({
          data: {
            nurseName: cleanName,
            station: cleanStation,
            username,
            passwordHash,
          },
        });
        created = { id: row.nurseId };
      } else if (staffType === "receptionist") {
        const row = await prisma.receptionist.create({
          data: {
            receptionistName: cleanName,
            station: cleanStation,
            username,
            passwordHash,
          },
        });
        created = { id: row.receptionistId };
      } else {
        const row = await prisma.administrator.create({
          data: { adminName: cleanName, username, passwordHash },
        });
        created = { id: row.adminId };
      }
    } catch (err) {
      if (err.code === "P2002") throw new ApiError(409, "That username is already taken");
      throw err;
    }

    // Never send passwordHash back -- build the response explicitly.
    res.status(201).json({
      staffType,
      name: cleanName,
      username,
      department: department ? department.departmentName : null,
      ...created,
    });
  })
);

// GET /api/staff
// Everyone who can log in, newest types grouped together, hashes excluded.
// Only facilitators show a department; nurses and receptionists are
// hospital-wide.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const [facilitators, nurses, receptionists, admins] = await Promise.all([
      prisma.facilitator.findMany({
        orderBy: { facilitatorName: "asc" },
        select: {
          facilitatorId: true,
          facilitatorName: true,
          username: true,
          role: true,
          department: { select: { departmentName: true } },
        },
      }),
      prisma.triageNurse.findMany({
        orderBy: { nurseName: "asc" },
        select: { nurseId: true, nurseName: true, username: true },
      }),
      prisma.receptionist.findMany({
        orderBy: { receptionistName: "asc" },
        select: { receptionistId: true, receptionistName: true, username: true },
      }),
      prisma.administrator.findMany({
        orderBy: { adminName: "asc" },
        select: { adminId: true, adminName: true, username: true },
      }),
    ]);

    res.json([
      ...admins.map((a) => ({
        staffType: "administrator", id: a.adminId, name: a.adminName,
        username: a.username, role: null, department: null,
      })),
      ...receptionists.map((r) => ({
        staffType: "receptionist", id: r.receptionistId, name: r.receptionistName,
        username: r.username, role: null, department: null,
      })),
      ...nurses.map((n) => ({
        staffType: "triage_nurse", id: n.nurseId, name: n.nurseName,
        username: n.username, role: null, department: null,
      })),
      ...facilitators.map((f) => ({
        staffType: "facilitator", id: f.facilitatorId, name: f.facilitatorName,
        username: f.username, role: f.role, department: f.department.departmentName,
      })),
    ]);
  })
);

module.exports = router;