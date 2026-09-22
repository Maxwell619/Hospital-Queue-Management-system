const { Router } = require("express");

const router = Router();

router.use("/health", require("./health"));
router.use("/departments", require("./departments"));
router.use("/patients", require("./patients"));
router.use("/tickets", require("./tickets"));

// Phase 2 continues here, following the same pattern:
// router.use("/facilitators", require("./facilitators"));
// router.use("/triage-nurses", require("./triageNurses"));
// router.use("/receptionists", require("./receptionists"));
// router.use("/services", require("./services"));
// router.use("/service-assignments", require("./serviceAssignments"));
// router.use("/notifications", require("./notifications"));
// router.use("/reports", require("./reports"));
// router.use("/administrators", require("./administrators"));

module.exports = router;
