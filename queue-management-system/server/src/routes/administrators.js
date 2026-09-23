const { Router } = require("express");
const prisma = require('../db');
const asyncHandler = require("../lib/asyncHandler");
const ApiError = require("../lib/ApiError");

const router = Router();

// POST /api/administrators
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { adminName, phoneNumber } = req.body;
    if (!adminName) throw new ApiError(400, "adminName is required");

    const admin = await prisma.administrator.create({
      data: { adminName, phoneNumber: phoneNumber || null },
    });

    res.status(201).json(admin);
  })
);

// GET /api/administrators/:id
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const adminId = Number(req.params.id);
    if (!Number.isInteger(adminId)) throw new ApiError(400, "id must be an integer");

    const admin = await prisma.administrator.findUnique({ where: { adminId } });
    if (!admin) throw new ApiError(404, "Administrator not found");

    res.json(admin);
  })
);

module.exports = router;
