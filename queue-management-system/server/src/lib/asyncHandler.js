// Wrap an async route handler so a rejected promise is forwarded to
// Express's error middleware instead of crashing the process.
//
// Usage: router.get("/", asyncHandler(async (req, res) => { ... }));

function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
