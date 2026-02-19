#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

const PKG_ROOT = path.resolve(__dirname, '..');
const TIGER_HOME = process.env.TIGER_HOME || path.join(os.homedir(), '.tiger');

// Ensure runtime dirs exist
['', 'data', 'db', 'logs'].forEach((d) => fs.mkdirSync(path.join(TIGER_HOME, d), { recursive: true }));

// Expose to child modules and the supervisor worker
process.env.TIGER_HOME = TIGER_HOME;

// chdir so all relative env paths (./data, ./db, .env) resolve inside ~/.tiger
process.chdir(TIGER_HOME);

const argv = process.argv.slice(2);
const cmd = argv[0] || '';

// ─── Help ────────────────────────────────────────────────────────────────────
function showHelp() {
  console.log(`
Tiger Agent 🐯  — AI assistant with persistent memory

Usage:
  tiger onboard                  Interactive setup wizard
  tiger onboard --install-daemon Setup + install system daemon (auto-start on boot)
  tiger start                    Start CLI chat
  tiger telegram                 Start Telegram bot (foreground)
  tiger telegram --background    Start Telegram bot as background process
  tiger stop                     Stop background Telegram bot
  tiger status                   Show daemon / process status
  tiger version                  Print version

Config & data: ${TIGER_HOME}
  `.trim());
}

// ─── Route commands ───────────────────────────────────────────────────────────
switch (cmd) {
  case 'onboard':
    require(path.join(PKG_ROOT, 'scripts', 'onboard.js'));
    break;

  case 'version':
  case '-v':
  case '--version': {
    const pkg = require(path.join(PKG_ROOT, 'package.json'));
    console.log(pkg.version);
    break;
  }

  case 'status': {
    const pidFile = path.join(TIGER_HOME, 'tiger-telegram.pid');
    if (!fs.existsSync(pidFile)) { console.log('Tiger daemon: not running'); break; }
    const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
    try { process.kill(pid, 0); console.log(`Tiger daemon: running (PID ${pid})`); }
    catch (_) { console.log('Tiger daemon: not running (stale pid file)'); }
    break;
  }

  case 'stop':
    process.argv = [process.argv[0], process.argv[1], '--telegram-stop'];
    require(path.join(PKG_ROOT, 'src', 'cli.js'));
    break;

  case 'telegram':
    if (argv.includes('--background') || argv.includes('-b')) {
      process.argv = [process.argv[0], process.argv[1], '--telegram', '--background'];
    } else {
      process.argv = [process.argv[0], process.argv[1], '--telegram'];
    }
    require(path.join(PKG_ROOT, 'src', 'cli.js'));
    break;

  case 'start':
  case 'cli':
  case '':
    process.argv = [process.argv[0], process.argv[1]];
    require(path.join(PKG_ROOT, 'src', 'cli.js'));
    break;

  case 'help':
  case '--help':
  case '-h':
    showHelp();
    break;

  default:
    console.error(`Unknown command: ${cmd}`);
    showHelp();
    process.exit(1);
}
