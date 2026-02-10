#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { encryptString } = require('./cryptoEnv');

function arg(name, def = '') {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return def;
  return process.argv[idx + 1] || def;
}

const inPath = arg('--in', '.env.secrets');
const outPath = arg('--out', '.env.secrets.enc');
const passphrase = process.env.SECRETS_PASSPHRASE || '';

if (!passphrase) {
  console.error('Missing SECRETS_PASSPHRASE env var');
  process.exit(2);
}

const absIn = path.resolve(process.cwd(), inPath);
const absOut = path.resolve(process.cwd(), outPath);

if (!fs.existsSync(absIn)) {
  console.error(`Input file not found: ${absIn}`);
  process.exit(2);
}

const plaintext = fs.readFileSync(absIn, 'utf8');
const payload = encryptString(plaintext, passphrase);
fs.writeFileSync(absOut, JSON.stringify(payload, null, 2) + '\n', { mode: 0o600 });

console.log(`Wrote encrypted secrets to ${outPath}`);
