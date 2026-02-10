#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { encryptString } = require('./cryptoEnv');

function exists(p) {
  try {
    fs.accessSync(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function writeFile600(filePath, content) {
  fs.writeFileSync(filePath, content, { mode: 0o600 });
}

function normalizeYesNo(s, defBool) {
  const t = String(s || '').trim().toLowerCase();
  if (!t) return defBool;
  if (['y', 'yes', 'true', '1', 'on'].includes(t)) return true;
  if (['n', 'no', 'false', '0', 'off'].includes(t)) return false;
  return defBool;
}

function createRl() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function question(rl, prompt) {
  return new Promise((resolve) => rl.question(prompt, (ans) => resolve(ans)));
}

async function questionHidden(prompt) {
  // Minimal hidden input prompt that works in a normal TTY.
  // Prints '*' for each char.
  return await new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    if (!stdin.isTTY) {
      reject(new Error('Hidden prompt requires a TTY'));
      return;
    }

    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();

    let buf = '';
    function onData(chunk) {
      const s = chunk.toString('utf8');
      for (const ch of s) {
        if (ch === '\r' || ch === '\n') {
          stdout.write('\n');
          cleanup();
          resolve(buf);
          return;
        }
        if (ch === '\u0003') {
          // Ctrl-C
          cleanup();
          reject(new Error('Aborted'));
          return;
        }
        if (ch === '\u007f') {
          // backspace
          if (buf.length) {
            buf = buf.slice(0, -1);
            stdout.write('\b \b');
          }
          continue;
        }
        buf += ch;
        stdout.write('*');
      }
    }

    function cleanup() {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    }

    stdin.on('data', onData);
  });
}

function envLine(k, v) {
  if (v == null) v = '';
  const s = String(v);
  // Quote if contains spaces or # to avoid comment truncation.
  const needsQuotes = /\s|#|"|'/g.test(s);
  if (!s) return `${k}=`;
  if (!needsQuotes) return `${k}=${s}`;
  // Use double quotes, escape backslashes and quotes.
  const escaped = s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `${k}="${escaped}"`;
}

(async function main() {
  const cwd = process.cwd();
  const envPath = path.join(cwd, '.env');
  const secretsPath = path.join(cwd, '.env.secrets');
  const secretsEncPath = path.join(cwd, '.env.secrets.enc');

  const rl = createRl();
  try {
    console.log('Tiger setup (creates .env and .env.secrets; optionally .env.secrets.enc)');

    if (exists(envPath) || exists(secretsPath) || exists(secretsEncPath)) {
      const ans = await question(
        rl,
        'Existing config found (.env/.env.secrets/.env.secrets.enc). Overwrite? (y/N): '
      );
      const ok = normalizeYesNo(ans, false);
      if (!ok) {
        console.log('Canceled. No files changed.');
        process.exit(0);
      }
    }

    const providerAns = (await question(rl, 'Choose provider [moonshot/code] (moonshot): ')).trim();
    const provider = (providerAns || 'moonshot').toLowerCase();
    if (!['moonshot', 'code'].includes(provider)) {
      throw new Error('Invalid provider. Use moonshot or code.');
    }

    const useTelegram = normalizeYesNo(await question(rl, 'Enable Telegram bot? (y/N): '), false);

    // Non-secret config
    const baseUrlDefault = provider === 'code' ? 'https://api.kimi.com/coding/v1' : 'https://api.moonshot.cn/v1';
    const chatModelDefault = provider === 'code' ? 'k2p5' : 'kimi-k1';
    const embedModelDefault = provider === 'code' ? '' : 'kimi-embedding-v1';
    const userAgentDefault = provider === 'code' ? 'KimiCLI/0.77' : '';

    const baseUrl = (await question(rl, `KIMI_BASE_URL (${baseUrlDefault}): `)).trim() || baseUrlDefault;
    const chatModel = (await question(rl, `KIMI_CHAT_MODEL (${chatModelDefault}): `)).trim() || chatModelDefault;
    const enableEmbeddings = normalizeYesNo(
      await question(rl, `Enable embeddings? (${provider === 'code' ? 'N' : 'Y'}/n): `),
      provider !== 'code'
    );
    const embedModel = enableEmbeddings
      ? (await question(rl, `KIMI_EMBED_MODEL (${embedModelDefault || 'empty'}): `)).trim() || embedModelDefault
      : '';
    const userAgent = (await question(rl, `KIMI_USER_AGENT (${userAgentDefault || 'empty'}): `)).trim() || userAgentDefault;

    const timeoutMsRaw = (await question(rl, 'KIMI_TIMEOUT_MS (30000): ')).trim();
    const timeoutMs = timeoutMsRaw ? String(Number(timeoutMsRaw) || 30000) : '30000';

    const ownHoursRaw = (await question(rl, 'OWN_SKILL_UPDATE_HOURS (24): ')).trim();
    const soulHoursRaw = (await question(rl, 'SOUL_UPDATE_HOURS (24): ')).trim();
    const ownHours = String(Math.max(1, Number(ownHoursRaw || 24)));
    const soulHours = String(Math.max(1, Number(soulHoursRaw || 24)));

    const allowShell = normalizeYesNo(await question(rl, 'ALLOW_SHELL (false): '), false);
    const allowSkillInstall = normalizeYesNo(await question(rl, 'ALLOW_SKILL_INSTALL (false): '), false);

    const dataDir = (await question(rl, 'DATA_DIR (./data): ')).trim() || './data';
    const dbPath = (await question(rl, 'DB_PATH (./db/agent.json): ')).trim() || './db/agent.json';

    const maxMessagesRaw = (await question(rl, 'MAX_MESSAGES (200): ')).trim();
    const recentMessagesRaw = (await question(rl, 'RECENT_MESSAGES (40): ')).trim();
    const maxMessages = String(Number(maxMessagesRaw || 200) || 200);
    const recentMessages = String(Number(recentMessagesRaw || 40) || 40);

    // Secrets
    let moonshotKey = '';
    let kimiCodeKey = '';
    let kimiAliasKey = '';
    if (provider === 'moonshot') {
      moonshotKey = (await questionHidden('MOONSHOT_API_KEY (hidden): ')).trim();
    } else {
      kimiCodeKey = (await questionHidden('KIMI_CODE_API_KEY (hidden): ')).trim();
    }
    const useAlias = normalizeYesNo(await question(rl, 'Also set KIMI_API_KEY alias? (y/N): '), false);
    if (useAlias) {
      kimiAliasKey = (await questionHidden('KIMI_API_KEY (hidden): ')).trim();
    }

    let telegramToken = '';
    if (useTelegram) {
      telegramToken = (await questionHidden('TELEGRAM_BOT_TOKEN (hidden): ')).trim();
    }

    const wantEncrypt = normalizeYesNo(
      await question(rl, 'Encrypt .env.secrets to .env.secrets.enc and delete plaintext? (y/N): '),
      false
    );

    let secretsPass = '';
    if (wantEncrypt) {
      secretsPass = await questionHidden('SECRETS_PASSPHRASE (hidden): ');
      const secretsPass2 = await questionHidden('Confirm SECRETS_PASSPHRASE (hidden): ');
      if (secretsPass !== secretsPass2) throw new Error('Passphrases do not match');
      secretsPass = secretsPass.trim();
      if (!secretsPass) throw new Error('Empty passphrase not allowed');
    }

    // Write files
    const envLines = [
      '# Non-secret config',
      envLine('KIMI_PROVIDER', provider),
      envLine('KIMI_BASE_URL', baseUrl),
      envLine('KIMI_CHAT_MODEL', chatModel),
      envLine('KIMI_EMBED_MODEL', embedModel),
      envLine('KIMI_USER_AGENT', userAgent),
      envLine('KIMI_ENABLE_EMBEDDINGS', enableEmbeddings ? 'true' : 'false'),
      envLine('KIMI_TIMEOUT_MS', timeoutMs),
      envLine('OWN_SKILL_UPDATE_HOURS', ownHours),
      envLine('SOUL_UPDATE_HOURS', soulHours),
      '',
      '# Encrypted secrets support (optional)',
      envLine('SECRETS_FILE', '.env.secrets.enc'),
      // If encrypting, user must export SECRETS_PASSPHRASE when running the bot.
      envLine('SECRETS_PASSPHRASE', ''),
      '',
      envLine('ALLOW_SHELL', allowShell ? 'true' : 'false'),
      envLine('ALLOW_SKILL_INSTALL', allowSkillInstall ? 'true' : 'false'),
      envLine('DATA_DIR', dataDir),
      envLine('DB_PATH', dbPath),
      envLine('MAX_MESSAGES', maxMessages),
      envLine('RECENT_MESSAGES', recentMessages),
      ''
    ];

    const secretLines = [
      '# Secrets only (do not commit)',
      envLine('MOONSHOT_API_KEY', moonshotKey),
      envLine('KIMI_CODE_API_KEY', kimiCodeKey),
      envLine('KIMI_API_KEY', kimiAliasKey),
      envLine('TELEGRAM_BOT_TOKEN', telegramToken),
      ''
    ];

    writeFile600(envPath, envLines.join('\n') + '\n');
    writeFile600(secretsPath, secretLines.join('\n') + '\n');

    if (wantEncrypt) {
      const plaintext = fs.readFileSync(secretsPath, 'utf8');
      const payload = encryptString(plaintext, secretsPass);
      fs.writeFileSync(secretsEncPath, JSON.stringify(payload, null, 2) + '\n', { mode: 0o600 });
      fs.unlinkSync(secretsPath);
      console.log('Wrote .env.secrets.enc and removed plaintext .env.secrets');
      console.log('When running the bot, you must export SECRETS_PASSPHRASE in your shell or service env.');
    } else {
      console.log('Wrote .env and .env.secrets');
    }

    console.log('Setup complete. Restart the bot to load the new config.');
  } finally {
    rl.close();
  }
})().catch((err) => {
  console.error(`Setup failed: ${err.message}`);
  process.exit(1);
});
