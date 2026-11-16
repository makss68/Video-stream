// Creates src/config.local.ts (git-ignored: servers and logins) from its template
// when it is missing, so fresh clones and CI/Vercel builds compile. Never overwrites.
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'src');
const target = path.join(dir, 'config.local.ts');
const template = path.join(dir, 'config.local.example.ts');

if (!fs.existsSync(target)) {
  fs.copyFileSync(template, target);
  console.log('Created src/config.local.ts from the template: add your servers and logins there.');
}
