#!/usr/bin/env node
// Rewrite ?v=<content hash> on the local CSS/JS tags in index.html.
// A static host caches by URL, so without a changing query a redeploy can pair
// the new index.html with a cached old script. Run before every deploy:
//   npm run stamp
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const ASSETS = [
  'style.css',
  'js/track.js',
  'js/style.js',
  'js/i18n.js',
  'js/mapview.js',
  'js/export.js',
  'js/app.js',
];

// Hash the text with normalized line endings so the value does not depend on
// the checkout's CRLF/LF setting.
function hashFile(rel) {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
  return crypto.createHash('sha1').update(text, 'utf8').digest('hex').slice(0, 10);
}

const hashes = new Map(ASSETS.map((rel) => [rel, hashFile(rel)]));
const used = new Set();
let html = fs.readFileSync(INDEX, 'utf8');
html = html.replace(/\b(href|src)="([^"?]+\.(?:css|js))(?:\?v=[^"]*)?"/g, (match, attr, rel) => {
  const hash = hashes.get(rel);
  if (!hash) return match;
  used.add(rel);
  return `${attr}="${rel}?v=${hash}"`;
});
fs.writeFileSync(INDEX, html, 'utf8');

for (const [rel, hash] of hashes) {
  console.log(`${used.has(rel) ? ' ' : '!'} ${rel}  ${hash}`);
}
const missing = ASSETS.filter((rel) => !used.has(rel));
if (missing.length) {
  console.error(`index.html has no tag for: ${missing.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log(`stamped ${used.size} tag(s) in index.html`);
}
