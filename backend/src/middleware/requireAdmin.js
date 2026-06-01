'use strict';

module.exports = (req, res, next) => {
  if (!req.pilot?.isAdmin) return res.status(404).json({ error: 'Not found' });
  next();
};
