// Aircraft type list — copied unchanged from AIRCRAFT_GROUPS in
// frontend/src/components/AircraftCombobox.jsx (+ its getVisible filter).
export const AIRCRAFT_GROUPS: { group: string; items: string[] }[] = [
  { group: 'Commercial — Airbus', items: ['A220-100', 'A220-300', 'A319', 'A319neo', 'A320', 'A320neo', 'A321', 'A321neo', 'A321XLR', 'A300-600', 'A310', 'A330-200', 'A330-300', 'A330-800neo', 'A330-900neo', 'A340-200', 'A340-300', 'A340-500', 'A340-600', 'A350-900', 'A350-1000'] },
  { group: 'Commercial — Boeing', items: ['717-200', '737-300', '737-400', '737-500', '737-700', '737-800', '737-900ER', '737 MAX 7', '737 MAX 8', '737 MAX 9', '737 MAX 10', '747-400', '747-8', '757-200', '757-300', '767-200', '767-300', '767-300ER', '767-400ER', '777-200', '777-200ER', '777-300ER', '777F', '777X', '787-8', '787-9', '787-10'] },
  { group: 'Commercial — Other', items: ['Fokker 70', 'Fokker 100', 'MD-83', 'MD-88', 'MD-90'] },
  { group: 'Regional Jet', items: ['CRJ-200', 'CRJ-700', 'CRJ-900', 'CRJ-1000', 'ERJ-145', 'ERJ-170', 'ERJ-175', 'ERJ-190', 'ERJ-195', 'E175-E2', 'E190-E2', 'E195-E2'] },
  { group: 'Regional Turboprop', items: ['ATR 42-500', 'ATR 42-600', 'ATR 72-500', 'ATR 72-600', 'Dash 8 Q200', 'Dash 8 Q300', 'Dash 8 Q400', 'DHC-6 Twin Otter', 'EMB 120', 'L-410', 'Saab 340', 'Saab 2000'] },
  { group: 'Business Jet', items: ['Global 5500', 'Global 6500', 'Global 7500', 'Learjet 45', 'Learjet 60', 'Learjet 75', 'Citation Mustang', 'Citation M2', 'Citation CJ1+', 'Citation CJ2+', 'Citation CJ3+', 'Citation CJ4', 'Citation Bravo', 'Citation Ultra', 'Citation Encore', 'Citation Excel', 'Citation XLS+', 'Citation Sovereign+', 'Citation Latitude', 'Citation Longitude', 'Citation X+', 'Falcon 2000LX', 'Falcon 50EX', 'Falcon 6X', 'Falcon 7X', 'Falcon 8X', 'Falcon 900LX', 'G280', 'G450', 'G550', 'G600', 'G650ER', 'G700', 'G800', 'Hawker 400XP', 'Hawker 800XP', 'Hawker 900XP', 'Hawker 4000', 'Phenom 100', 'Phenom 300', 'Legacy 450', 'Legacy 500', 'Legacy 600', 'Legacy 650', 'HondaJet Elite', 'PC-24', 'King Air C90', 'King Air 200', 'King Air 350'] },
  { group: 'Turboprop / Utility', items: ['Caravan 208B', 'TBM 700', 'TBM 850', 'TBM 910', 'TBM 930', 'TBM 940', 'TBM 960', 'PC-12', 'PC-12/47E', 'PC-12 NGX', 'M600', 'M600/SLS'] },
  { group: 'General Aviation', items: ['Bonanza G36', 'Baron 58', '172 Skyhawk', '182 Skylane', '210 Centurion', 'SR20', 'SR22', 'DA40', 'DA42', 'DA62', 'Mooney M20', 'PA-28 Warrior', 'PA-28 Arrow', 'PA-34 Seneca', 'PA-44 Seminole'] },
  { group: 'Helicopter', items: ['H125', 'H130', 'H135', 'H145', 'H160', 'H175', 'AS332', 'AS365', 'Bell 206', 'Bell 407', 'Bell 412', 'Bell 429', 'AW109', 'AW139', 'AW169', 'AW189', 'R22', 'R44', 'R66', 'S-76', 'S-92'] },
];

export function getVisibleAircraft(query: string): { group: string; items: string[] }[] {
  const q = (query || '').trim().toLowerCase();
  if (!q) return AIRCRAFT_GROUPS;
  return AIRCRAFT_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((item) => item.toLowerCase().includes(q)) }))
    .filter((g) => g.items.length > 0);
}
