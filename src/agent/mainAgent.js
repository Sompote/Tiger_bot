const fs = require('fs');
const path = require('path');
const { chatCompletion, embedText } = require('../kimiClient');
const {
  embeddingsEnabled,
  allowShell,
  ownSkillPath,
  ownSkillUpdateHours,
  soulPath,
  soulUpdateHours
} = require('../config');
const { loadContextFiles } = require('./contextFiles');
const { tools, callTool } = require('./toolbox');
const {
  ensureConversation,
  addMessage,
  getRecentMessages,
  getMessagesForCompaction,
  deleteMessagesUpTo,
  addMemory,
  getRelevantMemories
} = require('./db');

function safeJsonParse(text, fallback = {}) {
  try {
    return JSON.parse(text);
  } catch (err) {
    return fallback;
  }
}

function renderContextFiles(files) {
  return files
    .map((f) => `## ${f.name}\n${f.content}`)
    .join('\n\n');
}

async function compactConversation(conversationIdValue) {
  const rows = getMessagesForCompaction(conversationIdValue);
  if (!rows.length) return;

  const raw = rows.map((r) => `${r.role.toUpperCase()}: ${r.content}`).join('\n');
  const summaryMessage = await chatCompletion([
    {
      role: 'system',
      content:
        'Summarize dialogue into durable memory: user profile, goals, preferences, commitments, decisions, unresolved items.'
    },
    {
      role: 'user',
      content: raw
    }
  ]);

  const summary = String(summaryMessage.content || '').trim();
  if (!summary) return;

  let emb = [];
  if (embeddingsEnabled) {
    try {
      emb = await embedText(summary);
    } catch (err) {
      emb = [];
    }
  }
  if (emb.length) {
    addMemory(conversationIdValue, 'compaction', summary, emb);
  }

  const maxId = rows[rows.length - 1].id;
  deleteMessagesUpTo(conversationIdValue, maxId);
}

async function maybeUpdateHumanFile(userText, assistantText) {
  const files = loadContextFiles();
  const human2 = files.find((f) => f.name === 'human2.md');
  if (!human2) return;

  const message = await chatCompletion([
    {
      role: 'system',
      content:
        'Extract long-term user profile updates. Return strict JSON: {"append": "..."} or {"append": ""}. Use short bullets.'
    },
    {
      role: 'user',
      content: `User message:\n${userText}\n\nAssistant message:\n${assistantText}`
    }
  ]);

  const parsed = safeJsonParse(String(message.content || '{}'), {});
  const append = String(parsed.append || '').trim();
  if (!append) return;

  const block = `\n## Update ${new Date().toISOString()}\n${append}\n`;
  fs.appendFileSync(path.resolve(human2.full), block, 'utf8');
}

function buildSystemPrompt(contextText, memoriesText) {
  const shellStatus = allowShell ? 'enabled' : 'disabled';
  return [
    'You are Tiger, a practical orchestration agent.',
    'Use tools when needed to inspect files, execute tasks, load skills, and run sub-agents.',
    'For OpenClaw skills, use clawhub_search and clawhub_install tools.',
    'For greetings/small talk (e.g., "hi", "hello", "how are you"), reply directly and do not start tool/setup actions.',
    'Only begin setup/install/search/execution steps when the user explicitly asks for those actions.',
    `Shell tool status right now: ${shellStatus}.`,
    'If a user asks to search the web, call run_shell first and use installed skills/commands.',
    'Do not claim shell is disabled unless a run_shell tool call in this turn returns that error.',
    'If tool output is incomplete, continue calling tools before final answer.',
    'Keep answers concise and actionable.',
    '',
    'Always account for this identity and user profile context:',
    contextText,
    '',
    memoriesText ? `Relevant compacted memory:\n${memoriesText}` : ''
  ]
    .filter(Boolean)
    .join('\n');
}

function shouldRefreshFile(filePath, updateHours) {
  try {
    const stat = fs.statSync(filePath);
    const maxAgeMs = updateHours * 60 * 60 * 1000;
    return Date.now() - stat.mtimeMs >= maxAgeMs;
  } catch (err) {
    return true;
  }
}

function shouldRefreshOwnSkill() {
  return shouldRefreshFile(ownSkillPath, ownSkillUpdateHours);
}

async function maybeUpdateOwnSkillSummary(conversationIdValue) {
  if (!shouldRefreshOwnSkill()) return;

  const recent = getRecentMessages(conversationIdValue, 80);
  const transcript = recent
    .map((m) => `${String(m.role || '').toUpperCase()}: ${String(m.content || '')}`)
    .join('\n');
  const previous = fs.existsSync(ownSkillPath) ? fs.readFileSync(ownSkillPath, 'utf8') : '';

  const message = await chatCompletion([
    {
      role: 'system',
      content: [
        'You maintain Tiger\'s own skill summary file.',
        'Return concise markdown only.',
        'Include sections:',
        '# ownskill',
        '## Updated',
        '## Skills Learned',
        '## Recent Work Summary',
        '## Known Limits',
        '## Next Improvements',
        'Base updates on recent conversation work and keep it factual.'
      ].join('\n')
    },
    {
      role: 'user',
      content: `Previous ownskill.md:\n${previous || '(empty)'}\n\nRecent work transcript:\n${transcript || '(empty)'}`
    }
  ]);

  const next = String(message.content || '').trim();
  if (!next) return;
  fs.writeFileSync(path.resolve(ownSkillPath), `${next}\n`, 'utf8');
}

async function maybeUpdateSoulSummary(conversationIdValue) {
  if (!shouldRefreshFile(soulPath, soulUpdateHours)) return;

  const recent = getRecentMessages(conversationIdValue, 80);
  const transcript = recent
    .map((m) => `${String(m.role || '').toUpperCase()}: ${String(m.content || '')}`)
    .join('\n');
  const previous = fs.existsSync(soulPath) ? fs.readFileSync(soulPath, 'utf8') : '';
  const nowIso = new Date().toISOString();

  const message = await chatCompletion([
    {
      role: 'system',
      content: [
        "You maintain Tiger's soul.md: identity, principles, operating rules, and stable preferences.",
        'Return concise markdown only.',
        'Always include a section:',
        '## Self-Update',
        `- cadence_hours: ${soulUpdateHours}`,
        `- last_updated: ${nowIso}`,
        '- note: This is a self-maintained summary (not model training).',
        'Keep it factual; do not include secrets/tokens; do not paste API keys.'
      ].join('\n')
    },
    {
      role: 'user',
      content: `Previous soul.md:\n${previous || '(empty)'}\n\nRecent work transcript:\n${transcript || '(empty)'}`
    }
  ]);

  const next = String(message.content || '').trim();
  if (!next) return;
  fs.writeFileSync(path.resolve(soulPath), `${next}\n`, 'utf8');
}

async function runWithTools(initialMessages) {
  const messages = [...initialMessages];
  const maxToolRounds = 8;
  let lastToolError = null;

  for (let i = 0; i < maxToolRounds; i += 1) {
    const assistant = await chatCompletion(messages, { tools, tool_choice: 'auto' });
    const rawToolCalls = Array.isArray(assistant.tool_calls) ? assistant.tool_calls : [];
    const toolCalls = rawToolCalls.filter((tc) => tc && tc.id && tc.function && tc.function.name);
    const assistantContent = assistant.content || '';
    const reasoningContent = assistant.reasoning_content || '';

    const assistantMsg = {
      role: 'assistant',
      content: assistantContent,
      tool_calls: toolCalls
    };
    if (reasoningContent) {
      assistantMsg.reasoning_content = reasoningContent;
    }
    messages.push(assistantMsg);

    if (!toolCalls.length) {
      if (assistantContent) return assistantContent;
      if (lastToolError) {
        return `⚠️ ${lastToolError.name} failed: ${lastToolError.error}`;
      }
      // Allow one more round if the model emitted a reasoning-only assistant turn.
      continue;
    }

    for (const tc of toolCalls) {
      const fn = tc.function || {};
      const name = fn.name || '';
      const args = safeJsonParse(fn.arguments || '{}', {});
      let payload;
      try {
        payload = await callTool(name, args);
      } catch (err) {
        payload = { ok: false, error: err.message };
      }

      const toolFailed =
        payload?.ok === false ||
        payload?.status === 'error' ||
        (typeof payload?.error === 'string' && payload.error.length > 0);
      if (toolFailed) {
        lastToolError = {
          name,
          error: String(payload?.error || 'tool execution failed')
        };
      }

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(payload)
      });
    }
  }

  const fallback = await chatCompletion(messages, { tools: [], tool_choice: 'none' });
  const fallbackText = String(fallback.content || '').trim();
  if (fallbackText) return fallbackText;
  if (lastToolError) {
    return `⚠️ ${lastToolError.name} failed: ${lastToolError.error}`;
  }
  return 'I could not produce a final answer.';
}

async function handleMessage({ platform, userId, text }) {
  const conversationIdValue = ensureConversation(platform, userId);
  addMessage(conversationIdValue, 'user', text);

  try {
    await compactConversation(conversationIdValue);
  } catch (err) {
    // Keep chat available even if compaction fails.
  }

  const contextFiles = loadContextFiles();
  const contextText = renderContextFiles(contextFiles);
  const recent = getRecentMessages(conversationIdValue);

  let memoryText = '';
  if (embeddingsEnabled) {
    try {
      const qEmb = await embedText(text);
      const relevant = getRelevantMemories(conversationIdValue, qEmb, 6);
      memoryText = relevant
        .map((m) => `- (${m.source}) ${m.content}`)
        .join('\n');
    } catch (err) {
      memoryText = '';
    }
  }

  const system = buildSystemPrompt(contextText, memoryText);
  const messages = [
    { role: 'system', content: system },
    ...recent.map((m) => ({ role: m.role, content: m.content }))
  ];

  const reply = (await runWithTools(messages)).trim() || 'No response generated.';
  addMessage(conversationIdValue, 'assistant', reply);

  try {
    await maybeUpdateHumanFile(text, reply);
  } catch (err) {
    // Non-blocking profile update.
  }

  try {
    await maybeUpdateOwnSkillSummary(conversationIdValue);
  } catch (err) {
    // Non-blocking own-skill update.
  }

  try {
    await maybeUpdateSoulSummary(conversationIdValue);
  } catch (err) {
    // Non-blocking soul update.
  }

  return reply;
}

module.exports = {
  handleMessage
};
