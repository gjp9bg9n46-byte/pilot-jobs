'use strict';

// Log-only email stubs for the employer portal. These write the intended
// recipient/subject/body to the logger so there's a record now; swap the
// bodies for Resend calls in a future task without changing call sites.
const logger = require('../config/logger');

// NOTE: a `message` field is included so the record is visible in the Console
// transport (which uses winston's simple() formatter — object-only logs render
// as "[object Object]"). All the specified fields are retained for the eventual
// Resend swap.
function notifyAdminNewSignup(employer) {
  logger.info({
    message: `email_stub | New employer signup: ${employer.companyName} -> admin@cockpithire.com`,
    type: 'email_stub',
    to: 'admin@cockpithire.com',
    subject: `New employer signup: ${employer.companyName}`,
    body: `${employer.companyName} (${employer.companyType}) from ${employer.country} just registered. Review at /admin/employers.`,
    employerId: employer.id,
  });
}

function notifyEmployerApproved(employer) {
  logger.info({
    message: `email_stub | Approved: ${employer.companyName} -> ${employer.contactEmail}`,
    type: 'email_stub',
    to: employer.contactEmail,
    subject: 'Your CockpitHire employer account is approved',
    body: `Hi ${employer.contactName}, your account for ${employer.companyName} is approved. You can post jobs at https://cockpithire.com/employer/dashboard.`,
    employerId: employer.id,
  });
}

function notifyEmployerRejected(employer, reason) {
  logger.info({
    message: `email_stub | Rejected: ${employer.companyName} -> ${employer.contactEmail}`,
    type: 'email_stub',
    to: employer.contactEmail,
    subject: 'Your CockpitHire employer application',
    body: `Hi ${employer.contactName}, after review, we're unable to approve your application at this time. Reason: ${reason}. If you'd like to discuss, please reply to this email.`,
    employerId: employer.id,
    reason,
  });
}

function notifyEmployerSuspended(employer, reason) {
  logger.info({
    message: `email_stub | Suspended: ${employer.companyName} -> ${employer.contactEmail}`,
    type: 'email_stub',
    to: employer.contactEmail,
    subject: 'Your CockpitHire employer account has been suspended',
    body: `Hi ${employer.contactName}, your account for ${employer.companyName} has been suspended. Existing job listings remain live, but you cannot post new jobs. Reason: ${reason}. Please reply to this email to discuss.`,
    employerId: employer.id,
    reason,
  });
}

module.exports = { notifyAdminNewSignup, notifyEmployerApproved, notifyEmployerRejected, notifyEmployerSuspended };
