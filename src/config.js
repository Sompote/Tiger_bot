const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

function cleanEnvValue(value) {
  if (value == null) return '';
  return String(value).trim().replace(/^['"]|['"]$/g, '');
}

function normalizeModelForProvider(provider, model) {
  const text = cleanEnvValue(model);
  if (!text) return text;
  if (!text.includes('/')) return text;

  if (provider === 'code' && text.toLowerCase().startsWith('kimi-coding/')) {
    return text.slice('kimi-coding/'.length);
  }
  if (provider === 'moonshot' && text.toLowerCase().startsWith('moonshot/')) {
    return text.slice('moonshot/'.length);
  }
  return text;
}

const providerRaw = cleanEnvValue(process.env.KIMI_PROVIDER || '').toLowerCase();
const kimiProvider =
  providerRaw || (cleanEnvValue(process.env.KIMI_CODE_API_KEY) ? 'code' : 'moonshot');

if (!['moonshot', 'code'].includes(kimiProvider)) {
  throw new Error('Invalid KIMI_PROVIDER. Use "moonshot" or "code".');
}

const rawApiKey =
  kimiProvider === 'code'
    ? process.env.KIMI_CODE_API_KEY || process.env.KIMI_API_KEY || ''
    : process.env.MOONSHOT_API_KEY || process.env.KIMI_API_KEY || '';
const kimiApiKey = cleanEnvValue(rawApiKey);
if (!kimiApiKey) {
  if (kimiProvider === 'code') {
    throw new Error('Missing required env: KIMI_CODE_API_KEY (or KIMI_API_KEY)');
  }
  throw new Error('Missing required env: MOONSHOT_API_KEY (or KIMI_API_KEY)');
}

const defaultBaseUrl =
  kimiProvider === 'code' ? 'https://api.kimi.com/coding/v1' : 'https://api.moonshot.cn/v1';
const defaultChatModel = kimiProvider === 'code' ? 'k2p5' : 'kimi-k1';
const defaultEmbedModel = kimiProvider === 'code' ? '' : 'kimi-embedding-v1';
const defaultUserAgent = kimiProvider === 'code' ? 'KimiCLI/0.77' : '';

const embedFlagRaw = cleanEnvValue(process.env.KIMI_ENABLE_EMBEDDINGS || '');
const embeddingsEnabled =
  embedFlagRaw === ''
    ? kimiProvider !== 'code'
    : ['1', 'true', 'yes', 'on'].includes(embedFlagRaw.toLowerCase());
const ownSkillUpdateHours = Math.max(1, Number(process.env.OWN_SKILL_UPDATE_HOURS || 24));
const ownSkillFile = cleanEnvValue(process.env.OWN_SKILL_FILE) || 'ownskill.md';
const soulUpdateHours = Math.max(1, Number(process.env.SOUL_UPDATE_HOURS || 24));

module.exports = {
  kimiProvider,
  kimiApiKey,
  kimiBaseUrl: cleanEnvValue(process.env.KIMI_BASE_URL) || defaultBaseUrl,
  kimiChatModel: normalizeModelForProvider(
    kimiProvider,
    cleanEnvValue(process.env.KIMI_CHAT_MODEL) || defaultChatModel
  ),
  kimiEmbedModel: cleanEnvValue(process.env.KIMI_EMBED_MODEL) || defaultEmbedModel,
  kimiUserAgent: cleanEnvValue(process.env.KIMI_USER_AGENT) || defaultUserAgent,
  kimiTimeoutMs: Number(process.env.KIMI_TIMEOUT_MS || 30000),
  embeddingsEnabled,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  allowShell: String(process.env.ALLOW_SHELL || 'false').toLowerCase() === 'true',
  allowSkillInstall: String(process.env.ALLOW_SKILL_INSTALL || 'false').toLowerCase() === 'true',
  dataDir: path.resolve(process.env.DATA_DIR || './data'),
  ownSkillPath: path.resolve(process.env.DATA_DIR || './data', ownSkillFile),
  ownSkillUpdateHours,
  soulPath: path.resolve(process.env.DATA_DIR || './data', 'soul.md'),
  soulUpdateHours,
  dbPath: path.resolve(process.env.DB_PATH || './db/agent.json'),
  maxMessages: Number(process.env.MAX_MESSAGES || 200),
  recentMessages: Number(process.env.RECENT_MESSAGES || 40)
};
