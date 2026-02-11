const fs = require('fs');
const path = require('path');
const { chatCompletion, embedText } = require('../kimiClient');
const { dataDir, embeddingsEnabled } = require('../config');
const { addMemory, getMeta, setMeta, getMessagesSince, getRecentMessagesAll } = require('./db');

const REFLECTION_META_KEY = 'memory_reflection_last_run_ts';
const MAX_MESSAGE_SCAN = 600;

function nowTs() {
  return Date.now();
}

function asIso(ts) {
  return new Date(ts).toISOString();
}

function parseJsonMaybe(content) {
  const text = String(content || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    // Continue with fenced JSON extraction fallback.
  }

  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (!fenced) return null;
  try {
    return JSON.parse(String(fenced[1] || '').trim());
  } catch (err) {
    return null;
  }
}

function normalizeItems(input, limit = 6) {
  if (!Array.isArray(input)) return [];
  return input
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .slice(0, limit);
}

function buildTranscript(rows) {
  return rows
    .map((m) => {
      const role = String(m.role || '').toUpperCase();
      const conv = String(m.conversation_id || 'unknown');
      const text = String(m.content || '').trim();
      return `[${conv}] ${role}: ${text}`;
    })
    .join('\n');
}

function ensureHeading(markdown, heading) {
  if (new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm').test(markdown)) {
    return markdown;
  }
  const suffix = markdown.endsWith('\n') ? '' : '\n';
  return `${markdown}${suffix}\n## ${heading}\n`;
}

function appendTimestampedBullets(filePath, heading, bullets, stamp) {
  if (!bullets.length) return;
  const full = path.resolve(filePath);
  const existing = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : `# ${path.basename(filePath, '.md')}\n\n`;
  const withHeading = ensureHeading(existing, heading);
  const lines = bullets.map((line) => `- [${stamp}] ${line}`).join('\n');
  const next = `${withHeading.trimEnd()}\n${lines}\n`;
  fs.writeFileSync(full, next, 'utf8');
}

function appendHuman2Update(filePath, payload, stampIso) {
  const full = path.resolve(filePath);
  const existing = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '# human2\n\n';
  const lines = [];
  if (payload.summary) lines.push(`- Summary: ${payload.summary}`);
  for (const p of payload.patternsObserved) lines.push(`- Pattern: ${p}`);
  for (const f of payload.failuresLessons) lines.push(`- Lesson: ${f}`);
  for (const w of payload.successfulWorkflows) lines.push(`- Workflow: ${w}`);
  if (!lines.length) return;
  const block = `\n## Update ${stampIso}\n${lines.join('\n')}\n`;
  fs.writeFileSync(full, `${existing.trimEnd()}\n${block}`, 'utf8');
}

async function generateReflection(rows, sinceIso, untilIso) {
  const transcript = buildTranscript(rows);
  const response = await chatCompletion([
    {
      role: 'system',
      content: [
        'You are a reflection agent that improves an assistant memory system.',
        'Return strict JSON with this schema only:',
        '{"summary":"","patterns_observed":[],"failures_lessons":[],"successful_workflows":[],"preference_updates":[],"what_to_do_differently":[]}',
        'Rules:',
        '- Keep each bullet short and factual.',
        '- If unknown, return empty arrays.',
        '- Do not include secrets.'
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        `Analyze conversation data between ${sinceIso} and ${untilIso}.`,
        'Extract actionable long-term memory updates.',
        transcript || '(empty)'
      ].join('\n\n')
    }
  ]);

  const parsed = parseJsonMaybe(response.content || '');
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  return {
    summary: String(parsed.summary || '').trim(),
    patternsObserved: normalizeItems(parsed.patterns_observed),
    failuresLessons: normalizeItems(parsed.failures_lessons),
    successfulWorkflows: normalizeItems(parsed.successful_workflows),
    preferenceUpdates: normalizeItems(parsed.preference_updates),
    whatToDoDifferently: normalizeItems(parsed.what_to_do_differently)
  };
}

async function maybeRunReflectionCycle({ force = false } = {}) {
  const startedAt = nowTs();
  const lastRunTs = Number(getMeta(REFLECTION_META_KEY, 0) || 0);
  const rows = lastRunTs
    ? getMessagesSince(lastRunTs, MAX_MESSAGE_SCAN)
    : getRecentMessagesAll(Math.min(MAX_MESSAGE_SCAN, 240));
  if (!rows.length && !force) {
    return { ok: true, skipped: true, reason: 'no_new_messages' };
  }

  const sinceIso = lastRunTs ? asIso(lastRunTs) : 'beginning';
  const untilIso = asIso(startedAt);
  const reflection = await generateReflection(rows, sinceIso, untilIso);
  if (!reflection) {
    return { ok: false, skipped: true, reason: 'invalid_reflection_json' };
  }

  const stampIso = asIso(startedAt);
  const stampDay = stampIso.slice(0, 10);
  const ownSkillPath = path.resolve(dataDir, 'ownskill.md');
  const humanPath = path.resolve(dataDir, 'human.md');
  const human2Path = path.resolve(dataDir, 'human2.md');
  const soulPath = path.resolve(dataDir, 'soul.md');

  appendTimestampedBullets(ownSkillPath, 'Patterns Observed', reflection.patternsObserved, stampDay);
  appendTimestampedBullets(ownSkillPath, 'Failures & Lessons', reflection.failuresLessons, stampDay);
  appendTimestampedBullets(ownSkillPath, 'Successful Workflows', reflection.successfulWorkflows, stampDay);

  appendTimestampedBullets(humanPath, 'Patterns Observed', reflection.patternsObserved, stampDay);
  appendTimestampedBullets(humanPath, 'Successful Workflows', reflection.successfulWorkflows, stampDay);

  appendTimestampedBullets(soulPath, 'Patterns Observed', reflection.patternsObserved, stampDay);
  appendTimestampedBullets(soulPath, 'Failures & Lessons', reflection.failuresLessons, stampDay);
  appendTimestampedBullets(soulPath, 'Successful Workflows', reflection.successfulWorkflows, stampDay);
  appendTimestampedBullets(soulPath, 'Adaptations', reflection.whatToDoDifferently, stampDay);

  appendHuman2Update(human2Path, reflection, stampIso);

  const memoryPayload = [
    reflection.summary ? `Summary: ${reflection.summary}` : '',
    ...reflection.patternsObserved.map((v) => `Pattern: ${v}`),
    ...reflection.failuresLessons.map((v) => `Lesson: ${v}`),
    ...reflection.successfulWorkflows.map((v) => `Workflow: ${v}`),
    ...reflection.preferenceUpdates.map((v) => `Preference: ${v}`),
    ...reflection.whatToDoDifferently.map((v) => `Adaptation: ${v}`)
  ]
    .filter(Boolean)
    .join('\n');

  if (memoryPayload) {
    let emb = [];
    if (embeddingsEnabled) {
      try {
        emb = await embedText(memoryPayload);
      } catch (err) {
        emb = [];
      }
    }
    addMemory('global', 'self_reflection', memoryPayload, emb);
  }

  setMeta(REFLECTION_META_KEY, startedAt);
  return { ok: true, skipped: false, at: stampIso };
}

module.exports = {
  maybeRunReflectionCycle
};
