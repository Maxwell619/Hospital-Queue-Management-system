const { Router } = require("express");
const prisma = require("../lib/prisma");
const asyncHandler = require("../lib/asyncHandler");
const ApiError = require("../lib/ApiError");

const router = Router();

// POST /api/patients
// Registers a new patient. phoneNumber is unique -- Prisma's P2002 error
// (translated in middleware/errorHandler.js) covers the "already
// registered" case, so this route doesn't need to check for it manually.
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { patientName, phoneNumber, nationalId, dateOfBirth } = req.body;

    if (!patientName || !phoneNumber) {
      throw new ApiError(400, "patientName and phoneNumber are required");
    }

    const patient = await prisma.patient.create({
      data: {
        patientName,
        phoneNumber,
        nationalId: nationalId || null,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        checkInTime: new Date(),
      },
    });

    res.status(201).json(patient);
  })
);

// GET /api/patients/:id
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const patientId = Number(req.params.id);
    if (!Number.isInteger(patientId)) throw new ApiError(400, "id must be an integer");

    const patient = await prisma.patient.findUnique({ where: { patientId } });
    if (!patient) throw new ApiError(404, "Patient not found");

    res.json(patient);
  })
);

// GET /api/patients?phone=0722000006
// Used by the USSD/web flow to re-identify a returning patient by their
// auto-detected phone number instead of asking them to register again.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { phone } = req.query;
    if (!phone) throw new ApiError(400, "phone query param is required");

    const patient = await prisma.patient.findUnique({ where: { phoneNumber: String(phone) } });
    if (!patient) throw new ApiError(404, "No patient registered with that phone number");

    res.json(patient);
  })
);

module.exports = router;
