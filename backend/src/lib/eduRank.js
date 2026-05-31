'use strict';

const EDU_RANK = { high_school: 1, technical: 2, bachelor: 3, masters: 4, doctorate: 5 };

/**
 * Parses an ICAO ELP level string to an integer (4, 5, or 6).
 * Handles: '4', 'Level 4', 'LEVEL_4', 'ICAO Level 6', etc.
 * Returns null when unparseable.
 */
function parseElpLevel(str) {
  if (str == null) return null;
  const m = String(str).match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return n >= 1 && n <= 6 ? n : null;
}

module.exports = { EDU_RANK, parseElpLevel };
