'use strict';

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const roots = [
  path.join(__dirname, '..', 'src'),
  path.join(__dirname),
];

const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (entry.isFile() && full.endsWith('.js')) {
      files.push(full);
    }
  }
}

for (const root of roots) {
  walk(root);
}

for (const file of files.sort()) {
  execSync(`node --check "${file}"`, { stdio: 'inherit' });
}

console.log(`Syntax OK (${files.length} files)`);
