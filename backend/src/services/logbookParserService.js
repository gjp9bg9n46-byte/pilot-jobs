const pdfParse = require('pdf-parse');

function parseFloat0(val) {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function parseInt0(val) {
  const n = parseInt(val, 10);
  return isNaN(n) ? 0 : n;
}

// ForeFlight CSV export columns (standard layout)
async function parseForeFlight(buffer) {
  const text = buffer.toString('utf8');
  const lines = text.split('\n').filter(Boolean);
  // Find the data header row (ForeFlight has metadata rows before the table)
  const headerIdx = lines.findIndex((l) => l.includes('Date') && l.includes('AircraftID'));
  if (headerIdx === -1) throw new Error('Unrecognised ForeFlight format');

  const headers = lines[headerIdx].split(',').map((h) => h.trim().replace(/"/g, ''));
  const entries = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim().replace(/"/g, ''));
    const row = {};
    headers.forEach((h, idx) => (row[h] = cols[idx] || ''));

    if (!row['Date']) continue;

    entries.push({
      date: new Date(row['Date']),
      aircraftType: row['AircraftType'] || row['AircraftID'] || '',
      registration: row['AircraftID'] || '',
      departure: row['From'] || '',
      arrival: row['To'] || '',
      totalTime: parseFloat0(row['TotalTime']),
      picTime: parseFloat0(row['PIC']),
      sicTime: parseFloat0(row['SIC']),
      multiEngineTime: parseFloat0(row['MultiEngine']),
      turbineTime: parseFloat0(row['Turbine']),
      instrumentTime: parseFloat0(row['ActualInstrument']),
      nightTime: parseFloat0(row['Night']),
      landingsDay: parseInt0(row['DayLandings']),
      landingsNight: parseInt0(row['NightLandings']),
      remarks: row['Remarks'] || '',
    });
  }
  return entries;
}

// Logbook Pro CSV export
async function parseLogbookPro(buffer) {
  const text = buffer.toString('utf8');
  const lines = text.split('\n').filter(Boolean);
  const headerIdx = lines.findIndex((l) => /Date/i.test(l));
  if (headerIdx === -1) throw new Error('Unrecognised Logbook Pro format');

  const headers = lines[headerIdx].split(',').map((h) => h.trim().replace(/"/g, ''));
  const entries = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim().replace(/"/g, ''));
    const row = {};
    headers.forEach((h, idx) => (row[h] = cols[idx] || ''));
    if (!row['Date']) continue;

    entries.push({
      date: new Date(row['Date']),
      aircraftType: row['Aircraft Type'] || row['Type'] || '',
      registration: row['Tail Number'] || row['Registration'] || '',
      departure: row['Route From'] || row['Departure'] || '',
      arrival: row['Route To'] || row['Arrival'] || '',
      totalTime: parseFloat0(row['Total Time'] || row['Duration']),
      picTime: parseFloat0(row['PIC']),
      sicTime: parseFloat0(row['SIC']),
      multiEngineTime: parseFloat0(row['Multi Engine']),
      turbineTime: parseFloat0(row['Turbine']),
      instrumentTime: parseFloat0(row['Actual Instrument'] || row['IMC']),
      nightTime: parseFloat0(row['Night']),
      landingsDay: parseInt0(row['Day Landings']),
      landingsNight: parseInt0(row['Night Landings']),
      remarks: row['Remarks'] || row['Comments'] || '',
    });
  }
  return entries;
}

module.exports = { parseForeFlight, parseLogbookPro };
