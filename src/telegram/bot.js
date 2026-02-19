'use strict';

const TelegramBot = require('node-telegram-bot-api');
const { telegramBotToken } = require('../config');
const { handleMessage } = require('../agent/mainAgent');
const tokenManager = require('../tokenManager');
const { getProvider } = require('../apiProviders');

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function safeSend(bot, chatId, text, opts = {}) {
  try {
    const chunks = [];
    for (let i = 0; i < text.length; i += 4000) chunks.push(text.slice(i, i + 4000));
    for (const chunk of chunks) {
      await bot.sendMessage(chatId, chunk, opts).catch(async () => {
        // If parse_mode causes an error, retry as plain text
        await bot.sendMessage(chatId, chunk);
      });
    }
  } catch (err) {
    process.stderr.write(`[telegram] sendMessage failed: ${err.message}\n`);
  }
}

async function safeSendTyping(bot, chatId) {
  try {
    await bot.sendChatAction(chatId, 'typing');
  } catch (err) {
    process.stderr.write(`[telegram] sendChatAction failed: ${err.message}\n`);
  }
}

// ─── /api command ─────────────────────────────────────────────────────────────

const KNOWN_PROVIDERS = ['kimi', 'moonshot', 'zai', 'minimax', 'claude'];

function buildApiStatus() {
  const status = tokenManager.getStatus();
  const lines = ['📊 *API Provider Status* (today)'];
  lines.push('');
  for (const s of status) {
    const active = s.active ? '✅ *active*' : '  ';
    const limitStr = s.limit > 0 ? `/ ${s.limit.toLocaleString()}` : '/ ∞';
    const over = s.over ? ' ⚠️ LIMIT' : '';
    const p = getProvider(s.id);
    const modelStr = p ? ` (${p.chatModel})` : '';
    lines.push(`${active} \`${s.id}\`${modelStr}`);
    lines.push(`   tokens: ${s.tokens.toLocaleString()} ${limitStr}${over}  |  requests: ${s.requests}`);
  }
  lines.push('');
  lines.push('Use `/api <name>` to switch provider.');
  lines.push('Names: ' + KNOWN_PROVIDERS.map((n) => `\`${n}\``).join(', '));
  return lines.join('\n');
}

function handleApiCommand(arg) {
  if (!arg) {
    return buildApiStatus();
  }

  const target = arg.trim().toLowerCase();
  if (!KNOWN_PROVIDERS.includes(target)) {
    return `❌ Unknown provider: \`${target}\`\nAvailable: ${KNOWN_PROVIDERS.map((n) => `\`${n}\``).join(', ')}`;
  }

  const provider = getProvider(target);
  if (!provider || !provider.apiKey) {
    return `⚠️ Provider \`${target}\` has no API key configured.\nSet ${target.toUpperCase()}_API_KEY in .env and restart.`;
  }

  const result = tokenManager.setProvider(target);
  if (!result.ok) return `❌ Switch failed: ${result.error}`;

  const p = getProvider(target);
  return `✅ Switched to *${p.name}* (\`${target}\`)\nModel: \`${p.chatModel}\``;
}

// ─── /limit command ───────────────────────────────────────────────────────────

function handleLimitCommand(arg) {
  if (!arg) {
    const status = tokenManager.getStatus();
    const lines = ['⚙️ *Token Limits* (0 = unlimited)', ''];
    for (const s of status) {
      const limitStr = s.limit > 0 ? s.limit.toLocaleString() : '∞ unlimited';
      const active = s.active ? ' ✅' : '';
      lines.push(`\`${s.id}\`: ${limitStr}${active}`);
    }
    lines.push('');
    lines.push('Use `/limit <provider> <number>` to set a limit.');
    lines.push('Use `/limit <provider> 0` for unlimited.');
    lines.push('Providers: ' + KNOWN_PROVIDERS.map((n) => `\`${n}\``).join(', '));
    return lines.join('\n');
  }

  const parts = arg.trim().split(/\s+/);
  if (parts.length !== 2) {
    return '❌ Usage: `/limit <provider> <number>`\nExample: `/limit claude 0`';
  }

  const [providerArg, valueArg] = parts;
  const id = providerArg.toLowerCase();
  if (!KNOWN_PROVIDERS.includes(id)) {
    return `❌ Unknown provider: \`${id}\`\nAvailable: ${KNOWN_PROVIDERS.map((n) => `\`${n}\``).join(', ')}`;
  }

  const n = Number(valueArg);
  if (isNaN(n) || n < 0 || !Number.isFinite(n)) {
    return '❌ Limit must be a non-negative number. Use `0` for unlimited.';
  }

  const result = tokenManager.setLimit(id, n);
  if (!result.ok) return `❌ ${result.error}`;

  const limitStr = n === 0 ? '∞ unlimited' : n.toLocaleString() + ' tokens/day';
  return `✅ *${id}* limit set to *${limitStr}*`;
}

// ─── /tokens command ──────────────────────────────────────────────────────────

function handleTokensCommand() {
  const status = tokenManager.getStatus();
  const lines = ['📈 *Token Usage Today*', ''];
  for (const s of status) {
    const limitStr = s.limit > 0 ? `${s.tokens.toLocaleString()} / ${s.limit.toLocaleString()} (${Math.round((s.tokens / s.limit) * 100)}%)` : `${s.tokens.toLocaleString()} / unlimited`;
    const flag = s.over ? ' 🔴 OVER LIMIT' : s.active ? ' 🟢 active' : '';
    lines.push(`\`${s.id}\`: ${limitStr}${flag}`);
  }
  return lines.join('\n');
}

// ─── Bot startup ──────────────────────────────────────────────────────────────

function startTelegramBot() {
  if (!telegramBotToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is empty.');
  }

  const bot = new TelegramBot(telegramBotToken, { polling: true });

  // Register commands so Telegram shows the list when user types /
  bot.setMyCommands([
    { command: 'api',    description: 'Show or switch active API provider' },
    { command: 'tokens', description: 'Show token usage for today' },
    { command: 'limit',  description: 'Show or set daily token limit per provider' },
    { command: 'help',   description: 'Show all available commands' }
  ]).catch((err) => {
    process.stderr.write(`[telegram] setMyCommands failed: ${err.message}\n`);
  });

  bot.on('polling_error', (err) => {
    process.stderr.write(`[telegram] polling_error: ${err.message}\n`);
  });

  bot.on('error', (err) => {
    process.stderr.write(`[telegram] error: ${err.message}\n`);
  });

  bot.on('message', async (msg) => {
    const chatId = String(msg.chat.id);
    const userId = String(msg.from?.id || msg.chat.id);
    // Strip @botname suffix that Telegram appends in group chats (e.g. /api@MyBot → /api)
    const rawText = String(msg.text || '').trim();
    const text = rawText.replace(/^(\/\w+)@\S+/, '$1');

    if (!text) return;

    const MD = { parse_mode: 'Markdown' };

    // ── Slash commands ────────────────────────────────────────────────────
    if (text.startsWith('/api') || text.startsWith('/ap ') || text === '/ap') {
      const arg = text.startsWith('/api') ? text.slice(4).trim() || null : text.slice(3).trim() || null;
      await safeSend(bot, chatId, handleApiCommand(arg), MD);
      return;
    }

    if (text === '/tokens' || text === '/token') {
      await safeSend(bot, chatId, handleTokensCommand(), MD);
      return;
    }

    if (text.startsWith('/limit')) {
      const arg = text.slice(6).trim() || null;
      await safeSend(bot, chatId, handleLimitCommand(arg), MD);
      return;
    }

    if (text === '/help' || text === '/start') {
      const helpText = [
        '🤖 *Tiger Bot Commands*',
        '',
        '/api \\- Show current provider & token stats',
        '/api `<name>` \\- Switch active API provider',
        '/tokens \\- Show token usage for today',
        '/limit \\- Show daily token limits per provider',
        '/limit `<name> <n>` \\- Set limit \\(0 = unlimited\\)',
        '/help \\- Show this message',
        '',
        '*Available providers:* ' + KNOWN_PROVIDERS.join(', ')
      ].join('\n');
      await safeSend(bot, chatId, helpText, { parse_mode: 'MarkdownV2' });
      return;
    }

    // Unknown slash command — show hint instead of sending to agent
    if (text.startsWith('/')) {
      await safeSend(bot, chatId, `Unknown command. Type /help to see available commands.`);
      return;
    }

    // ── Regular messages → agent ──────────────────────────────────────────
    let typingTimer = null;
    try {
      await safeSendTyping(bot, chatId);
      typingTimer = setInterval(() => safeSendTyping(bot, chatId), 4500);

      const reply = await handleMessage({ platform: 'telegram', userId, text });
      clearInterval(typingTimer);
      await safeSend(bot, chatId, reply);
    } catch (err) {
      if (typingTimer) clearInterval(typingTimer);
      await safeSend(bot, chatId, `⚠️ Error: ${err.message}`);
    }
  });

  return bot;
}

module.exports = { startTelegramBot };
