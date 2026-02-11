const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { ensureDir, cosineSimilarity } = require('../utils');
const { dbPath, maxMessages, recentMessages, vectorDbPath, sqliteVecExtension } = require('../config');

ensureDir(path.dirname(dbPath));
ensureDir(path.dirname(vectorDbPath));

const sqliteMemoryScript = path.resolve(process.cwd(), 'scripts', 'sqlite_memory.py');
let sqliteMemoryReady = false;
let sqliteVecLoaded = false;
let sqliteInitError = '';

function runSqliteMemory(args) {
  if (!fs.existsSync(sqliteMemoryScript)) {
    throw new Error('sqlite memory helper script is missing');
  }
  const out = execFileSync('python3', [sqliteMemoryScript, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const parsed = JSON.parse(String(out || '{}'));
  if (parsed && parsed.ok === false) {
    throw new Error(String(parsed.error || 'sqlite memory helper failed'));
  }
  return parsed;
}

function ensureSqliteMemoryReady() {
  if (sqliteMemoryReady) return;
  try {
    const args = ['init', '--db', vectorDbPath];
    if (sqliteVecExtension) {
      args.push('--vec-ext', sqliteVecExtension);
    }
    const initResult = runSqliteMemory(args);
    sqliteVecLoaded = Boolean(initResult.vec_loaded);
    sqliteInitError = String(initResult.vec_error || '');
    sqliteMemoryReady = true;
  } catch (err) {
    sqliteMemoryReady = false;
    sqliteVecLoaded = false;
    sqliteInitError = String(err.message || err);
  }
}

function initVectorMemory() {
  ensureSqliteMemoryReady();
  if (sqliteMemoryReady) {
    let counts = null;
    try {
      const statsResult = runSqliteMemory(['stats', '--db', vectorDbPath]);
      counts = statsResult && statsResult.counts ? statsResult.counts : null;
    } catch (err) {
      counts = null;
    }
    return {
      ok: true,
      backend: 'sqlite',
      dbPath: vectorDbPath,
      sqliteVecLoaded,
      sqliteVecExtension,
      sqliteInitError,
      counts
    };
  }
  return {
    ok: false,
    backend: 'json-fallback',
    dbPath: dbPath,
    sqliteVecLoaded: false,
    sqliteVecExtension,
    sqliteInitError,
    counts: null
  };
}

function defaultState() {
  return {
    conversations: {},
    messages: [],
    memories: [],
    meta: {}
  };
}

function loadState() {
  if (!fs.existsSync(dbPath)) {
    return defaultState();
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return defaultState();
    return {
      conversations: parsed.conversations || {},
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      memories: Array.isArray(parsed.memories) ? parsed.memories : [],
      meta: parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {}
    };
  } catch (err) {
    return defaultState();
  }
}

const state = loadState();

function saveState() {
  fs.writeFileSync(dbPath, JSON.stringify(state, null, 2), 'utf8');
}

function now() {
  return Date.now();
}

function conversationId(platform, userId) {
  return `${platform}:${userId}`;
}

function nextId(rows) {
  if (!rows.length) return 1;
  return rows[rows.length - 1].id + 1;
}

function ensureConversation(platform, userId) {
  const id = conversationId(platform, userId);
  const ts = now();
  const existing = state.conversations[id];
  if (existing) {
    existing.updated_at = ts;
  } else {
    state.conversations[id] = {
      id,
      platform,
      user_id: userId,
      created_at: ts,
      updated_at: ts
    };
  }
  saveState();
  return id;
}

function addMessage(conversationIdValue, role, content) {
  state.messages.push({
    id: nextId(state.messages),
    conversation_id: conversationIdValue,
    role,
    content,
    created_at: now()
  });

  if (state.conversations[conversationIdValue]) {
    state.conversations[conversationIdValue].updated_at = now();
  }
  saveState();
}

function getRecentMessages(conversationIdValue, limit = recentMessages) {
  return state.messages
    .filter((m) => m.conversation_id === conversationIdValue)
    .slice(-limit)
    .map((m) => ({ role: m.role, content: m.content, created_at: m.created_at }));
}

function getMessageCount(conversationIdValue) {
  return state.messages.filter((m) => m.conversation_id === conversationIdValue).length;
}

function getMessagesForCompaction(conversationIdValue) {
  const count = getMessageCount(conversationIdValue);
  if (count <= maxMessages) return [];
  const toCompact = Math.max(0, count - recentMessages);
  if (!toCompact) return [];
  return state.messages
    .filter((m) => m.conversation_id === conversationIdValue)
    .slice(0, toCompact)
    .map((m) => ({ id: m.id, role: m.role, content: m.content }));
}

function deleteMessagesUpTo(conversationIdValue, maxId) {
  state.messages = state.messages.filter((m) => {
    if (m.conversation_id !== conversationIdValue) return true;
    return m.id > maxId;
  });
  saveState();
}

function addMemory(conversationIdValue, source, content, embedding) {
  const createdAt = now();
  ensureSqliteMemoryReady();

  if (sqliteMemoryReady) {
    try {
      runSqliteMemory([
        'add',
        '--db',
        vectorDbPath,
        '--conversation-id',
        String(conversationIdValue || ''),
        '--source',
        String(source || ''),
        '--content',
        String(content || ''),
        '--embedding-json',
        JSON.stringify(Array.isArray(embedding) ? embedding : []),
        '--created-at',
        String(createdAt)
      ]);
      return;
    } catch (err) {
      // Fall back to legacy JSON memory if sqlite path is unavailable.
    }
  }

  state.memories.push({
    id: nextId(state.memories),
    conversation_id: conversationIdValue,
    source,
    content,
    embedding,
    created_at: createdAt
  });
  saveState();
}

function getMeta(key, fallback = null) {
  if (!key) return fallback;
  if (!Object.prototype.hasOwnProperty.call(state.meta, key)) return fallback;
  return state.meta[key];
}

function setMeta(key, value) {
  if (!key) return;
  state.meta[key] = value;
  saveState();
}

function getRecentMessagesAll(limit = 200) {
  return state.messages.slice(-limit).map((m) => ({
    conversation_id: m.conversation_id,
    role: m.role,
    content: m.content,
    created_at: m.created_at
  }));
}

function getMessagesSince(sinceTs, limit = 500) {
  const threshold = Number(sinceTs || 0);
  return state.messages
    .filter((m) => Number(m.created_at || 0) > threshold)
    .slice(-limit)
    .map((m) => ({
      conversation_id: m.conversation_id,
      role: m.role,
      content: m.content,
      created_at: m.created_at
    }));
}

function getRelevantMemories(conversationIdValue, queryEmbedding, limit = 6) {
  ensureSqliteMemoryReady();
  if (sqliteMemoryReady) {
    try {
      const result = runSqliteMemory([
        'search',
        '--db',
        vectorDbPath,
        '--conversation-id',
        String(conversationIdValue || ''),
        '--query-embedding-json',
        JSON.stringify(Array.isArray(queryEmbedding) ? queryEmbedding : []),
        '--limit',
        String(limit),
        '--min-score',
        '0.1',
        '--window',
        '600'
      ]);
      const rows = Array.isArray(result.rows) ? result.rows : [];
      if (rows.length) {
        return rows;
      }
    } catch (err) {
      // Fall through to JSON fallback.
    }
  }

  return state.memories
    .filter(
      (m) =>
        m.conversation_id === conversationIdValue ||
        m.conversation_id === 'global' ||
        m.source === 'self_reflection'
    )
    .slice(-300)
    .map((m) => ({
      id: m.id,
      source: m.source,
      content: m.content,
      created_at: m.created_at,
      score: cosineSimilarity(queryEmbedding, m.embedding || [])
    }))
    .filter((m) => m.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function recordSkillUsage(name, provider = 'tool') {
  const skillName = String(name || '').trim();
  if (!skillName) return;
  ensureSqliteMemoryReady();
  if (!sqliteMemoryReady) return;
  try {
    runSqliteMemory([
      'upsert-skill',
      '--db',
      vectorDbPath,
      '--name',
      skillName,
      '--provider',
      String(provider || 'tool'),
      '--enabled',
      '1',
      '--updated-at',
      String(now())
    ]);
  } catch (err) {
    // Non-blocking telemetry.
  }
}

module.exports = {
  db: state,
  ensureConversation,
  addMessage,
  getRecentMessages,
  getMessageCount,
  getMessagesForCompaction,
  deleteMessagesUpTo,
  addMemory,
  getRelevantMemories,
  getMeta,
  setMeta,
  getRecentMessagesAll,
  getMessagesSince,
  initVectorMemory,
  recordSkillUsage
};
