'use strict';
/**
 * ⚠ DATABASE SAFETY
 * DO NOT use --force-reset. Use prisma migrate dev for development
 * and prisma migrate deploy for production.
 * Force-reset wipes ALL data with no recovery path.
 * Run scripts/backup-db.js before any destructive schema operation.
 */


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

  // ───────────────────────── EXPANSION (Step A) ─────────────────────────
  // region is constrained to: Europe | Americas | Asia-Pacific | Middle East | Africa.
  // Skeletons only — factual fields (HQ/bases/fleet) are enriched in a later step.

  // ── Americas — US LCC/ULCC ──
  { name: 'Southwest Airlines', iataCode: 'WN', icaoCode: 'SWA', country: 'United States', region: 'Americas' },
  { name: 'Alaska Airlines',    iataCode: 'AS', icaoCode: 'ASA', country: 'United States', region: 'Americas' },
  { name: 'Spirit Airlines',    iataCode: 'NK', icaoCode: 'NKS', country: 'United States', region: 'Americas' },
  { name: 'Frontier Airlines',  iataCode: 'F9', icaoCode: 'FFT', country: 'United States', region: 'Americas' },
  { name: 'Hawaiian Airlines',  iataCode: 'HA', icaoCode: 'HAL', country: 'United States', region: 'Americas' },
  { name: 'Allegiant Air',      iataCode: 'G4', icaoCode: 'AAY', country: 'United States', region: 'Americas' },
  { name: 'Sun Country Airlines', iataCode: 'SY', icaoCode: 'SCX', country: 'United States', region: 'Americas' },
  { name: 'Breeze Airways',     iataCode: 'MX', icaoCode: 'MXY', country: 'United States', region: 'Americas' },
  { name: 'Avelo Airlines',     iataCode: 'XP', icaoCode: 'VXP', country: 'United States', region: 'Americas' },
  // ── Americas — US Regionals ──
  { name: 'SkyWest Airlines',   iataCode: 'OO', icaoCode: 'SKW', country: 'United States', region: 'Americas' },
  { name: 'Republic Airways',   iataCode: 'YX', icaoCode: 'RPA', country: 'United States', region: 'Americas' },
  { name: 'Envoy Air',          iataCode: 'MQ', icaoCode: 'ENY', country: 'United States', region: 'Americas' },
  { name: 'PSA Airlines',       iataCode: 'OH', icaoCode: 'JIA', country: 'United States', region: 'Americas' },
  { name: 'Endeavor Air',       iataCode: '9E', icaoCode: 'EDV', country: 'United States', region: 'Americas' },
  { name: 'Mesa Airlines',      iataCode: 'YV', icaoCode: 'ASH', country: 'United States', region: 'Americas' },
  { name: 'Piedmont Airlines',  iataCode: 'PT', icaoCode: 'PDT', country: 'United States', region: 'Americas' },
  { name: 'GoJet Airlines',     iataCode: 'G7', icaoCode: 'GJS', country: 'United States', region: 'Americas' },
  { name: 'Horizon Air',        iataCode: 'QX', icaoCode: 'QXE', country: 'United States', region: 'Americas' },
  { name: 'CommuteAir',         iataCode: 'C5', icaoCode: 'UCA', country: 'United States', region: 'Americas' },
  { name: 'Air Wisconsin',      iataCode: 'ZW', icaoCode: 'AWI', country: 'United States', region: 'Americas' },
  // ── Americas — US Cargo ──
  { name: 'FedEx Express',      iataCode: 'FX', icaoCode: 'FDX', country: 'United States', region: 'Americas' },
  { name: 'UPS Airlines',       iataCode: '5X', icaoCode: 'UPS', country: 'United States', region: 'Americas' },
  { name: 'Atlas Air',          iataCode: '5Y', icaoCode: 'GTI', country: 'United States', region: 'Americas' },
  { name: 'Kalitta Air',        iataCode: 'K4', icaoCode: 'CKS', country: 'United States', region: 'Americas' },
  { name: 'Polar Air Cargo',    iataCode: 'PO', icaoCode: 'PAC', country: 'United States', region: 'Americas' },
  { name: 'ABX Air',            iataCode: 'GB', icaoCode: 'ABX', country: 'United States', region: 'Americas' },
  { name: 'Western Global Airlines', iataCode: 'KD', icaoCode: 'WGN', country: 'United States', region: 'Americas' },
  { name: 'National Airlines',  iataCode: 'N8', icaoCode: 'NCR', country: 'United States', region: 'Americas' },
  // ── Americas — Canada ──
  { name: 'WestJet',            iataCode: 'WS', icaoCode: 'WJA', country: 'Canada', region: 'Americas' },
  { name: 'Porter Airlines',    iataCode: 'PD', icaoCode: 'POE', country: 'Canada', region: 'Americas' },
  { name: 'Air Transat',        iataCode: 'TS', icaoCode: 'TSC', country: 'Canada', region: 'Americas' },
  { name: 'Flair Airlines',     iataCode: 'F8', icaoCode: 'FLE', country: 'Canada', region: 'Americas' },
  // ── Americas — Latin America ──
  { name: 'LATAM Airlines',     iataCode: 'LA', icaoCode: 'LAN', country: 'Chile', region: 'Americas' },
  { name: 'Azul Brazilian Airlines', iataCode: 'AD', icaoCode: 'AZU', country: 'Brazil', region: 'Americas' },
  { name: 'GOL Linhas Aéreas',  iataCode: 'G3', icaoCode: 'GLO', country: 'Brazil', region: 'Americas' },
  { name: 'Avianca',            iataCode: 'AV', icaoCode: 'AVA', country: 'Colombia', region: 'Americas' },
  { name: 'Copa Airlines',      iataCode: 'CM', icaoCode: 'CMP', country: 'Panama', region: 'Americas' },
  { name: 'Aeroméxico',         iataCode: 'AM', icaoCode: 'AMX', country: 'Mexico', region: 'Americas' },
  { name: 'Volaris',            iataCode: 'Y4', icaoCode: 'VOI', country: 'Mexico', region: 'Americas' },
  { name: 'Viva Aerobus',       iataCode: 'VB', icaoCode: 'VIV', country: 'Mexico', region: 'Americas' },
  { name: 'SKY Airline',        iataCode: 'H2', icaoCode: 'SKU', country: 'Chile', region: 'Americas' },
  { name: 'JetSMART',           iataCode: 'JA', icaoCode: 'JAT', country: 'Chile', region: 'Americas' },
  { name: 'Aerolíneas Argentinas', iataCode: 'AR', icaoCode: 'ARG', country: 'Argentina', region: 'Americas' },
  { name: 'Caribbean Airlines', iataCode: 'BW', icaoCode: 'BWA', country: 'Trinidad and Tobago', region: 'Americas' },

  // ── Europe — Full-service ──
  { name: 'Iberia',             iataCode: 'IB', icaoCode: 'IBE', country: 'Spain', region: 'Europe' },
  { name: 'ITA Airways',        iataCode: 'AZ', icaoCode: 'ITY', country: 'Italy', region: 'Europe' },
  { name: 'SWISS',              iataCode: 'LX', icaoCode: 'SWR', country: 'Switzerland', region: 'Europe' },
  { name: 'Austrian Airlines',  iataCode: 'OS', icaoCode: 'AUA', country: 'Austria', region: 'Europe' },
  { name: 'Brussels Airlines',  iataCode: 'SN', icaoCode: 'BEL', country: 'Belgium', region: 'Europe' },
  { name: 'TAP Air Portugal',   iataCode: 'TP', icaoCode: 'TAP', country: 'Portugal', region: 'Europe' },
  { name: 'Finnair',            iataCode: 'AY', icaoCode: 'FIN', country: 'Finland', region: 'Europe' },
  { name: 'LOT Polish Airlines', iataCode: 'LO', icaoCode: 'LOT', country: 'Poland', region: 'Europe' },
  { name: 'Aegean Airlines',    iataCode: 'A3', icaoCode: 'AEE', country: 'Greece', region: 'Europe' },
  { name: 'Croatia Airlines',   iataCode: 'OU', icaoCode: 'CTN', country: 'Croatia', region: 'Europe' },
  { name: 'Air Serbia',         iataCode: 'JU', icaoCode: 'ASL', country: 'Serbia', region: 'Europe' },
  { name: 'Icelandair',         iataCode: 'FI', icaoCode: 'ICE', country: 'Iceland', region: 'Europe' },
  { name: 'Luxair',             iataCode: 'LG', icaoCode: 'LGL', country: 'Luxembourg', region: 'Europe' },
  { name: 'Air Europa',         iataCode: 'UX', icaoCode: 'AEA', country: 'Spain', region: 'Europe' },
  { name: 'Virgin Atlantic',    iataCode: 'VS', icaoCode: 'VIR', country: 'United Kingdom', region: 'Europe' },
  // ── Europe — LCC ──
  { name: 'Vueling',            iataCode: 'VY', icaoCode: 'VLG', country: 'Spain', region: 'Europe' },
  { name: 'Eurowings',          iataCode: 'EW', icaoCode: 'EWG', country: 'Germany', region: 'Europe' },
  { name: 'Transavia',          iataCode: 'HV', icaoCode: 'TRA', country: 'Netherlands', region: 'Europe' },
  { name: 'Volotea',            iataCode: 'V7', icaoCode: 'VOE', country: 'Spain', region: 'Europe' },
  { name: 'Smartwings',         iataCode: 'QS', icaoCode: 'TVS', country: 'Czech Republic', region: 'Europe' },
  { name: 'Pegasus Airlines',   iataCode: 'PC', icaoCode: 'PGT', country: 'Turkey', region: 'Europe' },
  { name: 'TUI Airways',        iataCode: 'BY', icaoCode: 'TOM', country: 'United Kingdom', region: 'Europe' },
  // ── Europe — Regional ──
  { name: 'Loganair',           iataCode: 'LM', icaoCode: 'LOG', country: 'United Kingdom', region: 'Europe' },
  { name: 'Eastern Airways',    iataCode: 'T3', icaoCode: 'EZE', country: 'United Kingdom', region: 'Europe' },
  { name: 'Widerøe',            iataCode: 'WF', icaoCode: 'WIF', country: 'Norway', region: 'Europe' },
  { name: 'Air Nostrum',        iataCode: 'YW', icaoCode: 'ANE', country: 'Spain', region: 'Europe' },
  { name: 'CityJet',            iataCode: 'WX', icaoCode: 'BCY', country: 'Ireland', region: 'Europe' },
  { name: 'Binter Canarias',    iataCode: 'NT', icaoCode: 'IBB', country: 'Spain', region: 'Europe' },
  // ── Europe — Cargo ──
  { name: 'Cargolux',           iataCode: 'CV', icaoCode: 'CLX', country: 'Luxembourg', region: 'Europe' },
  { name: 'DHL Air',            iataCode: 'D0', icaoCode: 'DHK', country: 'United Kingdom', region: 'Europe' },
  { name: 'European Air Transport (DHL)', iataCode: 'QY', icaoCode: 'BCS', country: 'Germany', region: 'Europe' },
  { name: 'ASL Airlines Ireland', iataCode: 'AG', icaoCode: 'ABR', country: 'Ireland', region: 'Europe' },

  // ── Middle East ──
  { name: 'Gulf Air',           iataCode: 'GF', icaoCode: 'GFA', country: 'Bahrain', region: 'Middle East' },
  { name: 'Kuwait Airways',     iataCode: 'KU', icaoCode: 'KAC', country: 'Kuwait', region: 'Middle East' },
  { name: 'Oman Air',           iataCode: 'WY', icaoCode: 'OMA', country: 'Oman', region: 'Middle East' },
  { name: 'Royal Jordanian',    iataCode: 'RJ', icaoCode: 'RJA', country: 'Jordan', region: 'Middle East' },
  { name: 'Middle East Airlines', iataCode: 'ME', icaoCode: 'MEA', country: 'Lebanon', region: 'Middle East' },
  { name: 'Air Arabia',         iataCode: 'G9', icaoCode: 'ABY', country: 'UAE', region: 'Middle East' },
  { name: 'El Al',              iataCode: 'LY', icaoCode: 'ELY', country: 'Israel', region: 'Middle East' },
  { name: 'Jazeera Airways',    iataCode: 'J9', icaoCode: 'JZR', country: 'Kuwait', region: 'Middle East' },
  { name: 'SalamAir',           iataCode: 'OV', icaoCode: 'OMS', country: 'Oman', region: 'Middle East' },
  { name: 'flynas',             iataCode: 'XY', icaoCode: 'KNE', country: 'Saudi Arabia', region: 'Middle East' },
  { name: 'Iraqi Airways',      iataCode: 'IA', icaoCode: 'IAW', country: 'Iraq', region: 'Middle East' },
  { name: 'Israir',             iataCode: '6H', icaoCode: 'ISR', country: 'Israel', region: 'Middle East' },

  // ── Africa — North ──
  { name: 'EgyptAir',           iataCode: 'MS', icaoCode: 'MSR', country: 'Egypt', region: 'Africa' },
  { name: 'Royal Air Maroc',    iataCode: 'AT', icaoCode: 'RAM', country: 'Morocco', region: 'Africa' },
  { name: 'Tunisair',           iataCode: 'TU', icaoCode: 'TAR', country: 'Tunisia', region: 'Africa' },
  { name: 'Air Algérie',        iataCode: 'AH', icaoCode: 'DAH', country: 'Algeria', region: 'Africa' },
  { name: 'Air Cairo',          iataCode: 'SM', icaoCode: 'MSC', country: 'Egypt', region: 'Africa' },
  // ── Africa — Sub-Saharan ──
  { name: 'Ethiopian Airlines', iataCode: 'ET', icaoCode: 'ETH', country: 'Ethiopia', region: 'Africa' },
  { name: 'Kenya Airways',      iataCode: 'KQ', icaoCode: 'KQA', country: 'Kenya', region: 'Africa' },
  { name: 'South African Airways', iataCode: 'SA', icaoCode: 'SAA', country: 'South Africa', region: 'Africa' },
  { name: 'Airlink',            iataCode: '4Z', icaoCode: 'LNK', country: 'South Africa', region: 'Africa' },
  { name: 'FlySafair',          iataCode: 'FA', icaoCode: 'SFR', country: 'South Africa', region: 'Africa' },
  { name: 'Air Mauritius',      iataCode: 'MK', icaoCode: 'MAU', country: 'Mauritius', region: 'Africa' },
  { name: 'RwandAir',           iataCode: 'WB', icaoCode: 'RWD', country: 'Rwanda', region: 'Africa' },
  { name: 'Air Senegal',        iataCode: 'HC', icaoCode: 'SNG', country: 'Senegal', region: 'Africa' },
  { name: 'ASKY Airlines',      iataCode: 'KP', icaoCode: 'SKK', country: 'Togo', region: 'Africa' },
  { name: 'TAAG Angola Airlines', iataCode: 'DT', icaoCode: 'DTA', country: 'Angola', region: 'Africa' },
  { name: 'Air Côte d\'Ivoire', iataCode: 'HF', icaoCode: 'VRE', country: 'Côte d\'Ivoire', region: 'Africa' },
  { name: 'Precision Air',      iataCode: 'PW', icaoCode: 'PRF', country: 'Tanzania', region: 'Africa' },
  { name: 'Air Peace',          iataCode: 'P4', icaoCode: 'APK', country: 'Nigeria', region: 'Africa' },
  { name: 'Arik Air',           iataCode: 'W3', icaoCode: 'ARA', country: 'Nigeria', region: 'Africa' },
  { name: 'Fastjet',            iataCode: 'FN', icaoCode: 'FTZ', country: 'Zimbabwe', region: 'Africa' },

  // ── Asia-Pacific — East Asia ──
  { name: 'Japan Airlines',     iataCode: 'JL', icaoCode: 'JAL', country: 'Japan', region: 'Asia-Pacific' },
  { name: 'Korean Air',         iataCode: 'KE', icaoCode: 'KAL', country: 'South Korea', region: 'Asia-Pacific' },
  { name: 'Asiana Airlines',    iataCode: 'OZ', icaoCode: 'AAR', country: 'South Korea', region: 'Asia-Pacific' },
  { name: 'China Airlines',     iataCode: 'CI', icaoCode: 'CAL', country: 'Taiwan', region: 'Asia-Pacific' },
  { name: 'EVA Air',            iataCode: 'BR', icaoCode: 'EVA', country: 'Taiwan', region: 'Asia-Pacific' },
  { name: 'Air China',          iataCode: 'CA', icaoCode: 'CCA', country: 'China', region: 'Asia-Pacific' },
  { name: 'China Southern Airlines', iataCode: 'CZ', icaoCode: 'CSN', country: 'China', region: 'Asia-Pacific' },
  { name: 'China Eastern Airlines', iataCode: 'MU', icaoCode: 'CES', country: 'China', region: 'Asia-Pacific' },
  { name: 'Hainan Airlines',    iataCode: 'HU', icaoCode: 'CHH', country: 'China', region: 'Asia-Pacific' },
  { name: 'Xiamen Air',         iataCode: 'MF', icaoCode: 'CXA', country: 'China', region: 'Asia-Pacific' },
  { name: 'Shenzhen Airlines',  iataCode: 'ZH', icaoCode: 'CSZ', country: 'China', region: 'Asia-Pacific' },
  { name: 'Juneyao Airlines',   iataCode: 'HO', icaoCode: 'DKH', country: 'China', region: 'Asia-Pacific' },
  { name: 'Spring Airlines',    iataCode: '9C', icaoCode: 'CQH', country: 'China', region: 'Asia-Pacific' },
  { name: 'Skymark Airlines',   iataCode: 'BC', icaoCode: 'SKY', country: 'Japan', region: 'Asia-Pacific' },
  { name: 'Peach Aviation',     iataCode: 'MM', icaoCode: 'APJ', country: 'Japan', region: 'Asia-Pacific' },
  // ── Asia-Pacific — Southeast Asia ──
  { name: 'Thai Airways',       iataCode: 'TG', icaoCode: 'THA', country: 'Thailand', region: 'Asia-Pacific' },
  { name: 'Malaysia Airlines',  iataCode: 'MH', icaoCode: 'MAS', country: 'Malaysia', region: 'Asia-Pacific' },
  { name: 'Garuda Indonesia',   iataCode: 'GA', icaoCode: 'GIA', country: 'Indonesia', region: 'Asia-Pacific' },
  { name: 'Vietnam Airlines',   iataCode: 'VN', icaoCode: 'HVN', country: 'Vietnam', region: 'Asia-Pacific' },
  { name: 'Philippine Airlines', iataCode: 'PR', icaoCode: 'PAL', country: 'Philippines', region: 'Asia-Pacific' },
  { name: 'AirAsia',            iataCode: 'AK', icaoCode: 'AXM', country: 'Malaysia', region: 'Asia-Pacific' },
  { name: 'Cebu Pacific',       iataCode: '5J', icaoCode: 'CEB', country: 'Philippines', region: 'Asia-Pacific' },
  { name: 'Lion Air',           iataCode: 'JT', icaoCode: 'LNI', country: 'Indonesia', region: 'Asia-Pacific' },
  { name: 'VietJet Air',        iataCode: 'VJ', icaoCode: 'VJC', country: 'Vietnam', region: 'Asia-Pacific' },
  { name: 'Scoot',              iataCode: 'TR', icaoCode: 'TGW', country: 'Singapore', region: 'Asia-Pacific' },
  { name: 'Batik Air',          iataCode: 'ID', icaoCode: 'BTK', country: 'Indonesia', region: 'Asia-Pacific' },
  { name: 'Bamboo Airways',     iataCode: 'QH', icaoCode: 'BAV', country: 'Vietnam', region: 'Asia-Pacific' },
  { name: 'Royal Brunei Airlines', iataCode: 'BI', icaoCode: 'RBA', country: 'Brunei', region: 'Asia-Pacific' },
  // ── Asia-Pacific — South Asia ──
  { name: 'Air India',          iataCode: 'AI', icaoCode: 'AIC', country: 'India', region: 'Asia-Pacific' },
  { name: 'IndiGo',             iataCode: '6E', icaoCode: 'IGO', country: 'India', region: 'Asia-Pacific' },
  { name: 'SpiceJet',           iataCode: 'SG', icaoCode: 'SEJ', country: 'India', region: 'Asia-Pacific' },
  { name: 'SriLankan Airlines', iataCode: 'UL', icaoCode: 'ALK', country: 'Sri Lanka', region: 'Asia-Pacific' },
  { name: 'Biman Bangladesh Airlines', iataCode: 'BG', icaoCode: 'BBC', country: 'Bangladesh', region: 'Asia-Pacific' },
  { name: 'Nepal Airlines',     iataCode: 'RA', icaoCode: 'RNA', country: 'Nepal', region: 'Asia-Pacific' },
  // ── Asia-Pacific — Oceania & Central Asia ──
  { name: 'Air New Zealand',    iataCode: 'NZ', icaoCode: 'ANZ', country: 'New Zealand', region: 'Asia-Pacific' },
  { name: 'Virgin Australia',   iataCode: 'VA', icaoCode: 'VOZ', country: 'Australia', region: 'Asia-Pacific' },
  { name: 'Jetstar',            iataCode: 'JQ', icaoCode: 'JST', country: 'Australia', region: 'Asia-Pacific' },
  { name: 'Fiji Airways',       iataCode: 'FJ', icaoCode: 'FJI', country: 'Fiji', region: 'Asia-Pacific' },
  { name: 'Air Astana',         iataCode: 'KC', icaoCode: 'KZR', country: 'Kazakhstan', region: 'Asia-Pacific' },
  { name: 'Uzbekistan Airways', iataCode: 'HY', icaoCode: 'UZB', country: 'Uzbekistan', region: 'Asia-Pacific' },

  // ── Corporate / Charter (region by HQ; ICAO-only operators have iataCode: null) ──
  { name: 'NetJets',            iataCode: '1I', icaoCode: 'EJA', country: 'United States', region: 'Americas' },
  { name: 'Flexjet',            iataCode: null, icaoCode: 'LXJ', country: 'United States', region: 'Americas' },
  { name: 'VistaJet',           iataCode: null, icaoCode: 'VJT', country: 'Malta', region: 'Europe' },
  { name: 'GlobeAir',           iataCode: null, icaoCode: 'GAC', country: 'Austria', region: 'Europe' },
  { name: 'Bristow Group',      iataCode: null, icaoCode: 'BHL', country: 'United States', region: 'Americas' },
  { name: 'Erickson',           iataCode: null, icaoCode: 'EAC', country: 'United States', region: 'Americas' },
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
  const failed = [];

  for (const airline of AIRLINES) {
    // Key the upsert on IATA when present, else ICAO (some operators are ICAO-only).
    const where = airline.iataCode ? { iataCode: airline.iataCode } : { icaoCode: airline.icaoCode };
    try {
      const result = await prisma.airline.upsert({
        where,
        update: {},  // never overwrite existing data on re-run
        create: {
          name:         airline.name,
          iataCode:     airline.iataCode ?? null,
          icaoCode:     airline.icaoCode ?? null,
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
    } catch (err) {
      // Resilient: one bad row (e.g. unique-code collision) must not abort the run.
      failed.push({ name: airline.name, iata: airline.iataCode ?? null, icao: airline.icaoCode ?? null, error: err.code || err.message });
    }
  }

  const total = await prisma.airline.count();
  console.log(`\nSeed complete:`);
  console.log(`  Created : ${created}`);
  console.log(`  Skipped : ${skipped} (already existed)`);
  console.log(`  Failed  : ${failed.length}`);
  if (failed.length) console.log('  Failures:', JSON.stringify(failed, null, 2));
  console.log(`  Total   : ${total} airlines in DB`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
