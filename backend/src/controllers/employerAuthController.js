'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const { EmployerType } = require('@prisma/client');
const prisma = require('../config/database');
const { notifyAdminNewSignup } = require('../services/employerEmails');

// Employer tokens are namespaced with type:'employer' so they can never be
// interchanged with pilot tokens (which carry { id } and no type). Same
// JWT_SECRET / JWT_EXPIRES_IN as pilot auth — no new secrets introduced.
const signToken = (employerId) =>
  jwt.sign({ employerId, type: 'employer' }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

const VALID_TYPES = Object.values(EmployerType);

// Fields an employer may set/update on their own profile. Everything else
// (status, approvedBy, approvedAt, id, contactEmail, passwordHash, airlineId,
// timestamps) is server-controlled and stripped before any write.
const UPDATABLE_FIELDS = [
  'companyName',
  'companyType',
  'country',
  'headquartersCity',
  'website',
  'description',
  'logoUrl',
  'iataCode',
  'icaoCode',
  'contactName',
  'contactPhone',
];

const stripSensitive = (employer) => {
  const { passwordHash, ...rest } = employer;
  return rest;
};

exports.register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const {
      companyName,
      companyType,
      country,
      contactName,
      contactEmail,
      password,
      headquartersCity,
      website,
      description,
      iataCode,
      icaoCode,
      contactPhone,
    } = req.body;

    // Validate enum explicitly (express-validator only checked non-empty)
    if (!VALID_TYPES.includes(companyType)) {
      return res.status(400).json({
        errors: [{ path: 'companyType', msg: `Invalid company type. Must be one of: ${VALID_TYPES.join(', ')}` }],
      });
    }

    const exists = await prisma.employer.findUnique({ where: { contactEmail } });
    if (exists) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 12);

    // status is ALWAYS PENDING on registration — never honoured from the body.
    const created = await prisma.employer.create({
      data: {
        companyName,
        companyType,
        country,
        contactName,
        contactEmail,
        passwordHash,
        headquartersCity: headquartersCity ?? null,
        website: website ?? null,
        description: description ?? null,
        iataCode: iataCode ?? null,
        icaoCode: icaoCode ?? null,
        contactPhone: contactPhone ?? null,
        status: 'PENDING',
      },
    });

    notifyAdminNewSignup(created);
    const token = signToken(created.id);
    res.status(201).json({ token, employer: stripSensitive(created) });
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { contactEmail, password } = req.body;
    const employer = contactEmail
      ? await prisma.employer.findUnique({ where: { contactEmail } })
      : null;

    // Generic message on either failure — never reveal whether the email exists.
    if (!employer || !(await bcrypt.compare(password ?? '', employer.passwordHash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await prisma.employer.update({
      where: { id: employer.id },
      data: { lastActiveAt: new Date() },
    });

    const token = signToken(employer.id);
    res.json({ token, employer: stripSensitive(employer) });
  } catch (err) {
    next(err);
  }
};

exports.me = async (req, res) => {
  res.json(stripSensitive(req.employer));
};

exports.updateMe = async (req, res, next) => {
  try {
    // Whitelist: copy only updatable fields. status/approvedBy/approvedAt/id/
    // contactEmail/passwordHash/airlineId are never read from the body.
    const data = {};
    for (const field of UPDATABLE_FIELDS) {
      if (field in req.body) data[field] = req.body[field];
    }

    // If companyType is being changed, it must be a valid enum value.
    if ('companyType' in data && !VALID_TYPES.includes(data.companyType)) {
      return res.status(400).json({
        errors: [{ path: 'companyType', msg: `Invalid company type. Must be one of: ${VALID_TYPES.join(', ')}` }],
      });
    }

    const updated = await prisma.employer.update({
      where: { id: req.employer.id },
      data,
    });

    res.json(stripSensitive(updated));
  } catch (err) {
    next(err);
  }
};
