const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');
const { decryptToString } = require('../scripts/cryptoEnv');

function loadDotenvIfPresent(p) {
  const full = path.resolve(process.cwd(), p);
  if (!fs.existsSync(full)) return;
  dotenv.config({ path: full, override: false });
}

function parseEnvText(text) {
  const out = {};
  const lines = String(text || '').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const k = trimmed.slice(0, idx).trim();
    let v = trimmed.slice(idx + 1).trim();
    // remove surrounding quotes
    v = v.replace(/^['"]|['"]$/g, '');
    if (k) out[k] = v;
  }
  return out;
}

function loadEncryptedSecretsIfPresent() {
  const encPath = process.env.SECRETS_FILE || '.env.secrets.enc';
  const passphrase = process.env.SECRETS_PASSPHRASE || '';
  const full = path.resolve(process.cwd(), encPath);
  if (!fs.existsSync(full)) return;
  if (!passphrase) return;
  const payload = JSON.parse(fs.readFileSync(full, 'utf8'));
  const plaintext = decryptToString(payload, passphrase);
  const kv = parseEnvText(plaintext);
  for (const [k, v] of Object.entries(kv)) {
    if (process.env[k] == null || process.env[k] === '') {
      process.env[k] = v;
    }
  }
}

// Load public config first, then local secrets, then encrypted secrets (optional).
loadDotenvIfPresent('.env');
loadDotenvIfPresent('.env.secrets');
loadEncryptedSecretsIfPresent();

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
const activeProvider = cleanEnvValue(process.env.ACTIVE_PROVIDER || '').toLowerCase();
// Missing API keys are allowed — providers with no key are silently skipped at request time.

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
const reflectionUpdateHours = Math.max(1, Number(process.env.REFLECTION_UPDATE_HOURS || 12));
const vectorDbPath = path.resolve(process.env.VECTOR_DB_PATH || './db/memory.sqlite');
const sqliteVecExtension = cleanEnvValue(process.env.SQLITE_VEC_EXTENSION || '');
const memoryIngestEveryTurns = Math.max(1, Number(process.env.MEMORY_INGEST_EVERY_TURNS || 2));
const memoryIngestMinChars = Math.max(20, Number(process.env.MEMORY_INGEST_MIN_CHARS || 140));
const swarmAgentTimeoutMs = Math.max(0, Number(process.env.SWARM_AGENT_TIMEOUT_MS || 0));
const swarmRouteOnProviderError =
  ['1', 'true', 'yes', 'on'].includes(cleanEnvValue(process.env.SWARM_ROUTE_ON_PROVIDER_ERROR || '').toLowerCase());
const swarmDefaultFlow = cleanEnvValue(process.env.SWARM_DEFAULT_FLOW || 'auto').toLowerCase() || 'auto';
const swarmFirstAgentPolicy = cleanEnvValue(process.env.SWARM_FIRST_AGENT_POLICY || 'auto').toLowerCase() || 'auto';
const swarmFirstAgent = cleanEnvValue(process.env.SWARM_FIRST_AGENT || '').toLowerCase();
const swarmStepMaxRetries = Math.max(0, Number(process.env.SWARM_STEP_MAX_RETRIES || 2));
const swarmContinueOnError =
  ['1', 'true', 'yes', 'on'].includes(cleanEnvValue(process.env.SWARM_CONTINUE_ON_ERROR || 'true').toLowerCase());

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
  reflectionUpdateHours,
  vectorDbPath,
  sqliteVecExtension,
  memoryIngestEveryTurns,
  memoryIngestMinChars,
  swarmAgentTimeoutMs,
  swarmRouteOnProviderError,
  swarmDefaultFlow,
  swarmFirstAgentPolicy,
  swarmFirstAgent,
  swarmStepMaxRetries,
  swarmContinueOnError,
  dbPath: path.resolve(process.env.DB_PATH || './db/agent.json'),
  maxMessages: Number(process.env.MAX_MESSAGES || 200),
  recentMessages: Number(process.env.RECENT_MESSAGES || 40)
};
