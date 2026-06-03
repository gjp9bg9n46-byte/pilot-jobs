'use strict';

const jwt = require('jsonwebtoken');
const prisma = require('../config/database');

// Authenticates an employer. Rejects (401) any token that is not an employer
// token — pilot tokens carry { id } with no `type`, so the explicit
// `type === 'employer'` check makes the two token classes non-interchangeable.
module.exports = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'employer' || !decoded.employerId) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    const employer = await prisma.employer.findUnique({ where: { id: decoded.employerId } });
    if (!employer) return res.status(401).json({ error: 'Employer not found' });
    req.employer = employer;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};
