// One rule, for one class of bug.
//
// `cleanField` was called in four places in logbookScanController and
// imported in none. Nothing caught it: it loads fine, the tests do not touch
// that path, and it only throws when a pilot opens the Scan screen — which is
// how it reached a device as a red banner reading "cleanField is not defined".
//
// no-undef is what finds a missing import in CommonJS. Deliberately narrow:
// this is a guard, not a style pass over a codebase that has none.
const globals = require('globals');

module.exports = [
  {
    files: ['src/**/*.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-undef': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
    },
  },
  {
    // These run inside page.evaluate(), so their bodies execute in the
    // browser Puppeteer is driving, not in Node.
    files: ['scripts/ats-discover.js', 'scripts/xhr-discover.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
