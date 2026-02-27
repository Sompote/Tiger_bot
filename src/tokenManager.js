'use strict';

/**
 * tokenManager.js
 *
 * Tracks daily token usage per provider, enforces per-provider limits, and
 * handles auto-switching when a limit or rate-limit is hit.
 *
 * Config (read from .env via config.js on init):
 *   ACTIVE_PROVIDER        - starting provider id
 *   PROVIDER_ORDER         - comma-separated priority list
 *   <PROVIDER>_TOKEN_LIMIT - daily token cap per provider (0 = unlimited)
 */

const fs = require('fs');
const path = require('path');
const { getProviders } = require('./apiProviders');

const USAGE_FILE = path.resolve('./db/token_usage.json');

// --- In-memory state ---------------------------------------------------------

const state = {
  activeProvider: '',
  providerOrder: [],
  limits: {},          // { providerId: number }
  usage: {}            // { providerId: { tokens, requests, date } }
};

let _initialized = false;

// --- Helpers ----------------------------------------------------------------

function todayStr() {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

function cleanEnv(v) {
  return String(v || '').trim().replace(/^['"]|['"]$/g, '');
}

function getAllProviderIds() {
  return Object.keys(getProviders());
}

function tokenLimitEnvKey(id) {
  return `${id.toUpperCase()}_TOKEN_LIMIT`;
}

function buildProviderOrder(env) {
  const known = new Set(getAllProviderIds());
  const orderRaw = cleanEnv(env.PROVIDER_ORDER);

  if (orderRaw) {
    const parsed = orderRaw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((id) => id && known.has(id));
    if (parsed.length) return [...new Set(parsed)];
  }

  // If no explicit order is set, prefer providers that have a key configured.
  const withKey = Object.entries(getProviders())
    .filter(([, provider]) => cleanEnv(provider.apiKey))
    .map(([id]) => id);
  if (withKey.length) return withKey;

  return getAllProviderIds();
}

// --- Persistence -------------------------------------------------------------

function loadUsageFile() {
  try {
    if (!fs.existsSync(USAGE_FILE)) return {};
    return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8')) || {};
  } catch (_) {
    return {};
  }
}

function saveUsageFile() {
  try {
    fs.mkdirSync(path.dirname(USAGE_FILE), { recursive: true });
    fs.writeFileSync(USAGE_FILE, JSON.stringify(state.usage, null, 2), 'utf8');
  } catch (_) {}
}

// --- Init -------------------------------------------------------------------

function init() {
  if (_initialized) return;
  _initialized = true;

  const env = process.env;
  const today = todayStr();

  // Provider order
  state.providerOrder = buildProviderOrder(env);

  // Active provider
  const activeEnv = cleanEnv(env.ACTIVE_PROVIDER).toLowerCase();
  state.activeProvider = state.providerOrder.includes(activeEnv)
    ? activeEnv
    : (state.providerOrder[0] || '');

  // Token limits per provider (0 = unlimited)
  state.limits = {};
  for (const id of state.providerOrder) {
    state.limits[id] = Number(env[tokenLimitEnvKey(id)] || 0);
  }

  // Load persisted daily usage; discard stale days
  const persisted = loadUsageFile();
  state.usage = {};
  for (const [id, record] of Object.entries(persisted)) {
    if (record && record.date === today) {
      state.usage[id] = { tokens: Number(record.tokens || 0), requests: Number(record.requests || 0), date: today };
    }
  }
}

function ensureInit() {
  if (!_initialized) init();
}

// --- Public API --------------------------------------------------------------

function getCurrentProvider() {
  ensureInit();
  return state.activeProvider;
}

function getKnownProviders() {
  ensureInit();
  return [...state.providerOrder];
}

/**
 * Set the daily token limit for a provider at runtime.
 * limit = 0 means unlimited. Returns { ok } or { ok: false, error }.
 */
function setLimit(id, limit) {
  ensureInit();
  if (!state.providerOrder.includes(id)) return { ok: false, error: `Unknown provider: ${id}` };
  const n = Number(limit);
  if (isNaN(n) || n < 0) return { ok: false, error: 'Limit must be a non-negative number (0 = unlimited)' };
  state.limits[id] = Math.floor(n);
  saveUsageFile();
  return { ok: true };
}

/**
 * Manually switch to a named provider.
 * Returns { ok, provider } or { ok: false, error }
 */
function setProvider(id) {
  ensureInit();
  if (!state.providerOrder.includes(id)) {
    return { ok: false, error: `Unknown provider: ${id}` };
  }
  const prev = state.activeProvider;
  state.activeProvider = id;
  saveUsageFile();
  return { ok: true, from: prev, to: id };
}

/**
 * Record token usage for a provider after a successful response.
 */
function recordTokens(providerId, tokens) {
  ensureInit();
  const today = todayStr();
  if (!state.usage[providerId] || state.usage[providerId].date !== today) {
    state.usage[providerId] = { tokens: 0, requests: 0, date: today };
  }
  state.usage[providerId].tokens += Math.max(0, tokens || 0);
  state.usage[providerId].requests += 1;
  saveUsageFile();
}

/**
 * True if the provider has exceeded its daily token limit.
 */
function isOverLimit(providerId) {
  ensureInit();
  const limit = state.limits[providerId] || 0;
  if (limit === 0) return false;
  const rec = state.usage[providerId];
  if (!rec || rec.date !== todayStr()) return false;
  return rec.tokens >= limit;
}

/**
 * Returns all providers in priority order that are not over-limit,
 * excluding the specified provider.
 */
function getNextCandidates(excludeId) {
  ensureInit();
  return state.providerOrder.filter((p) => p !== excludeId && !isOverLimit(p));
}

/**
 * Auto-switch to the next available provider.
 * Returns { switched, from, to, reason }
 */
function autoSwitch(reason) {
  ensureInit();
  const current = state.activeProvider;
  const candidates = getNextCandidates(current);
  if (!candidates.length) {
    return { switched: false, from: current, reason };
  }
  const next = candidates[0];
  state.activeProvider = next;
  saveUsageFile();
  return { switched: true, from: current, to: next, reason };
}

/**
 * Full status for all configured providers.
 */
function getStatus() {
  ensureInit();
  const today = todayStr();
  return state.providerOrder.map((id) => {
    const rec = state.usage[id];
    const tokens = rec && rec.date === today ? rec.tokens : 0;
    const requests = rec && rec.date === today ? rec.requests : 0;
    const limit = state.limits[id] || 0;
    return {
      id,
      active: id === state.activeProvider,
      tokens,
      requests,
      limit,
      over: isOverLimit(id)
    };
  });
}

/**
 * Reset daily usage for a provider (or all if no id given).
 */
function resetUsage(providerId) {
  ensureInit();
  if (providerId) {
    delete state.usage[providerId];
  } else {
    state.usage = {};
  }
  saveUsageFile();
}

module.exports = {
  init,
  getCurrentProvider,
  getKnownProviders,
  setProvider,
  setLimit,
  recordTokens,
  isOverLimit,
  getNextCandidates,
  autoSwitch,
  getStatus,
  resetUsage
};
