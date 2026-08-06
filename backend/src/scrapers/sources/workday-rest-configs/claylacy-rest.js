'use strict';

/**
 * Clay Lacy Aviation (US business-aviation / charter) Workday REST config.
 *
 * Verified 2026-08-06: claylacy.wd501.myworkdayjobs.com/wday/cxs/claylacy/
 * Clay_Lacy_Aviation_Careers/jobs — 29 postings incl. ~11 pilot-titled roles
 * ("Pilot: Captain - Gulfstream G600", "Pilot: Captain - Challenger 300",
 * "Pilot: Lead Captain - Falcon 900 EASy", "Pilot: Pilatus PC24 - Captain").
 * robots.txt allows /Clay_Lacy_Aviation_Careers/ (only /refreshFacet/ blocked).
 */

module.exports = {
  tenant: 'claylacy',
  subdomain: 'wd501',
  site: 'Clay_Lacy_Aviation_Careers',
};
