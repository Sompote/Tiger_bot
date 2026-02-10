#!/usr/bin/env node
const readline = require('readline');
const { ensureContextFiles } = require('./agent/contextFiles');
const { startTelegramBot } = require('./telegram/bot');
const { handleMessage } = require('./agent/mainAgent');

function isTelegramMode(argv) {
  return argv.includes('--telegram');
}

async function runCli() {
  ensureContextFiles();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'you> '
  });

  const userId = 'local-user';
  process.stdout.write('Tiger agent ready. Type /exit to quit.\n');
  rl.prompt();

  rl.on('line', async (line) => {
    const text = String(line || '').trim();
    if (!text) {
      rl.prompt();
      return;
    }
    if (text === '/exit' || text === '/quit') {
      rl.close();
      return;
    }

    try {
      const reply = await handleMessage({
        platform: 'cli',
        userId,
        text
      });
      process.stdout.write(`tiger> ${reply}\n`);
    } catch (err) {
      process.stdout.write(`error> ${err.message}\n`);
    }
    rl.prompt();
  });

  rl.on('close', () => {
    process.stdout.write('bye\n');
    process.exit(0);
  });
}

async function main() {
  if (isTelegramMode(process.argv.slice(2))) {
    ensureContextFiles();
    startTelegramBot();
    process.stdout.write('Telegram bot started.\n');
    return;
  }
  await runCli();
}

main().catch((err) => {
  process.stderr.write(`${err.stack || err.message}\n`);
  process.exit(1);
});
