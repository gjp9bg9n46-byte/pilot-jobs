'use strict';

const jwt = require('jsonwebtoken');
const prisma = require('../config/database');

// Accepts EITHER a pilot token ({ id }) or an employer token ({ employerId,
// type:'employer' }) and resolves the account. Sets:
//   req.account = { userType, id, email, emailVerified, name }
// Used by endpoints that serve both roles (e.g. /auth/resend-verification).
module.exports = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    if (decoded.type === 'employer') {
      const emp = await prisma.employer.findUnique({ where: { id: decoded.employerId } });
      if (!emp) return res.status(401).json({ error: 'Account not found' });
      req.account = { userType: 'employer', id: emp.id, email: emp.contactEmail, emailVerified: emp.emailVerified, name: emp.contactName || emp.companyName };
    } else {
      const pilot = await prisma.pilot.findUnique({ where: { id: decoded.id } });
      if (!pilot) return res.status(401).json({ error: 'Account not found' });
      req.account = { userType: 'pilot', id: pilot.id, email: pilot.email, emailVerified: pilot.emailVerified, name: [pilot.firstName, pilot.lastName].filter(Boolean).join(' ') || pilot.email };
    }
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};
