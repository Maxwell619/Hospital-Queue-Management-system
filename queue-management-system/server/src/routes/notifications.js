const { Router } = require("express");
const prisma = require('../db');
const asyncHandler = require("../lib/asyncHandler");
const ApiError = require("../lib/ApiError");

const router = Router();

// POST /api/notifications
// Records that a notification was sent for a ticket (e.g. "you're next").
// Actually dispatching the SMS/USSD push is a separate concern (a gateway
// integration in phase 5) -- this route just logs it against the ticket.
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { ticketNumber, channel, status } = req.body;
    if (!ticketNumber || !channel) {
      throw new ApiError(400, "ticketNumber and channel are required");
    }

    const notification = await prisma.notification.create({
      data: {
        ticketNumber: Number(ticketNumber),
        channel,
        status: status || "sent",
        sentAt: new Date(),
      },
    });

    res.status(201).json(notification);
  })
);

// GET /api/notifications?ticketNumber=
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { ticketNumber } = req.query;
    if (!ticketNumber) throw new ApiError(400, "ticketNumber query param is required");

    const notifications = await prisma.notification.findMany({
      where: { ticketNumber: Number(ticketNumber) },
      orderBy: { sentAt: "desc" },
    });

    res.json(notifications);
  })
);

module.exports = router;
