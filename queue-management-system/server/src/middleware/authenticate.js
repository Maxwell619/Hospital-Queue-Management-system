const jwt = require('jsonwebtoken');
const ApiError = require('../lib/ApiError');

// Verifies the Authorization: Bearer <token> header and attaches the
// decoded payload as req.user = { id, staffType, username, name }. Every
// route that needs a logged-in staff member goes through this first.
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new ApiError(401, 'Missing or malformed Authorization header'));
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    next(new ApiError(401, 'Invalid or expired token'));
  }
}

// requireRole('receptionist') or requireRole('facilitator', 'administrator')
// -- call after authenticate(). Checks req.user.staffType (set at login
// time in routes/auth.js) against the allowed list for this route.
function requireRole(...allowedStaffTypes) {
  return function (req, res, next) {
    if (!req.user) {
      return next(new ApiError(401, 'Not authenticated'));
    }
    if (!allowedStaffTypes.includes(req.user.staffType)) {
      return next(new ApiError(403, `This action requires role: ${allowedStaffTypes.join(' or ')}`));
    }
    next();
  };
}

module.exports = { authenticate, requireRole };