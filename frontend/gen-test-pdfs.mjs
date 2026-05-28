// Generates test PDFs for both templates using renderToFile
// Run after esbuild bundles the components.

import { renderToFile } from '@react-pdf/renderer';
import React from 'react';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TEST_DATA = {
  pilot: {
    firstName: 'Hamdan',
    lastName: 'Al-Rashidi',
    email: 'hamdan.alrashidi@example.com',
    phone: '+971 50 123 4567',
    city: 'Dubai',
    country: 'UAE',
    nationality: 'Emirati',
    dateOfBirth: '1985-03-14T00:00:00.000Z',
  },
  certificates: [
    { type: 'ATPL', issuingAuthority: 'EASA', certificateNumber: 'FCL.A.12345', issueDate: '2015-06-01T00:00:00.000Z', expiryDate: null },
    { type: 'ELP',  issuingAuthority: 'GCAA', englishLevel: '6', expiryDate: '2027-06-01T00:00:00.000Z' },
  ],
  ratings: [
    { aircraftType: 'B737-800', category: 'Multi-Engine', issuingAuthority: 'EASA', capacity: 'PIC', hoursOnType: 4200, expiryDate: '2025-12-01T00:00:00.000Z' },
  ],
  medicals: [
    { medicalClass: 'CLASS_1', issuingAuthority: 'EASA', issueDate: '2024-01-10T00:00:00.000Z', expiryDate: '2026-01-10T00:00:00.000Z' },
  ],
  training: [
    { type: 'OPC / LPC', provider: 'SimuFlite', completedAt: '2025-01-15T00:00:00.000Z', expiresAt: '2026-01-15T00:00:00.000Z' },
    { type: 'ATQP', provider: 'Emirates Aviation', completedAt: '2024-09-20T00:00:00.000Z', expiresAt: '2025-09-20T00:00:00.000Z' },
  ],
  totals: {
    totalTime: 8540,
    picTime: 5230,
    sicTime: 2890,
    nightTime: 1120,
    instrumentTime: 0,
    instrumentActualTime: 780,
    instrumentSimTime: 145,
    multiEngineTime: 8540,
    turbineTime: 8540,
    jetTime: 7200,
    crossCountryTime: 3400,
    landingsDay: 2840,
    landingsNight: 560,
  },
  recency: {
    hours90d: 68,
    hours12m: 412,
    sectors90: 42,
    landingsDay90: 38,
    landingsNight90: 4,
  },
  aircraftTypes: [
    { type: 'B737-800', hours: 4200 },
    { type: 'A320',     hours: 2890 },
    { type: 'B737-700', hours: 1450 },
  ],
  cv: {
    education: [
      { degree: 'BSc Aeronautical Engineering', institution: 'Embry-Riddle Aeronautical University', fieldOfStudy: 'Aviation Science', year: '2007' },
    ],
    languages: [],
    skills: ['CRM', 'RVSM', 'ETOPS', 'FMS/CDU', 'TCAS II', 'HF/VHF Radio'],
    other: [],
    photoUrl: null,
    // Manual CV sections
    typeRatings: [
      { aircraftType: 'B737-800', capacity: 'PIC', dateIssued: '2016-03-01T00:00:00.000Z', expiryDate: '2026-03-01T00:00:00.000Z' },
      { aircraftType: 'B737-700', capacity: 'PIC', dateIssued: '2014-07-15T00:00:00.000Z', expiryDate: '2025-07-15T00:00:00.000Z' },
      { aircraftType: 'A320',     capacity: 'SIC', dateIssued: '2012-11-01T00:00:00.000Z', expiryDate: '2025-11-01T00:00:00.000Z' },
    ],
    licenses: [
      { type: 'ATPL', number: 'FCL.A.12345', authority: 'EASA', issueDate: '2015-06-01T00:00:00.000Z' },
      { type: 'CPL',  number: 'AE-CPL-9876', authority: 'UAE-GCAA', issueDate: '2010-04-20T00:00:00.000Z' },
    ],
    medical: {
      class: '1',
      country: 'EASA / Germany',
      issueDate: '2024-01-10T00:00:00.000Z',
      expiryDate: '2026-01-10T00:00:00.000Z',
    },
    icaoEnglish: {
      level: '6',
      dateIssued: '2021-06-01T00:00:00.000Z',
      expiryDate: '2027-06-01T00:00:00.000Z',
      otherLanguages: [
        { language: 'Arabic',  proficiency: 'Native' },
        { language: 'French',  proficiency: 'Conversational' },
      ],
    },
  },
};

const TemplateApproach = (await import(pathToFileURL(join(__dirname, 'dist-test/TemplateApproach.js')).href)).default;
const TemplateFinal    = (await import(pathToFileURL(join(__dirname, 'dist-test/TemplateFinal.js')).href)).default;

const docApproach = React.createElement(TemplateApproach, { data: TEST_DATA });
const docFinal    = React.createElement(TemplateFinal,    { data: TEST_DATA });

await renderToFile(docApproach, join(__dirname, 'test-approach.pdf'));
console.log('✓ test-approach.pdf');

await renderToFile(docFinal, join(__dirname, 'test-final.pdf'));
console.log('✓ test-final.pdf');
