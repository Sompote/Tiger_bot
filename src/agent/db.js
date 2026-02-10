const fs = require('fs');
const path = require('path');
const { ensureDir, cosineSimilarity } = require('../utils');
const { dbPath, maxMessages, recentMessages } = require('../config');

ensureDir(path.dirname(dbPath));

function defaultState() {
  return {
    conversations: {},
    messages: [],
    memories: []
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
      memories: Array.isArray(parsed.memories) ? parsed.memories : []
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
  state.memories.push({
    id: nextId(state.memories),
    conversation_id: conversationIdValue,
    source,
    content,
    embedding,
    created_at: now()
  });
  saveState();
}

function getRelevantMemories(conversationIdValue, queryEmbedding, limit = 6) {
  return state.memories
    .filter((m) => m.conversation_id === conversationIdValue)
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

module.exports = {
  db: state,
  ensureConversation,
  addMessage,
  getRecentMessages,
  getMessageCount,
  getMessagesForCompaction,
  deleteMessagesUpTo,
  addMemory,
  getRelevantMemories
};
