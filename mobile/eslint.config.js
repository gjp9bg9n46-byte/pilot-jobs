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
        // ── What the persisted cache cannot hold ───────────────────────
        // The cache is written with JSON.stringify and read with JSON.parse.
        // A value that does not survive that works on the launch that
        // fetched it and breaks on every launch after: a Map rehydrates as
        // {} with no .get, which took the Logbook tab down twice. Keep plain
        // JSON in the queryFn and build the value in `select`, which runs
        // after rehydration and is never persisted.
        //
        // src/lib/jsonSafe.ts catches the rest at runtime in development,
        // including shapes that come straight off the server. This rule is
        // for the ones written by hand, which is where they have come from.
        {
          selector: "Property[key.name='queryFn'] NewExpression[callee.name=/^(Map|Set|WeakMap|WeakSet)$/]",
          message: 'A Map/Set cannot survive the persisted cache — JSON turns it into {} and the next launch has no .get/.has. Return plain data from queryFn and build the collection in `select`.',
        },
        {
          selector: "Property[key.name='queryFn'] NewExpression[callee.name='Date']",
          message: 'A Date cannot survive the persisted cache — it comes back as a string and .getTime() is gone. Keep the ISO string in queryFn and parse it in `select` or at render.',
        },
        {
          // Any other `new Thing()` returned from a queryFn: a class instance
          // keeps its fields and loses its prototype, so its methods vanish
          // on the next launch. Error is allowed — those are thrown, not
          // returned, which is how a failed bundle stays a failure.
          selector: "Property[key.name='queryFn'] NewExpression:not([callee.name=/^(Error|Map|Set|WeakMap|WeakSet|Date)$/])",
          message: 'A class instance cannot survive the persisted cache — it loses its prototype, so its methods are gone after a restart. Return plain data from queryFn and build the instance in `select`.',
        },
      ],
    },
  },
]);
