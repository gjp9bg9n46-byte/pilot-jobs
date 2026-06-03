'use strict';

// Gate for actions that require an APPROVED employer (e.g. posting jobs).
// Must run AFTER requireEmployerAuth (which sets req.employer).
const MESSAGES = {
  PENDING: 'Your employer account is pending approval. You cannot post jobs until an admin approves your account.',
  REJECTED: 'Your employer account application was rejected. Contact support if you believe this is an error.',
  SUSPENDED: 'Your employer account is suspended. Existing listings remain live, but you cannot post new jobs.',
};

module.exports = (req, res, next) => {
  if (!req.employer) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (req.employer.status !== 'APPROVED') {
    return res.status(403).json({
      error: MESSAGES[req.employer.status] || 'Your employer account is not approved.',
      status: req.employer.status,
    });
  }
  next();
};
