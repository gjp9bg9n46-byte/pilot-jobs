'use strict';

/**
 * Seeds 29 skeleton airline rows for the Airline Factfile feature.
 * All factfile data (payRanges, bases, fleet, etc.) starts empty — community fills it in.
 * Safe to re-run: uses upsert on iataCode so existing rows are not overwritten.
 */

const prisma = require('../src/config/database');

const VALID_REGIONS = new Set(['Europe', 'Americas', 'Asia-Pacific', 'Middle East', 'Africa']);

const AIRLINES = [
  // Europe
  { name: 'Ryanair',            iataCode: 'FR', icaoCode: 'RYR', country: 'Ireland',        region: 'Europe'       },
  { name: 'easyJet',            iataCode: 'U2', icaoCode: 'EZY', country: 'United Kingdom',  region: 'Europe'       },
  { name: 'Wizz Air',           iataCode: 'W6', icaoCode: 'WZZ', country: 'Hungary',         region: 'Europe'       },
  { name: 'Lufthansa',          iataCode: 'LH', icaoCode: 'DLH', country: 'Germany',         region: 'Europe'       },
  { name: 'British Airways',    iataCode: 'BA', icaoCode: 'BAW', country: 'United Kingdom',  region: 'Europe'       },
  { name: 'Air France',         iataCode: 'AF', icaoCode: 'AFR', country: 'France',          region: 'Europe'       },
  { name: 'KLM',                iataCode: 'KL', icaoCode: 'KLM', country: 'Netherlands',     region: 'Europe'       },
  { name: 'Turkish Airlines',   iataCode: 'TK', icaoCode: 'THY', country: 'Turkey',          region: 'Europe'       },
  { name: 'airBaltic',          iataCode: 'BT', icaoCode: 'BTI', country: 'Latvia',          region: 'Europe'       },
  { name: 'Helvetic Airways',   iataCode: '2L', icaoCode: 'OAW', country: 'Switzerland',     region: 'Europe'       },
  { name: 'TUI Fly',            iataCode: 'X3', icaoCode: 'TUI', country: 'Germany',         region: 'Europe'       },
  { name: 'Jet2',               iataCode: 'LS', icaoCode: 'EXS', country: 'United Kingdom',  region: 'Europe'       },
  { name: 'Norwegian',          iataCode: 'DY', icaoCode: 'NAX', country: 'Norway',          region: 'Europe'       },
  { name: 'SAS',                iataCode: 'SK', icaoCode: 'SAS', country: 'Sweden',          region: 'Europe'       },
  { name: 'Aer Lingus',         iataCode: 'EI', icaoCode: 'EIN', country: 'Ireland',         region: 'Europe'       },
  // Middle East
  { name: 'Emirates',           iataCode: 'EK', icaoCode: 'UAE', country: 'UAE',             region: 'Middle East'  },
  { name: 'Qatar Airways',      iataCode: 'QR', icaoCode: 'QTR', country: 'Qatar',           region: 'Middle East'  },
  { name: 'Etihad Airways',     iataCode: 'EY', icaoCode: 'ETD', country: 'UAE',             region: 'Middle East'  },
  { name: 'Saudia',             iataCode: 'SV', icaoCode: 'SVA', country: 'Saudi Arabia',    region: 'Middle East'  },
  { name: 'flydubai',           iataCode: 'FZ', icaoCode: 'FDB', country: 'UAE',             region: 'Middle East'  },
  // Americas
  { name: 'Delta Air Lines',    iataCode: 'DL', icaoCode: 'DAL', country: 'United States',   region: 'Americas'     },
  { name: 'United Airlines',    iataCode: 'UA', icaoCode: 'UAL', country: 'United States',   region: 'Americas'     },
  { name: 'American Airlines',  iataCode: 'AA', icaoCode: 'AAL', country: 'United States',   region: 'Americas'     },
  { name: 'Air Canada',         iataCode: 'AC', icaoCode: 'ACA', country: 'Canada',          region: 'Americas'     },
  { name: 'JetBlue',            iataCode: 'B6', icaoCode: 'JBU', country: 'United States',   region: 'Americas'     },
  // Asia-Pacific
  { name: 'Singapore Airlines', iataCode: 'SQ', icaoCode: 'SIA', country: 'Singapore',       region: 'Asia-Pacific' },
  { name: 'Cathay Pacific',     iataCode: 'CX', icaoCode: 'CPA', country: 'Hong Kong',       region: 'Asia-Pacific' },
  { name: 'Qantas',             iataCode: 'QF', icaoCode: 'QFA', country: 'Australia',       region: 'Asia-Pacific' },
  { name: 'ANA',                iataCode: 'NH', icaoCode: 'ANA', country: 'Japan',           region: 'Asia-Pacific' },
];

async function main() {
  // Validate all regions before touching the DB
  for (const airline of AIRLINES) {
    if (!VALID_REGIONS.has(airline.region)) {
      throw new Error(`Invalid region '${airline.region}' for airline '${airline.name}'`);
    }
  }

  let created = 0;
  let skipped = 0;

  for (const airline of AIRLINES) {
    const result = await prisma.airline.upsert({
      where: { iataCode: airline.iataCode },
      update: {},  // never overwrite existing data on re-run
      create: {
        name:         airline.name,
        iataCode:     airline.iataCode,
        icaoCode:     airline.icaoCode,
        country:      airline.country,
        region:       airline.region,
        hiringStatus: 'UNKNOWN',
        hiringFrequency: 'UNKNOWN',
      },
    });

    if (result.createdAt.getTime() === result.lastUpdatedAt.getTime()) {
      created++;
    } else {
      skipped++;
    }
  }

  const total = await prisma.airline.count();
  console.log(`\nSeed complete:`);
  console.log(`  Created : ${created}`);
  console.log(`  Skipped : ${skipped} (already existed)`);
  console.log(`  Total   : ${total} airlines in DB`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
