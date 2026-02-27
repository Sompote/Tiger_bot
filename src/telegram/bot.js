'use strict';

const TelegramBot = require('node-telegram-bot-api');
const { telegramBotToken, swarmEnabled } = require('../config');
const { handleMessage } = require('../agent/mainAgent');
const tokenManager = require('../tokenManager');
const { getProvider } = require('../apiProviders');
const {
  ensureSwarmLayout,
  runTigerFlow,
  continueTask,
  cancelTask,
  deleteTask,
  askAgent,
  getAgentsStatus,
  getStatusSummary
} = require('../swarm');
const {
  ensureSwarmConfigLayout,
  listArchitectureFiles,
  listTaskStyleFiles,
  readArchitectureText,
  writeArchitectureText,
  readTaskStyleText,
  writeTaskStyleText,
  updateDefaultStyleArchitecture
} = require('../swarm/configStore');

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

function getKnownProviders() {
  const ids = tokenManager.getKnownProviders();
  return ids.length ? ids : tokenManager.getStatus().map((s) => s.id);
}

function buildApiStatus() {
  const status = tokenManager.getStatus();
  const knownProviders = getKnownProviders();
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
  lines.push('Names: ' + knownProviders.map((n) => `\`${n}\``).join(', '));
  return lines.join('\n');
}

function handleApiCommand(arg) {
  if (!arg) {
    return buildApiStatus();
  }

  const target = arg.trim().toLowerCase();
  const knownProviders = getKnownProviders();
  if (!knownProviders.includes(target)) {
    return `❌ Unknown provider: \`${target}\`\nAvailable: ${knownProviders.map((n) => `\`${n}\``).join(', ')}`;
  }

  const provider = getProvider(target);
  if (!provider || !provider.apiKey) {
    return `⚠️ Provider \`${target}\` has no API key configured.\nSet ${target.toUpperCase()}_API_KEY in .env and restart.`;
  }

  const result = tokenManager.setProvider(target);
  if (!result.ok) return `❌ Switch failed: ${result.error}`;

  const p = getProvider(target);
  const overLimit = tokenManager.isOverLimit(target);
  if (overLimit) {
    return [
      `✅ Active provider set to *${p.name}* (\`${target}\`)`,
      `Model: \`${p.chatModel}\``,
      '',
      `⚠️ *${target}* is currently over its daily token limit, so requests will fall back to another provider.`,
      `Use \`/limit ${target} 0\` (unlimited) or raise its limit, then try again.`
    ].join('\n');
  }
  return `✅ Switched to *${p.name}* (\`${target}\`)\nModel: \`${p.chatModel}\``;
}

// ─── /limit command ───────────────────────────────────────────────────────────

function handleLimitCommand(arg) {
  const knownProviders = getKnownProviders();
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
    lines.push('Providers: ' + knownProviders.map((n) => `\`${n}\``).join(', '));
    return lines.join('\n');
  }

  const parts = arg.trim().split(/\s+/);
  if (parts.length !== 2) {
    return '❌ Usage: `/limit <provider> <number>`\nExample: `/limit claude 0`';
  }

  const [providerArg, valueArg] = parts;
  const id = providerArg.toLowerCase();
  if (!knownProviders.includes(id)) {
    return `❌ Unknown provider: \`${id}\`\nAvailable: ${knownProviders.map((n) => `\`${n}\``).join(', ')}`;
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

  ensureSwarmLayout();
  ensureSwarmConfigLayout();
  const bot = new TelegramBot(telegramBotToken, { polling: true });
  let swarmRoutingEnabled = swarmEnabled;

  // Register commands so Telegram shows the list when user types /
  bot.setMyCommands([
    { command: 'api',    description: 'Show or switch active API provider' },
    { command: 'tokens', description: 'Show token usage for today' },
    { command: 'limit',  description: 'Show or set daily token limit per provider' },
    { command: 'swarm',  description: 'Enable or disable agent swarm' },
    { command: 'status', description: 'Show swarm task status' },
    { command: 'task',   description: 'Continue a failed swarm task' },
    { command: 'architecture', description: 'View/update swarm architecture YAML' },
    { command: 'taskstyle', description: 'View/update task style YAML' },
    { command: 'agents', description: 'Show swarm agents' },
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

    if (text.startsWith('/swarm')) {
      const arg = text.slice(6).trim().toLowerCase();
      if (!arg) {
        await safeSend(bot, chatId, `🐯 Swarm is currently *${swarmRoutingEnabled ? 'ON' : 'OFF'}*.\nUse \`/swarm on\` or \`/swarm off\`.`, MD);
        return;
      }
      if (arg === 'on') {
        swarmRoutingEnabled = true;
        await safeSend(bot, chatId, '✅ Swarm routing is now *ON*', MD);
        return;
      }
      if (arg === 'off') {
        swarmRoutingEnabled = false;
        await safeSend(bot, chatId, '✅ Swarm routing is now *OFF*\\.\nNew messages will go to the regular Tiger agent\\.', { parse_mode: 'MarkdownV2' });
        return;
      }
      await safeSend(bot, chatId, 'Usage: `/swarm on` or `/swarm off`', MD);
      return;
    }

    if (text.startsWith('/architecture')) {
      const arg = text.slice('/architecture'.length).trim();
      try {
        if (!arg || /^list$/i.test(arg)) {
          const files = listArchitectureFiles();
          const lines = ['🧩 *Architecture Files*', ''];
          for (const f of files) lines.push(`- \`${f}\``);
          lines.push('');
          lines.push('Use `/architecture show <file>`');
          lines.push('Use `/architecture write <file>` then newline + full YAML');
          lines.push('Use `/architecture use <file>` to set default task style architecture');
          await safeSend(bot, chatId, lines.join('\n'), MD);
          return;
        }

        const showMatch = arg.match(/^show\s+(\S+)$/i);
        if (showMatch) {
          const file = showMatch[1];
          const yaml = readArchitectureText(file);
          await safeSend(bot, chatId, `Architecture: ${file}\n\n${yaml}`);
          return;
        }

        const useMatch = arg.match(/^use\s+(\S+)$/i);
        if (useMatch) {
          const file = useMatch[1];
          updateDefaultStyleArchitecture(file);
          await safeSend(bot, chatId, `✅ default task style now uses architecture \`${file}\``, MD);
          return;
        }

        const writeMatch = text.match(/^\/architecture\s+write\s+(\S+)\s*\n([\s\S]+)$/i);
        if (writeMatch) {
          const file = writeMatch[1];
          const yaml = writeMatch[2];
          writeArchitectureText(file, yaml);
          await safeSend(bot, chatId, `✅ wrote architecture \`${file}\``, MD);
          return;
        }

        await safeSend(
          bot,
          chatId,
          'Usage:\n/architecture\n/architecture list\n/architecture show <file>\n/architecture use <file>\n/architecture write <file> + newline + yaml'
        );
      } catch (err) {
        await safeSend(bot, chatId, `❌ /architecture failed: ${err.message}`);
      }
      return;
    }

    if (text.startsWith('/taskstyle')) {
      const arg = text.slice('/taskstyle'.length).trim();
      try {
        if (!arg || /^list$/i.test(arg)) {
          const files = listTaskStyleFiles();
          const lines = ['📝 *Task Style Files*', ''];
          for (const f of files) lines.push(`- \`${f}\``);
          lines.push('');
          lines.push('Use `/taskstyle show <file>`');
          lines.push('Use `/taskstyle write <file>` then newline + full YAML');
          await safeSend(bot, chatId, lines.join('\n'), MD);
          return;
        }

        const showMatch = arg.match(/^show\s+(\S+)$/i);
        if (showMatch) {
          const file = showMatch[1];
          const yaml = readTaskStyleText(file);
          await safeSend(bot, chatId, `Task style: ${file}\n\n${yaml}`);
          return;
        }

        const writeMatch = text.match(/^\/taskstyle\s+write\s+(\S+)\s*\n([\s\S]+)$/i);
        if (writeMatch) {
          const file = writeMatch[1];
          const yaml = writeMatch[2];
          writeTaskStyleText(file, yaml);
          await safeSend(bot, chatId, `✅ wrote task style \`${file}\``, MD);
          return;
        }

        await safeSend(
          bot,
          chatId,
          'Usage:\n/taskstyle\n/taskstyle list\n/taskstyle show <file>\n/taskstyle write <file> + newline + yaml'
        );
      } catch (err) {
        await safeSend(bot, chatId, `❌ /taskstyle failed: ${err.message}`);
      }
      return;
    }

    if (text === '/agents') {
      const agents = getAgentsStatus();
      const lines = ['🤖 *Agents*', ''];
      for (const a of agents) {
        lines.push(`${a.alive ? '✅' : '❌'} \`${a.name}\` - ${a.label}`);
      }
      await safeSend(bot, chatId, lines.join('\n'), MD);
      return;
    }

    if (text === '/status') {
      const status = getStatusSummary();
      const lines = ['📋 *Swarm Status*', ''];
      lines.push(`in_progress: *${status.in_progress.length}*`);
      for (const t of status.in_progress.slice(0, 10)) {
        lines.push(`- \`${t.task_id}\` → \`${t.next_agent}\` | ${t.goal}`);
      }
      lines.push(`pending: *${status.pending.length}*`);
      for (const t of status.pending.slice(0, 10)) {
        lines.push(`- \`${t.task_id}\` → \`${t.next_agent}\` | ${t.goal}`);
      }
      lines.push(`done: *${status.done.length}* | failed: *${status.failed.length}*`);
      await safeSend(bot, chatId, lines.join('\n'), MD);
      return;
    }

    if (text.startsWith('/cancel ')) {
      const taskId = text.slice(8).trim();
      if (!taskId) {
        await safeSend(bot, chatId, 'Usage: `/cancel task_xxx`', MD);
        return;
      }
      const out = cancelTask(taskId, 'tiger');
      if (!out.ok) {
        await safeSend(bot, chatId, `❌ ${out.error}`);
        return;
      }
      await safeSend(bot, chatId, `✅ Cancelled \`${taskId}\``, MD);
      return;
    }

    if (text.startsWith('/task')) {
      const arg = text.slice(5).trim();
      if (!arg || /^list$/i.test(arg)) {
        const status = getStatusSummary();
        const lines = ['🗂️ *Swarm Tasks*', ''];
        for (const bucketName of ['in_progress', 'pending', 'failed', 'done']) {
          const tasks = Array.isArray(status[bucketName]) ? status[bucketName] : [];
          lines.push(`${bucketName}: *${tasks.length}*`);
          for (const t of tasks.slice(0, 10)) {
            lines.push(`- \`${t.task_id}\` → \`${t.next_agent}\` | ${t.goal}`);
          }
          if (tasks.length > 10) lines.push(`- ... and ${tasks.length - 10} more`);
        }
        lines.push('');
        lines.push('Use `/task continue <id>`, `/task retry <id>`, `/task delete <id>`');
        await safeSend(bot, chatId, lines.join('\n'), MD);
        return;
      }

      const actionMatch = arg.match(/^(continue|retry|delete)\s+(\S+)$/i);
      if (!actionMatch) {
        await safeSend(bot, chatId, 'Usage: `/task` or `/task <continue|retry|delete> task_xxx`', MD);
        return;
      }
      const action = actionMatch[1].toLowerCase();
      const taskId = actionMatch[2];

      if (action === 'delete') {
        const out = deleteTask(taskId);
        if (!out.ok) {
          await safeSend(bot, chatId, `❌ ${out.error}`);
          return;
        }
        await safeSend(bot, chatId, `🗑️ Deleted \`${taskId}\` from *${out.bucket}*`, MD);
        return;
      }

      const progressMarks = new Set();
      try {
        await safeSendTyping(bot, chatId);
        const out = await continueTask(taskId, {
          onProgress: ({ phase, agent, task }) => {
            if (phase === 'worker_done' && task) {
              const key = `${agent}:${task.next_agent}:${task.thread ? task.thread.length : 0}`;
              if (progressMarks.has(key)) return;
              progressMarks.add(key);
              void safeSend(bot, chatId, `Tiger: resumed task ${task.task_id} - ${agent} finished. Next: ${task.next_agent}.`);
            }
          }
        });
        if (out.ok) {
          await safeSend(bot, chatId, out.result || '(empty result)');
          return;
        }
        await safeSend(
          bot,
          chatId,
          `⚠️ ${action} failed: ${out.error || 'unknown error'}${out.task ? `\nTask: \`${out.task.task_id}\` next=\`${out.task.next_agent}\` status=\`${out.task.status}\`` : ''}`,
          MD
        );
      } catch (err) {
        await safeSend(bot, chatId, `⚠️ /task ${action} failed: ${err.message}`);
      }
      return;
    }

    if (text.startsWith('/ask ')) {
      const parts = text.slice(5).trim();
      const [agentNameRaw, ...rest] = parts.split(/\s+/);
      const agentName = String(agentNameRaw || '').toLowerCase();
      const prompt = rest.join(' ').trim();
      if (!agentName || !prompt) {
        await safeSend(bot, chatId, 'Usage: `/ask <designer|senior_eng|spec_writer|scout|coder|critic> <question>`', MD);
        return;
      }
      try {
        await safeSendTyping(bot, chatId);
        const answer = await askAgent(agentName, prompt);
        await safeSend(bot, chatId, answer || '(empty reply)');
      } catch (err) {
        await safeSend(bot, chatId, `⚠️ /ask failed: ${err.message}`);
      }
      return;
    }

    if (text === '/help' || text === '/start') {
      const knownProviders = getKnownProviders();
      const helpText = [
        '🤖 *Tiger Bot Commands*',
        '',
        '/api \\- Show current provider & token stats',
        '/api `<name>` \\- Switch active API provider',
        '/tokens \\- Show token usage for today',
        '/limit \\- Show daily token limits per provider',
        '/limit `<name> <n>` \\- Set limit \\(0 = unlimited\\)',
        '/swarm \\- Show swarm on/off status',
        '/swarm `<on|off>` \\- Enable or disable swarm routing',
        '/status \\- Show swarm task status',
        '/task \\- List swarm tasks',
        '/task `continue <task_id>` \\- Resume a failed swarm task',
        '/task `retry <task_id>` \\- Alias of continue',
        '/task `delete <task_id>` \\- Delete a swarm task file',
        '/architecture \\- List architecture YAML files',
        '/architecture `show <file>` \\- Show architecture YAML',
        '/architecture `use <file>` \\- Set default architecture',
        '/architecture `write <file>` + newline + yaml \\- Save architecture YAML',
        '/taskstyle \\- List task style YAML files',
        '/taskstyle `show <file>` \\- Show task style YAML',
        '/taskstyle `write <file>` + newline + yaml \\- Save task style YAML',
        '/agents \\- Show internal swarm agents',
        '/cancel `<task_id>` \\- Cancel a swarm task',
        '/ask `<agent> <question>` \\- Ask a specific internal agent',
        '/help \\- Show this message',
        '',
        '*Available providers:* ' + knownProviders.join(', ')
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
      if (!swarmRoutingEnabled) {
        const reply = await handleMessage({ platform: 'telegram', userId, text });
        clearInterval(typingTimer);
        await safeSend(bot, chatId, reply);
        return;
      }
      const progressMarks = new Set();
      const flowResult = await runTigerFlow(text, {
        metadata: { platform: 'telegram', userId, chatId },
        onProgress: ({ phase, agent, task }) => {
          if (phase === 'task_created' && task && !progressMarks.has('created')) {
            progressMarks.add('created');
            void safeSend(bot, chatId, `Tiger: task created \\(${task.task_id}\\)\\. Starting Designer\\.`, { parse_mode: 'MarkdownV2' });
            return;
          }
          if (phase !== 'worker_done' || !task) return;
          const key = `${agent}:${task.next_agent}:${task.thread ? task.thread.length : 0}`;
          if (progressMarks.has(key)) return;
          progressMarks.add(key);
          let msg = `Tiger: ${agent} finished. Next: ${task.next_agent}.`;
          if (agent === 'senior_eng' && task.next_agent === 'designer') {
            msg = 'Tiger: Senior Eng requested changes. Designer is revising.';
          } else if (agent === 'senior_eng' && task.next_agent === 'spec_writer') {
            msg = 'Tiger: Senior Eng approved. Spec Writer is drafting the final spec.';
          }
          void safeSend(bot, chatId, msg);
        }
      });

      clearInterval(typingTimer);
      if (flowResult.ok) {
        await safeSend(bot, chatId, flowResult.result || '(empty result)');
        return;
      }

      const reply = await handleMessage({ platform: 'telegram', userId, text });
      await safeSend(bot, chatId, reply);
    } catch (err) {
      if (typingTimer) clearInterval(typingTimer);
      await safeSend(bot, chatId, `⚠️ Error: ${err.message}`);
    }
  });

  return bot;
}

module.exports = { startTelegramBot };
