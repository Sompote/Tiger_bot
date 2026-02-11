#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const out = {
    from: '/tmp/tiger_memory.db',
    to: './db/memory.sqlite'
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--from' && argv[i + 1]) {
      out.from = argv[i + 1];
      i += 1;
    } else if (token === '--to' && argv[i + 1]) {
      out.to = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const from = path.resolve(args.from);
  const to = path.resolve(args.to);

  if (!fs.existsSync(from)) {
    process.stderr.write(`Source DB not found: ${from}\n`);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  process.stdout.write(
    JSON.stringify({
      ok: true,
      from,
      to
    }) + '\n'
  );
}

main();
