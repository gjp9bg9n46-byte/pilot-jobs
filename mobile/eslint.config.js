// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// ── What Hermes does not have ───────────────────────────────────────────────
// The app runs on Hermes, not on the JavaScriptCore in a browser, and the gap
// only shows up on a device — web and the simulator's dev bundle can both be
// happy while a release build throws "undefined is not a function". These are
// the modern APIs Hermes still lacks (or only has behind a flag), banned here
// so the failure is a lint error on this machine instead of a crash report
// from a phone.
//
// Add to this list rather than relaxing it. If one of these genuinely becomes
// available in the Hermes that ships with our Expo SDK, delete the line and
// say so in the commit.
const HERMES_MISSING = [
  { object: 'Array', property: 'fromAsync', message: 'Hermes has no Array.fromAsync.' },
  { object: 'Object', property: 'groupBy', message: 'Hermes has no Object.groupBy — group it by hand.' },
  { object: 'Map', property: 'groupBy', message: 'Hermes has no Map.groupBy — group it by hand.' },
  { object: 'Promise', property: 'withResolvers', message: 'Hermes has no Promise.withResolvers.' },
];
const HERMES_MISSING_GLOBALS = [
  { name: 'structuredClone', message: 'Hermes has no structuredClone — clone explicitly.' },
  { name: 'reportError', message: 'Hermes has no reportError.' },
];
// Methods with no safe static check (any object could own one), caught by name.
const HERMES_MISSING_METHODS = ['toSorted', 'toReversed', 'toSpliced'];

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'scripts/*'],
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    rules: {
      'no-restricted-properties': ['error', ...HERMES_MISSING],
      'no-restricted-globals': ['error', ...HERMES_MISSING_GLOBALS],
      'no-restricted-syntax': ['error',
        ...HERMES_MISSING_METHODS.map((m) => ({
          // `.callee` matters: without it the rule also fired on `r.group`
          // passed as an ARGUMENT to another call.
          selector: `CallExpression > MemberExpression.callee[property.name='${m}']`,
          message: `Hermes has no Array.prototype.${m} — use a copy and sort/reverse it.`,
        })),
        // A Map or a Set in persisted query data is the bug that took the
        // Logbook down twice: the cache is written with JSON.stringify, a Map
        // serialises to {}, and the next launch rehydrates an object with no
        // .get. Build collections in `select`, which is not persisted.
        {
          selector: "Property[key.name='queryFn'] NewExpression[callee.name=/^(Map|Set|WeakMap|WeakSet)$/]",
          message: 'A Map/Set returned from queryFn cannot survive the persisted cache (JSON turns it into {}). Return plain data and build the collection in `select`.',
        },
      ],
    },
  },
]);
