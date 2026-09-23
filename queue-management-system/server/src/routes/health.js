const { Router } = require("express");
const prisma = require("../lib/prisma");
const asyncHandler = require("../lib/asyncHandler");

const router = Router();

// GET /api/health -- confirms the process is up AND the DB is reachable,
// so a load balancer / uptime check catches a dead database too.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", time: new Date().toISOString() });
  })
);

module.exports = router;
