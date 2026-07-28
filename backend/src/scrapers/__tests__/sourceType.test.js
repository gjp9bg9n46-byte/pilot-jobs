'use strict';

// Fixture tests for classifySourceType. Run: node src/scrapers/__tests__/sourceType.test.js
const assert = require('assert');
const { classifySourceType } = require('../sourceType');

const cases = [
  // Emirates — the applyUrl avature.js builds on whichever host we settle on.
  ['https://external.emiratesgroupcareers.com/en_US/careersmarketplace/ApplicationMethods?jobId=123', null, 'direct_ats', 'Emirates vanity ApplicationMethods'],
  ['https://emiratesjobs.avature.net/careersmarketplace/ApplicationMethods?jobId=123', null, 'direct_ats', 'Emirates avature.net host'],
  ['https://tmf.avature.net/careersmarketplace/ApplicationMethods?jobId=123', null, 'direct_ats', 'generic avature.net'],
  // sourcePlatform fallback when the URL host is inconclusive.
  ['https://some-carrier-vanity.example/apply', 'AVATURE', 'direct_ats', 'AVATURE platform fallback'],
  // Direct ATS platform domains.
  ['https://carrier.wd1.myworkdayjobs.com/en-US/ext/job/123', null, 'direct_ats', 'Workday'],
  ['https://careers.icims.com/jobs/1/job', null, 'direct_ats', 'iCIMS'],
  ['https://boards.greenhouse.io/co/jobs/1', null, 'direct_ats', 'Greenhouse'],
  ['https://jobs.lever.co/co/1', null, 'direct_ats', 'Lever'],
  ['https://tenant.taleo.net/careersection/x/jobdetail.ftl?job=1', null, 'direct_ats', 'Taleo'],
  ['https://jobs.smartrecruiters.com/co/1', null, 'direct_ats', 'SmartRecruiters'],
  // Operator-direct.
  ['https://www.usajobs.gov/job/1', null, 'operator_direct', 'USAJobs'],
  ['https://aircairo.com/careers/1', null, 'operator_direct', 'aircairo operator site'],
  ['https://magellanaviation.com/careers/1', null, 'operator_direct', 'Magellan operator site'],
  // Aggregators.
  ['https://www.adzuna.co.uk/land/ad/1', null, 'aggregator', 'Adzuna'],
  ['https://jooble.org/away/1', null, 'aggregator', 'Jooble'],
  ['https://www.careerjet.com/jobad/1', null, 'aggregator', 'Careerjet'],
  ['https://www.aviationjobsearch.com/jobs/1', null, 'aggregator', 'Aviation Job Search'],
  // Unknown.
  ['https://example.com/apply', null, null, 'unknown domain → null'],
];

let pass = 0;
for (const [url, sp, expected, label] of cases) {
  const got = classifySourceType(url, sp);
  assert.strictEqual(got, expected, `${label}: expected ${expected}, got ${got}`);
  pass++;
}
console.log(`classifySourceType: ${pass}/${cases.length} passed`);
console.log('ALL SOURCETYPE FIXTURE TESTS PASSED');
