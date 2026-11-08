// Remove regenerable build data, keeping dependencies, native configuration,
// signing files and completed Android packages under app/build/outputs.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--dry-run')) {
  throw new Error('Usage: npm run clean -- [--dry-run]');
}
const dryRun = args.includes('--dry-run');
const targets = new Set();
const entries = (dir) => fs.existsSync(dir)
  ? fs.readdirSync(dir, { withFileTypes: true })
  : [];
const add = (...parts) => targets.add(path.join(root, ...parts));

for (const name of ['dist', '.expo', '.DS_Store']) add(name);
for (const name of ['.gradle', '.cxx', 'build', 'app/.cxx']) add('android', name);
for (const entry of entries(path.join(root, 'android/app/build'))) {
  if (entry.name !== 'outputs') add('android/app/build', entry.name);
}

// Only Android-generated directories inside packages are disposable. Packages'
// top-level build/lib/dist directories often contain required runtime code.
function cleanPackage(packageDir) {
  for (const name of ['build', '.cxx', '.gradle']) {
    targets.add(path.join(packageDir, 'android', name));
  }
}
const modules = path.join(root, 'node_modules');
for (const entry of entries(modules)) {
  if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
  const dir = path.join(modules, entry.name);
  if (entry.name.startsWith('@')) {
    for (const child of entries(dir)) {
      if (child.isDirectory()) cleanPackage(path.join(dir, child.name));
    }
  } else {
    cleanPackage(dir);
  }
}
const gradlePlugin = path.join(modules, '@react-native/gradle-plugin');
targets.add(path.join(gradlePlugin, '.gradle'));
for (const entry of entries(gradlePlugin)) {
  if (entry.isDirectory()) targets.add(path.join(gradlePlugin, entry.name, 'build'));
}

function findFinderFiles(dir) {
  for (const entry of entries(dir)) {
    const file = path.join(dir, entry.name);
    if (entry.name === '.DS_Store') targets.add(file);
    else if (entry.isDirectory()) findFinderFiles(file);
  }
}
for (const dir of ['src', 'assets']) findFinderFiles(path.join(root, dir));

let count = 0;
for (const target of targets) {
  if (!fs.existsSync(target)) continue;
  console.log(`${dryRun ? 'Would remove' : 'Removing'} ${path.relative(root, target)}`);
  if (!dryRun) fs.rmSync(target, { recursive: true, force: true });
  count++;
}
console.log(`${dryRun ? 'Found' : 'Removed'} ${count} generated paths.`);
