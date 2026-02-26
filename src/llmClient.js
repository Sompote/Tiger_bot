'use strict';

/**
 * llmClient.js
 *
 * Multi-provider LLM client.  Drop-in replacement for kimiClient.js.
 *
 * Exported API (identical to kimiClient):
 *   chatCompletion(messages, options) → message object
 *   embedText(input, model?)          → number[]
 *
 * Auto-switch behaviour:
 *   - Before each request:  skip providers that are over their token limit.
 *   - On 429 rate-limit:    immediately switch to next provider and retry.
 *   - After each response:  record token usage; if limit now exceeded, queue
 *     an auto-switch so the next request uses a fresh provider.
 */

const { getProvider } = require('./apiProviders');
const tokenManager = require('./tokenManager');

// ─── Low-level fetch wrapper ─────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchProvider(provider, endpoint, body, maxRetries = 3) {
  const key = provider.apiKey;
  const headers = { 'Content-Type': 'application/json', ...provider.authHeaders(key) };
  if (provider.userAgent) headers['User-Agent'] = provider.userAgent;

  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(attempt * 2000, 10000); // 2s, 4s, 6s … capped at 10s
      process.stderr.write(`[llm] 429 on ${provider.name}, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})\n`);
      await sleep(delay);
    }

    const timeout = provider.timeout || 30000;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);

    let res;
    try {
      res = await fetch(`${provider.baseUrl}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
    } catch (err) {
      clearTimeout(timer);
      if (err && err.name === 'AbortError') {
        throw Object.assign(new Error(`Timeout after ${timeout}ms (${provider.name})`), { status: 0 });
      }
      throw Object.assign(new Error(`Network error (${provider.name}): ${err.message}`), { status: 0 });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      lastErr = Object.assign(new Error(`HTTP ${res.status} from ${provider.name}: ${text}`), { status: res.status });
      if (res.status === 429 && attempt < maxRetries) continue; // retry on rate limit
      throw lastErr;
    }

    return res.json();
  }

  throw lastErr;
}

// ─── chatCompletion ──────────────────────────────────────────────────────────

async function chatCompletion(messages, options = {}) {
  // Build candidate list: active provider first, then fallbacks
  const activeId = tokenManager.getCurrentProvider();
  const candidates = [activeId, ...tokenManager.getNextCandidates(activeId)];
  const fallbackOnAnyProviderError = Boolean(options.fallbackOnAnyProviderError);

  let firstError = null;

  for (const providerId of candidates) {
    if (!providerId) continue;

    // Skip if over daily limit
    if (tokenManager.isOverLimit(providerId)) continue;

    const provider = getProvider(providerId);
    if (!provider || !provider.apiKey) continue;

    const reqOptions = { ...options, model: options.model || provider.chatModel };
    const body = provider.formatRequest(messages, reqOptions);

    let data;
    try {
      data = await fetchProvider(provider, provider.chatPath, body);
    } catch (err) {
      if (!firstError) firstError = err; // keep the active provider's error

      // 429 = rate limit, 403 = quota exhausted — both warrant a fallback
      if (err.status === 429 || err.status === 403) {
        const reason = err.status === 429 ? 'rate_limit' : 'quota_exceeded';
        const switched = tokenManager.autoSwitch(reason);
        if (switched.switched) {
          process.stderr.write(`[llm] ${reason} on ${providerId} → switched to ${switched.to}\n`);
        }
        continue;
      }

      // Optional broader failover (used by swarm): timeout/network/API errors can route to next provider.
      if (fallbackOnAnyProviderError) {
        const switched = tokenManager.autoSwitch('provider_error');
        if (switched.switched) {
          process.stderr.write(`[llm] provider_error on ${providerId} → switched to ${switched.to}\n`);
        }
        continue;
      }

      // Any other error (auth, network, server error) — surface immediately
      throw err;
    }

    const { message, tokens } = provider.parseResponse(data);

    // Record usage
    tokenManager.recordTokens(providerId, tokens || 0);

    // Queue auto-switch if this request pushed us over the limit
    if (tokenManager.isOverLimit(providerId)) {
      const switched = tokenManager.autoSwitch('token_limit');
      if (switched.switched) {
        process.stderr.write(`[llm] Token limit reached for ${providerId} → next request will use ${switched.to}\n`);
      }
    }

    return message;
  }

  throw firstError || new Error('All providers failed or exhausted.');
}

// ─── embedText ───────────────────────────────────────────────────────────────

async function embedText(input, model) {
  // Find first provider in order that supports embeddings and has a key
  const candidates = [tokenManager.getCurrentProvider(), ...tokenManager.getNextCandidates(tokenManager.getCurrentProvider())];
  let provider = null;
  let providerId = null;
  for (const id of candidates) {
    const p = getProvider(id);
    if (p && p.apiKey && p.embedPath && (model || p.embedModel)) { provider = p; providerId = id; break; }
  }
  if (!provider) throw new Error('No provider with embeddings support and a configured API key.');

  const embedModel = model || provider.embedModel;
  if (!embedModel) throw new Error(`No embedding model configured for "${provider.name}".`);

  const data = await fetchProvider(provider, provider.embedPath, { model: embedModel, input });

  const vector = data.data?.[0]?.embedding;
  if (!vector || !Array.isArray(vector)) {
    throw new Error(`Invalid embedding response from ${provider.name}.`);
  }

  tokenManager.recordTokens(providerId, data.usage?.total_tokens || 0);
  return vector;
}

module.exports = { chatCompletion, embedText };
