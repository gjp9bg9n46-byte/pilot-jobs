const jwt = require('jsonwebtoken');
const prisma = require('../config/database');

// Optional auth: decode the token if present + valid → set req.pilot; otherwise
// (no token, or invalid/expired token) set req.pilot = null and continue (no 401).
// Used by public-readable endpoints that enrich differently when a pilot is known.
module.exports = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) { req.pilot = null; return next(); }
  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    const pilot = await prisma.pilot.findUnique({ where: { id: decoded.id } });
    req.pilot = pilot || null;
  } catch {
    req.pilot = null; // invalid/expired token → treat as logged-out, not a 401
  }
  next();
};
