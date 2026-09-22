// throw new ApiError(404, "Ticket not found") from any route handler and
// the error middleware in middleware/errorHandler.js will turn it into
// the right HTTP response.

class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

module.exports = ApiError;
