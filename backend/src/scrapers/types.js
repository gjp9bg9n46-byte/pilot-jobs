'use strict';

/**
 * @typedef {'LEVER'|'GREENHOUSE'|'WORKDAY'} SourcePlatform
 */

/**
 * Raw job as returned by a source before normalization.
 * Each source populates what it can; all fields except source/externalId are optional.
 *
 * @typedef {Object} RawJob
 * @property {SourcePlatform} sourcePlatform
 * @property {string}         externalId       - stable ID from the source (Lever UUID, Greenhouse int ID, etc.)
 * @property {string}         title
 * @property {string}         company          - display name from employer config (sources don't always include it)
 * @property {string}         [location]
 * @property {string}         [country]
 * @property {string}         [description]    - plain text, may be empty for Workday list-only scrape
 * @property {string}         applyUrl         - canonical URL on the source site
 * @property {string}         [sourceUrl]      - same as applyUrl unless different canonical link exists
 * @property {string|Date}    [postedAt]
 * @property {string|Date}    [expiresAt]
 * @property {string}         [role]
 * @property {string}         [contractType]
 * @property {string}         [region]
 * @property {number}         [salaryMin]
 * @property {number}         [salaryMax]
 * @property {string}         [salaryCurrency]
 * @property {string}         [salaryPeriod]
 */

/**
 * Normalized job ready for DB upsert — conforms exactly to the Prisma Job model.
 *
 * @typedef {Object} NormalizedJob
 * @property {SourcePlatform} sourcePlatform
 * @property {string}         externalId
 * @property {string}         title
 * @property {string}         company
 * @property {string}         location
 * @property {string|null}    country
 * @property {string}         description
 * @property {string}         applyUrl
 * @property {string|null}    sourceUrl
 * @property {Date}           postedAt
 * @property {Date|null}      expiresAt
 * @property {string|null}    role
 * @property {string|null}    contractType
 * @property {string|null}    region
 * @property {number|null}    salaryMin
 * @property {number|null}    salaryMax
 * @property {string|null}    salaryCurrency
 * @property {string|null}    salaryPeriod
 * @property {string[]}       reqCertificates
 * @property {string[]}       reqAuthorities
 * @property {string[]}       reqAircraftTypes
 * @property {string|null}    reqMedicalClass
 * @property {number|null}    reqMinTotalHours
 * @property {number|null}    reqMinPicHours
 * @property {number|null}    reqMinMultiEngineHours
 * @property {number|null}    reqMinTurbineHours
 * @property {number|null}    reqMinInstrumentHours
 * @property {boolean}        reqWillingToRelocate
 */

/**
 * Per-run stats logged at the end of each ingestion pass.
 *
 * @typedef {Object} IngestionStats
 * @property {string}  source
 * @property {string}  employer
 * @property {number}  requestsMade
 * @property {number}  fetched
 * @property {number}  keptAfterFilter
 * @property {number}  upserted
 * @property {number}  markedInactive
 * @property {number}  errors
 */

module.exports = {};
