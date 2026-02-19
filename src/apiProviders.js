'use strict';

const crypto = require('crypto');

// ─── Zhipu AI (BigModel) JWT auth ──────────────────────────────────────────
// Their v4 API requires HS256 JWT derived from the api-key (format: "id.secret")
function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function zhipuJwt(apiKey) {
  const dot = apiKey.indexOf('.');
  if (dot === -1) return apiKey; // fallback: treat as plain token
  const id = apiKey.slice(0, dot);
  const secret = apiKey.slice(dot + 1);
  const now = Math.floor(Date.now() / 1000);
  const hdr = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', sign_type: 'SIGN' })));
  const pay = b64url(Buffer.from(JSON.stringify({ api_key: id, exp: now + 3600, timestamp: now })));
  const sig = b64url(crypto.createHmac('sha256', secret).update(`${hdr}.${pay}`).digest());
  return `${hdr}.${pay}.${sig}`;
}

// ─── OpenAI-compatible adapters ────────────────────────────────────────────

function standardFormat(messages, options) {
  const payload = {
    model: options.model,
    messages,
    temperature: options.temperature ?? 0.3
  };
  if (options.tools && options.tools.length) payload.tools = options.tools;
  if (options.tool_choice) payload.tool_choice = options.tool_choice;
  return payload;
}

function standardParse(data) {
  const message = data.choices?.[0]?.message || {};
  const u = data.usage || {};
  const tokens = (u.prompt_tokens || 0) + (u.completion_tokens || 0);
  return { message, tokens };
}

// ─── Claude (Anthropic) adapters ───────────────────────────────────────────

function claudeFormat(messages, options) {
  const systemMsg = messages.find((m) => m.role === 'system');
  const rest = messages.filter((m) => m.role !== 'system');

  // Convert tool definitions: OpenAI → Claude
  let tools;
  if (options.tools && options.tools.length) {
    tools = options.tools.map((t) => ({
      name: t.function.name,
      description: t.function.description || '',
      input_schema: t.function.parameters || { type: 'object', properties: {} }
    }));
  }

  // Convert message content: tool_calls & tool results
  const converted = rest.map((m) => {
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      const content = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      for (const tc of m.tool_calls) {
        let input = {};
        try { input = JSON.parse(tc.function.arguments || '{}'); } catch (_) {}
        content.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
      }
      return { role: 'assistant', content };
    }
    if (m.role === 'tool') {
      return {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: String(m.content || '') }]
      };
    }
    return m;
  });

  const payload = {
    model: options.model,
    max_tokens: options.max_tokens || 8192,
    messages: converted
  };
  if (systemMsg) payload.system = systemMsg.content;
  if (tools && tools.length) {
    payload.tools = tools;
    // Convert OpenAI tool_choice format → Claude format
    const tc = options.tool_choice;
    if (tc && tc !== 'none') {
      if (tc === 'auto' || tc === 'required') {
        payload.tool_choice = { type: tc === 'required' ? 'any' : 'auto' };
      } else if (tc && typeof tc === 'object' && tc.type === 'function') {
        payload.tool_choice = { type: 'tool', name: tc.function.name };
      }
    }
  }
  return payload;
}

function claudeParse(data) {
  const content = Array.isArray(data.content) ? data.content : [];
  const textBlock = content.find((b) => b.type === 'text');
  const toolUseBlocks = content.filter((b) => b.type === 'tool_use');

  const message = { role: 'assistant', content: textBlock ? textBlock.text : '' };
  if (toolUseBlocks.length) {
    message.tool_calls = toolUseBlocks.map((tb) => ({
      id: tb.id,
      type: 'function',
      function: { name: tb.name, arguments: JSON.stringify(tb.input || {}) }
    }));
  }

  const u = data.usage || {};
  const tokens = (u.input_tokens || 0) + (u.output_tokens || 0);
  return { message, tokens };
}

// ─── Provider registry ─────────────────────────────────────────────────────

function buildProviders(env) {
  return {
    kimi: {
      id: 'kimi',
      name: 'Kimi Code',
      baseUrl: (env.KIMI_BASE_URL || 'https://api.kimi.com/coding/v1').replace(/\/$/, ''),
      chatModel: env.KIMI_CHAT_MODEL ? env.KIMI_CHAT_MODEL.replace(/^kimi-coding\//, '') : 'k2p5',
      embedModel: env.KIMI_EMBED_MODEL || '',
      apiKey: env.KIMI_CODE_API_KEY || env.KIMI_API_KEY || '',
      userAgent: env.KIMI_USER_AGENT || 'KimiCLI/0.77',
      authHeaders: (key) => ({ Authorization: `Bearer ${key}` }),
      chatPath: '/chat/completions',
      embedPath: '/embeddings',
      formatRequest: standardFormat,
      parseResponse: standardParse,
      timeout: Number(env.KIMI_TIMEOUT_MS || 30000)
    },

    moonshot: {
      id: 'moonshot',
      name: 'Kimi Moonshot',
      baseUrl: (env.MOONSHOT_BASE_URL || 'https://api.moonshot.cn/v1').replace(/\/$/, ''),
      chatModel: env.MOONSHOT_MODEL || 'kimi-k1',
      embedModel: env.MOONSHOT_EMBED_MODEL || 'kimi-embedding-v1',
      apiKey: env.MOONSHOT_API_KEY || env.KIMI_API_KEY || '',
      userAgent: '',
      authHeaders: (key) => ({ Authorization: `Bearer ${key}` }),
      chatPath: '/chat/completions',
      embedPath: '/embeddings',
      formatRequest: standardFormat,
      parseResponse: standardParse,
      timeout: Number(env.KIMI_TIMEOUT_MS || 30000)
    },

    zai: {
      id: 'zai',
      name: 'Z.ai',
      baseUrl: (env.ZAI_BASE_URL || 'https://api.z.ai/api/coding/paas/v4').replace(/\/$/, ''),
      chatModel: env.ZAI_MODEL || 'glm-4.7',
      embedModel: env.ZAI_EMBED_MODEL || '',
      apiKey: env.ZAI_API_KEY || '',
      userAgent: '',
      // api.z.ai uses plain Bearer; old bigmodel.cn used Zhipu JWT
      authHeaders: (key) => {
        const baseUrl = (env.ZAI_BASE_URL || '').toLowerCase();
        if (baseUrl.includes('bigmodel.cn')) return { Authorization: `Bearer ${zhipuJwt(key)}` };
        return { Authorization: `Bearer ${key}` };
      },
      chatPath: '/chat/completions',
      embedPath: '/embeddings',
      formatRequest: standardFormat,
      parseResponse: standardParse,
      timeout: Number(env.ZAI_TIMEOUT_MS || 30000)
    },

    minimax: {
      id: 'minimax',
      name: 'MiniMax',
      baseUrl: (env.MINIMAX_BASE_URL || 'https://api.minimax.chat/v1').replace(/\/$/, ''),
      chatModel: env.MINIMAX_MODEL || 'abab6.5s-chat',
      embedModel: env.MINIMAX_EMBED_MODEL || '',
      apiKey: env.MINIMAX_API_KEY || '',
      userAgent: '',
      authHeaders: (key) => ({ Authorization: `Bearer ${key}` }),
      chatPath: '/chat/completions',
      embedPath: '/embeddings',
      formatRequest: standardFormat,
      parseResponse: standardParse,
      timeout: Number(env.MINIMAX_TIMEOUT_MS || 30000)
    },

    claude: {
      id: 'claude',
      name: 'Claude (Anthropic)',
      baseUrl: (env.CLAUDE_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, ''),
      chatModel: env.CLAUDE_MODEL || 'claude-sonnet-4-6',
      embedModel: '',
      apiKey: env.CLAUDE_API_KEY || env.ANTHROPIC_API_KEY || '',
      userAgent: '',
      authHeaders: (key) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' }),
      chatPath: '/v1/messages',
      embedPath: null, // Claude does not expose an embeddings endpoint
      formatRequest: claudeFormat,
      parseResponse: claudeParse,
      timeout: Number(env.CLAUDE_TIMEOUT_MS || 60000)
    }
  };
}

// Singleton — providers are built once from process.env on first access
let _providers = null;
function getProviders() {
  if (!_providers) _providers = buildProviders(process.env);
  return _providers;
}

function getProvider(id) {
  return getProviders()[id] || null;
}

module.exports = { getProviders, getProvider };
