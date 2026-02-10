const {
  kimiApiKey,
  kimiBaseUrl,
  kimiChatModel,
  kimiEmbedModel,
  kimiUserAgent,
  kimiTimeoutMs,
  embeddingsEnabled,
  kimiProvider
} = require('./config');

async function kimiRequest(path, body) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${kimiApiKey}`
  };
  if (kimiUserAgent) {
    headers['User-Agent'] = kimiUserAgent;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, kimiTimeoutMs || 30000));
  let res;
  try {
    res = await fetch(`${kimiBaseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error(`Kimi API timeout after ${Math.max(1000, kimiTimeoutMs || 30000)}ms`);
    }
    throw new Error(`Kimi API network error: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401) {
      const keyHint =
        kimiProvider === 'code'
          ? 'KIMI_CODE_API_KEY (Kimi Code token)'
          : 'MOONSHOT_API_KEY/KIMI_API_KEY (Moonshot Open Platform key)';
      throw new Error(
        `Kimi API auth failed (401). Verify ${keyHint}, base URL (${kimiBaseUrl}), and extra quotes/spaces. Raw response: ${text}`
      );
    }
    throw new Error(`Kimi API error ${res.status}: ${text}`);
  }

  return res.json();
}

async function chatCompletion(messages, options = {}) {
  const payload = {
    model: options.model || kimiChatModel,
    messages,
    temperature: options.temperature ?? 0.3
  };
  if (options.tools) payload.tools = options.tools;
  if (options.tool_choice) payload.tool_choice = options.tool_choice;

  const data = await kimiRequest('/chat/completions', payload);
  return data.choices?.[0]?.message || {};
}

async function embedText(input, model = kimiEmbedModel) {
  if (!embeddingsEnabled || !model) {
    throw new Error('Embeddings are disabled for the current Kimi provider/config.');
  }
  const data = await kimiRequest('/embeddings', {
    model,
    input
  });
  const vector = data.data?.[0]?.embedding;
  if (!vector || !Array.isArray(vector)) {
    throw new Error('Invalid embedding response from Kimi');
  }
  return vector;
}

module.exports = {
  chatCompletion,
  embedText
};
