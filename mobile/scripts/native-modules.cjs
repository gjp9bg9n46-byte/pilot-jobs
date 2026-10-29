#!/usr/bin/env node
/* eslint-disable no-console */
// ── What is in the binary, versus what the JS now needs ─────────────────────
//
// An EAS update ships JavaScript into a binary that is already on the phone.
// If that JavaScript imports a module with native code the binary does not
// contain, the screen throws the moment it loads — and the update looks fine
// everywhere it was tested, because this machine has the module installed.
//
// expo-image-manipulator is exactly that case: added to fix HEIC, and
// unusable until a new build ships.
//
//   node scripts/native-modules.cjs            # compare, exit 1 on drift
//   node scripts/native-modules.cjs --record   # after cutting a build
//
// native-modules.json is committed and records what the last BUILD contained.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LOCK = path.join(ROOT, 'native-modules.json');

/** Dependencies that ship native code, i.e. that an update cannot add. */
function nativeDeps() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const out = [];
  for (const name of Object.keys(pkg.dependencies || {})) {
    const dir = path.join(ROOT, 'node_modules', name);
    if (!fs.existsSync(dir)) continue;
    // A package with an ios/ or android/ folder, or an Expo module config,
    // has native code that must be compiled into the binary.
    const native = ['ios', 'android', 'expo-module.config.json']
      .some((f) => fs.existsSync(path.join(dir, f)));
    if (native) out.push(name);
  }
  return out.sort();
}

const now = nativeDeps();

if (process.argv.includes('--record')) {
  const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  fs.writeFileSync(LOCK, `${JSON.stringify({
    recordedAt: new Date().toISOString(),
    version: appJson.expo?.version,
    buildNumber: appJson.expo?.ios?.buildNumber,
    modules: now,
  }, null, 2)}\n`);
  console.log(`recorded ${now.length} native modules for ${appJson.expo?.version} (${appJson.expo?.ios?.buildNumber})`);
  process.exit(0);
}

if (!fs.existsSync(LOCK)) {
  console.error('No native-modules.json. Run: node scripts/native-modules.cjs --record');
  process.exit(2);
}
const lock = JSON.parse(fs.readFileSync(LOCK, 'utf8'));
const added = now.filter((m) => !lock.modules.includes(m));
const removed = lock.modules.filter((m) => !now.includes(m));

console.log(`native modules: ${now.length} now, ${lock.modules.length} in build ${lock.buildNumber} (${lock.version})`);
if (!added.length && !removed.length) {
  console.log('unchanged — this JS can ship as an EAS update.');
  process.exit(0);
}
for (const m of added) console.error(`  + ${m}  — NOT in build ${lock.buildNumber}`);
for (const m of removed) console.log(`  - ${m}  (gone from package.json; harmless for an update)`);
if (added.length) {
  console.error(`\n${added.length} native module(s) added since the last build.`);
  console.error('An EAS update would import them into a binary that does not have them,');
  console.error('and the screen that imports them throws on load. This needs a NEW BUILD.');
  process.exit(1);
}
process.exit(0);
