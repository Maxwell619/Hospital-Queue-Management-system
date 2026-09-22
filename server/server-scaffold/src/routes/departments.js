const { Router } = require("express");
const prisma = require("../lib/prisma");
const asyncHandler = require("../lib/asyncHandler");
const ApiError = require("../lib/ApiError");

const router = Router();

// GET /api/departments
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const departments = await prisma.department.findMany({
      where: { isActive: true },
      orderBy: { departmentName: "asc" },
    });
    res.json(departments);
  })
);

// GET /api/departments/:id
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const departmentId = Number(req.params.id);
    if (!Number.isInteger(departmentId)) {
      throw new ApiError(400, "id must be an integer");
    }

    const department = await prisma.department.findUnique({ where: { departmentId } });
    if (!department) throw new ApiError(404, "Department not found");

    res.json(department);
  })
);

// POST /api/departments
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { departmentName, roomName } = req.body;
    if (!departmentName) throw new ApiError(400, "departmentName is required");

    const department = await prisma.department.create({
      data: { departmentName, roomName, isActive: true },
    });
    res.status(201).json(department);
  })
);

module.exports = router;
