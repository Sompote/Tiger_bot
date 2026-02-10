#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { decryptToString } = require('./cryptoEnv');

function arg(name, def = '') {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return def;
  return process.argv[idx + 1] || def;
}

const inPath = arg('--in', '.env.secrets.enc');
const outPath = arg('--out', '.env.secrets');
const passphrase = process.env.SECRETS_PASSPHRASE || '';

if (!passphrase) {
  console.error('Missing SECRETS_PASSPHRASE env var');
  process.exit(2);
}

const absIn = path.resolve(process.cwd(), inPath);
const absOut = path.resolve(process.cwd(), outPath);

if (!fs.existsSync(absIn)) {
  console.error(`Encrypted file not found: ${absIn}`);
  process.exit(2);
}

const payload = JSON.parse(fs.readFileSync(absIn, 'utf8'));
const plaintext = decryptToString(payload, passphrase);
fs.writeFileSync(absOut, plaintext, { mode: 0o600 });

console.log(`Wrote decrypted secrets to ${outPath}`);
