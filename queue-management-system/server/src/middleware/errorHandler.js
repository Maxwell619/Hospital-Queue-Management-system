const { Prisma } = require("@prisma/client");
const ApiError = require("../lib/ApiError");

// 404 for routes that don't match anything -- registered after all routes.
function notFound(req, res, next) {
  next(new ApiError(404, `No route for ${req.method} ${req.originalUrl}`));
}

// Registered last. Express recognizes this as error middleware because it
// takes four arguments.
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ error: err.message, details: err.details });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return res.status(409).json({
        error: `Duplicate value for ${err.meta?.target?.join(", ") || "a unique field"}`,
      });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Record not found" });
    }
    if (err.code === "P2003") {
      return res.status(400).json({ error: "Referenced record does not exist" });
    }
  }

  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
}

module.exports = { notFound, errorHandler };
