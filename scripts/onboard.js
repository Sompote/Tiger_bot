#!/usr/bin/env node
'use strict';

/**
 * tiger onboard [--install-daemon]
 *
 * Interactive first-run setup.  Writes ~/.tiger/.env and optionally installs
 * a systemd (Linux) or launchd (macOS) daemon so the Telegram bot starts
 * automatically on boot.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { execSync, execFileSync } = require('child_process');

const TIGER_HOME = process.env.TIGER_HOME || path.join(os.homedir(), '.tiger');
const PKG_ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(TIGER_HOME, '.env');
const installDaemon = process.argv.includes('--install-daemon');

// ─── Readline helpers ─────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (prompt) => new Promise((res) => rl.question(prompt, res));

async function askHidden(prompt) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    if (!stdin.isTTY) { resolve(''); return; }
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    let buf = '';
    function onData(chunk) {
      for (const ch of chunk.toString('utf8')) {
        if (ch === '\r' || ch === '\n') { stdout.write('\n'); cleanup(); resolve(buf); return; }
        if (ch === '\u0003') { cleanup(); reject(new Error('Aborted')); return; }
        if (ch === '\u007f') { if (buf.length) { buf = buf.slice(0, -1); stdout.write('\b \b'); } continue; }
        buf += ch; stdout.write('*');
      }
    }
    function cleanup() { stdin.off('data', onData); stdin.setRawMode(false); stdin.pause(); }
    stdin.on('data', onData);
  });
}

function yn(s, def) {
  const t = String(s || '').trim().toLowerCase();
  if (!t) return def;
  return ['y', 'yes', '1', 'true'].includes(t);
}

function envLine(k, v) {
  const s = String(v == null ? '' : v);
  if (!s) return `${k}=`;
  if (/[\s#"']/.test(s)) return `${k}="${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  return `${k}=${s}`;
}

// ─── Daemon helpers ───────────────────────────────────────────────────────────

function nodeBin() {
  return process.execPath;
}

function cliScript() {
  return path.join(PKG_ROOT, 'src', 'cli.js');
}

function installSystemd() {
  const svcDir = path.join(os.homedir(), '.config', 'systemd', 'user');
  fs.mkdirSync(svcDir, { recursive: true });
  const svcPath = path.join(svcDir, 'tiger.service');
  const logPath = path.join(TIGER_HOME, 'logs', 'telegram.log');

  const unit = `[Unit]
Description=Tiger AI Agent - Telegram Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${nodeBin()} ${cliScript()} --telegram --worker
WorkingDirectory=${TIGER_HOME}
Environment=TIGER_HOME=${TIGER_HOME}
Restart=always
RestartSec=5
StandardOutput=append:${logPath}
StandardError=append:${logPath}

[Install]
WantedBy=default.target
`;

  fs.writeFileSync(svcPath, unit, 'utf8');
  console.log(`  Wrote ${svcPath}`);

  try {
    execSync('systemctl --user daemon-reload', { stdio: 'ignore' });
    execSync('systemctl --user enable tiger', { stdio: 'ignore' });
    execSync('systemctl --user start tiger', { stdio: 'ignore' });
    console.log('  Daemon enabled and started via systemd --user');
    console.log('  Manage with:  systemctl --user {start|stop|restart|status} tiger');
  } catch (e) {
    console.log('  Wrote unit file but could not start systemd (no DBUS?). Run manually:');
    console.log('    systemctl --user daemon-reload && systemctl --user enable --now tiger');
  }
}

function installLaunchd() {
  const agentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
  fs.mkdirSync(agentsDir, { recursive: true });
  const plistPath = path.join(agentsDir, 'com.tiger.agent.plist');
  const logPath = path.join(TIGER_HOME, 'logs', 'telegram.log');

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.tiger.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodeBin()}</string>
    <string>${cliScript()}</string>
    <string>--telegram</string>
    <string>--worker</string>
  </array>
  <key>WorkingDirectory</key><string>${TIGER_HOME}</string>
  <key>EnvironmentVariables</key>
  <dict><key>TIGER_HOME</key><string>${TIGER_HOME}</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${logPath}</string>
  <key>StandardErrorPath</key><string>${logPath}</string>
</dict>
</plist>
`;

  fs.writeFileSync(plistPath, plist, 'utf8');
  console.log(`  Wrote ${plistPath}`);

  try {
    execSync(`launchctl load -w "${plistPath}"`, { stdio: 'ignore' });
    console.log('  Daemon loaded via launchctl');
    console.log(`  Manage with:  launchctl {load|unload} ~/Library/LaunchAgents/com.tiger.agent.plist`);
  } catch (e) {
    console.log('  Wrote plist but launchctl load failed. Run manually:');
    console.log(`    launchctl load -w "${plistPath}"`);
  }
}

function installDaemonForPlatform() {
  const plat = process.platform;
  if (plat === 'linux') {
    installSystemd();
  } else if (plat === 'darwin') {
    installLaunchd();
  } else {
    console.log(`  Daemon auto-install is not supported on ${plat}.`);
    console.log('  Start manually:  tiger telegram --background');
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async function main() {
  console.log(`
╔══════════════════════════════════════════╗
║   🐯  Tiger Agent — First-time Setup    ║
╚══════════════════════════════════════════╝
Config will be saved to: ${TIGER_HOME}
`);

  // Warn if existing config
  if (fs.existsSync(ENV_PATH)) {
    const ow = await ask('Existing config found. Overwrite? (y/N): ');
    if (!yn(ow, false)) { console.log('Cancelled.'); rl.close(); return; }
  }

  // ── Active provider ────────────────────────────────────────────────────────
  console.log('\nAvailable providers: kimi, zai (Zhipu GLM-5), minimax, claude, moonshot');
  const activeProv = (await ask('Active provider (zai): ')).trim() || 'zai';
  const provOrder = (await ask(`Provider fallback order (${activeProv},claude,kimi,minimax,moonshot): `)).trim()
    || `${activeProv},claude,kimi,minimax,moonshot`;

  // ── API keys ───────────────────────────────────────────────────────────────
  console.log('\nEnter API keys (press Enter to skip a provider):');

  const kimiKey    = (await askHidden('  KIMI_CODE_API_KEY  : ')).trim();
  const moonshotKey= (await askHidden('  MOONSHOT_API_KEY   : ')).trim();
  const zaiKey     = (await askHidden('  ZAI_API_KEY        : ')).trim();
  const minimaxKey = (await askHidden('  MINIMAX_API_KEY    : ')).trim();
  const claudeKey  = (await askHidden('  CLAUDE_API_KEY     : ')).trim();

  // ── Telegram ───────────────────────────────────────────────────────────────
  console.log('');
  const tgToken = (await askHidden('  TELEGRAM_BOT_TOKEN : ')).trim();

  // ── Token limits ───────────────────────────────────────────────────────────
  console.log('\nDaily token limits per provider (0 = unlimited, auto-switch on breach):');
  const kimiLimit    = (await ask('  KIMI_TOKEN_LIMIT    (100000): ')).trim() || '100000';
  const moonshotLimit= (await ask('  MOONSHOT_TOKEN_LIMIT(100000): ')).trim() || '100000';
  const zaiLimit     = (await ask('  ZAI_TOKEN_LIMIT     (100000): ')).trim() || '100000';
  const minimaxLimit = (await ask('  MINIMAX_TOKEN_LIMIT (100000): ')).trim() || '100000';
  const claudeLimit  = (await ask('  CLAUDE_TOKEN_LIMIT  (500000): ')).trim() || '500000';

  // ── Misc ───────────────────────────────────────────────────────────────────
  const allowShell = yn(await ask('\nEnable shell tool? (y/N): '), false);
  const allowSkill = yn(await ask('Enable skill install? (y/N): '), false);

  // ── Write .env ─────────────────────────────────────────────────────────────
  const lines = [
    '# Tiger Agent config — generated by `tiger onboard`',
    '',
    '# ── Legacy Kimi compat (used if ACTIVE_PROVIDER=kimi)',
    envLine('KIMI_PROVIDER', 'code'),
    envLine('KIMI_CODE_API_KEY', kimiKey),
    envLine('KIMI_BASE_URL', 'https://api.kimi.com/coding/v1'),
    envLine('KIMI_CHAT_MODEL', 'kimi-coding/k2p5'),
    envLine('KIMI_EMBED_MODEL', ''),
    envLine('KIMI_USER_AGENT', 'KimiCLI/0.77'),
    envLine('KIMI_ENABLE_EMBEDDINGS', 'false'),
    envLine('KIMI_TIMEOUT_MS', '30000'),
    '',
    '# ── Multi-provider',
    envLine('ACTIVE_PROVIDER', activeProv),
    envLine('PROVIDER_ORDER', provOrder),
    '',
    '# ── Z.ai (Zhipu GLM)',
    envLine('ZAI_API_KEY', zaiKey),
    envLine('ZAI_BASE_URL', 'https://open.bigmodel.cn/api/paas/v4'),
    envLine('ZAI_MODEL', 'glm-5'),
    envLine('ZAI_TIMEOUT_MS', '30000'),
    '',
    '# ── MiniMax',
    envLine('MINIMAX_API_KEY', minimaxKey),
    envLine('MINIMAX_BASE_URL', 'https://api.minimax.chat/v1'),
    envLine('MINIMAX_MODEL', 'abab6.5s-chat'),
    envLine('MINIMAX_TIMEOUT_MS', '30000'),
    '',
    '# ── Claude (Anthropic)',
    envLine('CLAUDE_API_KEY', claudeKey),
    envLine('CLAUDE_MODEL', 'claude-sonnet-4-6'),
    envLine('CLAUDE_TIMEOUT_MS', '60000'),
    '',
    '# ── Moonshot',
    envLine('MOONSHOT_API_KEY', moonshotKey),
    envLine('MOONSHOT_BASE_URL', 'https://api.moonshot.cn/v1'),
    envLine('MOONSHOT_MODEL', 'kimi-k1'),
    '',
    '# ── Token limits (daily, 0 = unlimited)',
    envLine('KIMI_TOKEN_LIMIT', kimiLimit),
    envLine('MOONSHOT_TOKEN_LIMIT', moonshotLimit),
    envLine('ZAI_TOKEN_LIMIT', zaiLimit),
    envLine('MINIMAX_TOKEN_LIMIT', minimaxLimit),
    envLine('CLAUDE_TOKEN_LIMIT', claudeLimit),
    '',
    '# ── Telegram',
    envLine('TELEGRAM_BOT_TOKEN', tgToken),
    '',
    '# ── Permissions',
    envLine('ALLOW_SHELL', allowShell ? 'true' : 'false'),
    envLine('ALLOW_SKILL_INSTALL', allowSkill ? 'true' : 'false'),
    '',
    '# ── Paths (relative to TIGER_HOME)',
    'DATA_DIR=./data',
    'DB_PATH=./db/agent.json',
    'VECTOR_DB_PATH=./db/memory.sqlite',
    'SQLITE_VEC_EXTENSION=',
    '',
    '# ── Memory',
    'MAX_MESSAGES=200',
    'RECENT_MESSAGES=40',
    'OWN_SKILL_UPDATE_HOURS=24',
    'SOUL_UPDATE_HOURS=24',
    'REFLECTION_UPDATE_HOURS=12',
    'MEMORY_INGEST_EVERY_TURNS=2',
    'MEMORY_INGEST_MIN_CHARS=140',
    ''
  ];

  fs.writeFileSync(ENV_PATH, lines.join('\n'), { mode: 0o600 });
  console.log(`\n✅  Config written to ${ENV_PATH}`);

  // ── Daemon install ─────────────────────────────────────────────────────────
  let wantDaemon = installDaemon;
  if (!wantDaemon) {
    wantDaemon = yn(await ask('\nInstall system daemon (auto-start Telegram bot on boot)? (y/N): '), false);
  }

  if (wantDaemon) {
    if (!tgToken) {
      console.log('⚠️  No Telegram token set — skipping daemon install.');
    } else {
      console.log('\nInstalling daemon...');
      installDaemonForPlatform();
    }
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Setup complete! 🐯

Start CLI:           tiger start
Start Telegram:      tiger telegram
Background daemon:   tiger telegram --background
Switch provider:     /api claude   (in Telegram chat)
Token usage:         /tokens       (in Telegram chat)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  rl.close();
})().catch((err) => {
  console.error(`\nOnboard failed: ${err.message}`);
  rl.close();
  process.exit(1);
});
