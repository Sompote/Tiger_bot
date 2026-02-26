'use strict';

const fs = require('fs');
const path = require('path');
const { chatCompletion } = require('../llmClient');
const { swarmAgentTimeoutMs, swarmRouteOnProviderError } = require('../config');
const {
  AGENTS_DIR,
  ensureSwarmLayout,
  createTask,
  listInProgressTasks,
  listTasks,
  findTask,
  appendThread,
  claimPendingTask,
  releaseTask,
  cancelTask,
  deleteTask
} = require('./taskBus');

const AGENT_DEFS = {
  tiger: { label: 'Tiger', kind: 'orchestrator' },
  designer: { label: 'Designer', kind: 'worker' },
  senior_eng: { label: 'Senior Eng', kind: 'worker' },
  spec_writer: { label: 'Spec Writer', kind: 'worker' },
  scout: { label: 'Scout', kind: 'worker' },
  coder: { label: 'Coder', kind: 'worker' },
  critic: { label: 'Critic', kind: 'worker' }
};

function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch (err) {
    return fallback;
  }
}

function getAgentSoul(agentName) {
  const full = path.join(AGENTS_DIR, agentName, 'soul.md');
  if (!fs.existsSync(full)) return '';
  try {
    return fs.readFileSync(full, 'utf8');
  } catch (err) {
    return '';
  }
}

function renderThread(task) {
  return (Array.isArray(task.thread) ? task.thread : [])
    .map((m) => `- [${m.at || ''}] ${m.by || 'unknown'}: ${m.msg || ''}`)
    .join('\n');
}

async function llmText(system, user) {
  const out = await chatCompletion([
    { role: 'system', content: system },
    { role: 'user', content: user }
  ], {
    fallbackOnAnyProviderError: swarmRouteOnProviderError
  });
  return String(out && out.content ? out.content : '').trim();
}

async function designerStep(task) {
  const soul = getAgentSoul('designer');
  const system = [
    'You are Designer in a multi-agent swarm.',
    'Propose or revise a solution.',
    'Be concrete. Mention architecture, flow, risks, and tradeoffs.',
    'Do not approve your own design.',
    soul
  ].join('\n\n');
  const user = [
    `Goal: ${task.goal}`,
    `Flow: ${task.flow || 'design'}`,
    'Task thread so far:',
    renderThread(task),
    'Return a revised design proposal for Senior Eng review.'
  ].join('\n\n');
  const text = await llmText(system, user);
  appendThread(task, 'designer', text || 'proposed initial design');
  task.next_agent = 'senior_eng';
  task.status = 'pending';
  return task;
}

async function seniorEngStep(task) {
  const soul = getAgentSoul('senior_eng');
  const system = [
    'You are Senior Engineer reviewer in a swarm.',
    'Review the latest proposed design critically.',
    'Return strict JSON only: {"approved":true|false,"feedback":"...","must_fix":["..."]}.',
    'If approving, feedback should summarize key safeguards.',
    soul
  ].join('\n\n');
  const user = [
    `Goal: ${task.goal}`,
    'Conversation thread:',
    renderThread(task)
  ].join('\n\n');
  const raw = await llmText(system, user);
  const parsed = safeJsonParse(raw, null);

  let approved = false;
  let feedback = raw || 'review completed';
  let mustFix = [];

  if (parsed && typeof parsed === 'object') {
    approved = Boolean(parsed.approved);
    feedback = String(parsed.feedback || feedback).trim();
    mustFix = Array.isArray(parsed.must_fix) ? parsed.must_fix.map((x) => String(x).trim()).filter(Boolean) : [];
  } else {
    approved = /approved\s*✅?|approve\b/i.test(raw) && !/reject/i.test(raw);
  }

  const msg = approved
    ? `approved ✅ ${feedback}`.trim()
    : `rejected - ${feedback}${mustFix.length ? ` | must_fix: ${mustFix.join('; ')}` : ''}`.trim();

  appendThread(task, 'senior_eng', msg);
  task.next_agent = approved ? 'spec_writer' : 'designer';
  task.status = 'pending';
  return task;
}

async function specWriterStep(task) {
  const soul = getAgentSoul('spec_writer');
  const system = [
    'You are Spec Writer in a swarm.',
    'Write a clear formal implementation/design spec from the approved discussion.',
    'Use structured markdown with scope, architecture, flow, edge cases, and next steps.',
    soul
  ].join('\n\n');
  const user = [
    `Goal: ${task.goal}`,
    'Thread:',
    renderThread(task),
    'Write the final spec now.'
  ].join('\n\n');
  const spec = await llmText(system, user);
  appendThread(task, 'spec_writer', 'formal spec written');
  task.result = spec || '(empty spec)';
  task.next_agent = 'tiger';
  task.status = 'pending';
  return task;
}

async function genericWorkerStep(task, agentName, roleHint) {
  const soul = getAgentSoul(agentName);
  const text = await llmText(
    [
      `You are ${agentName} in Tiger swarm.`,
      roleHint,
      'Respond concisely and practically.',
      soul
    ].join('\n\n'),
    [`Goal: ${task.goal}`, 'Thread:', renderThread(task)].join('\n\n')
  );
  appendThread(task, agentName, text || `${agentName} completed step`);
  task.status = 'pending';
  task.next_agent =
    agentName === 'scout' ? 'coder' :
    agentName === 'coder' ? 'critic' :
    agentName === 'critic' ? 'tiger' : 'tiger';
  if (agentName === 'critic') {
    task.result = text || task.result || '';
  }
  return task;
}

async function processWorkerTask(agentName, task) {
  if (agentName === 'designer') return designerStep(task);
  if (agentName === 'senior_eng') return seniorEngStep(task);
  if (agentName === 'spec_writer') return specWriterStep(task);
  if (agentName === 'scout') return genericWorkerStep(task, 'scout', 'Research and verify from multiple angles.');
  if (agentName === 'coder') return genericWorkerStep(task, 'coder', 'Propose implementation plan and code-level steps.');
  if (agentName === 'critic') return genericWorkerStep(task, 'critic', 'Review for defects, risks, and regressions.');
  throw new Error(`Unsupported worker: ${agentName}`);
}

function withTimeout(promise, timeoutMs, label) {
  const ms = Number(timeoutMs || 0);
  if (!Number.isFinite(ms) || ms <= 0) return promise;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function runWorkerTurn(agentName) {
  ensureSwarmLayout();
  const claim = claimPendingTask(agentName);
  if (!claim) return { ok: true, idle: true, agent: agentName };

  let { task, filePath } = claim;
  try {
    task = await withTimeout(
      processWorkerTask(agentName, task),
      swarmAgentTimeoutMs,
      `swarm agent ${agentName}`
    );
    const out = releaseTask(task, filePath, task.status === 'failed' ? 'failed' : 'pending');
    return { ok: true, idle: false, agent: agentName, task: out.task };
  } catch (err) {
    appendThread(task, agentName, `error: ${err.message}`);
    if (!task.metadata || typeof task.metadata !== 'object') task.metadata = {};
    task.metadata.last_failed_agent = agentName;
    task.metadata.last_error = String(err && err.message ? err.message : 'unknown error');
    task.status = 'failed';
    task.next_agent = 'tiger';
    const out = releaseTask(task, filePath, 'failed');
    return { ok: false, idle: false, agent: agentName, error: err.message, task: out.task };
  }
}

function pickFlowFirstAgent(flow) {
  return flow === 'research_build' ? 'scout' : 'designer';
}

function extractTigerResult(taskId) {
  const found = findTask(taskId);
  if (!found) return { ok: false, error: 'Task not found' };
  const { filePath, task, bucket } = found;
  if (task.next_agent !== 'tiger') {
    return { ok: false, error: `Task not ready for tiger (next_agent=${task.next_agent})`, task };
  }
  task.status = task.status === 'failed' ? 'failed' : 'done';
  const targetBucket = task.status === 'failed' ? 'failed' : 'done';
  const nextPath = path.join(path.dirname(filePath), '..', targetBucket, `${task.task_id}.json`);
  void nextPath; // path computation not used directly; move handled via releaseTask.
  const released = releaseTask(task, filePath, targetBucket);
  return { ok: true, task: released.task, bucketFrom: bucket, bucketTo: targetBucket };
}

async function runTaskToTiger(taskId, opts = {}) {
  const rawMaxTurns = Number(opts.maxTurns);
  const maxTurns = Number.isFinite(rawMaxTurns) && rawMaxTurns > 0 ? Math.floor(rawMaxTurns) : null;
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;

  for (let i = 0; maxTurns == null || i < maxTurns; i += 1) {
    const found = findTask(taskId);
    if (!found) return { ok: false, error: 'Task disappeared' };
    const { task } = found;
    if (task.next_agent === 'tiger') {
      return { ok: true, task, readyForTiger: true };
    }
    if (task.status === 'failed') {
      return { ok: false, task, error: 'Task failed' };
    }

    const agentName = task.next_agent;
    if (!AGENT_DEFS[agentName]) {
      return { ok: false, task, error: `Unknown next_agent: ${agentName}` };
    }

    if (onProgress) onProgress({ phase: 'worker_start', agent: agentName, task });
    const turn = await runWorkerTurn(agentName);
    const latest = findTask(taskId);
    if (onProgress && latest) {
      onProgress({ phase: 'worker_done', agent: agentName, task: latest.task, turn });
    }
    if (!turn.ok && !turn.idle) return { ok: false, task: turn.task, error: turn.error || 'Worker failed' };
  }

  const found = findTask(taskId);
  return { ok: false, error: `Exceeded max turns (${maxTurns})`, task: found ? found.task : null };
}

async function runTigerFlow(goal, opts = {}) {
  ensureSwarmLayout();
  const flow = opts.flow || 'design';
  const task = createTask({
    from: 'tiger',
    goal,
    nextAgent: pickFlowFirstAgent(flow),
    flow,
    metadata: opts.metadata || {}
  });

  if (typeof opts.onProgress === 'function') {
    opts.onProgress({ phase: 'task_created', task });
  }

  const progress = await runTaskToTiger(task.task_id, opts);
  if (!progress.ok) return progress;

  const final = extractTigerResult(task.task_id);
  if (!final.ok) return final;

  return { ok: true, task: final.task, result: final.task.result || '' };
}

function inferResumeAgent(task) {
  const meta = task && task.metadata && typeof task.metadata === 'object' ? task.metadata : {};
  const fromMeta = String(meta.last_failed_agent || '').trim();
  if (fromMeta && AGENT_DEFS[fromMeta] && fromMeta !== 'tiger') return fromMeta;

  const thread = Array.isArray(task && task.thread) ? task.thread : [];
  for (let i = thread.length - 1; i >= 0; i -= 1) {
    const m = thread[i] || {};
    const by = String(m.by || '').trim();
    const msg = String(m.msg || '').trim();
    if (by && by !== 'tiger' && AGENT_DEFS[by] && /^error:/i.test(msg)) return by;
  }

  const next = String(task && task.next_agent || '').trim();
  if (next && next !== 'tiger' && AGENT_DEFS[next]) return next;
  return pickFlowFirstAgent(task && task.flow);
}

async function continueTask(taskId, opts = {}) {
  ensureSwarmLayout();
  const found = findTask(taskId);
  if (!found) return { ok: false, error: 'Task not found' };

  let { task, filePath, bucket } = found;
  if (bucket === 'done') {
    return { ok: false, error: 'Task is already done', task };
  }

  if (bucket === 'failed') {
    const resumeAgent = inferResumeAgent(task);
    task.status = 'pending';
    task.next_agent = resumeAgent;
    appendThread(task, 'tiger', `resume requested: continue from ${resumeAgent}`);
    const released = releaseTask(task, filePath, 'pending');
    task = released.task;
    filePath = released.filePath;
    bucket = released.bucket;
    void filePath;
    void bucket;
  } else if (bucket === 'in_progress') {
    // Recovery path for stale stuck tasks.
    task.status = 'pending';
    appendThread(task, 'tiger', 'resume requested: moved stale in_progress task back to pending');
    const released = releaseTask(task, filePath, 'pending');
    task = released.task;
  }

  const progress = await runTaskToTiger(taskId, opts);
  if (!progress.ok) return progress;

  const final = extractTigerResult(taskId);
  if (!final.ok) return final;
  return { ok: true, task: final.task, result: final.task.result || '' };
}

async function askAgent(agentName, prompt) {
  ensureSwarmLayout();
  if (!AGENT_DEFS[agentName] || agentName === 'tiger') {
    throw new Error(`Unknown or unsupported /ask agent: ${agentName}`);
  }
  const soul = getAgentSoul(agentName);
  const system = [
    `You are ${agentName} in Tiger's internal swarm.`,
    'Answer as that role only.',
    'Be concise and practical.',
    soul
  ].join('\n\n');
  return llmText(system, String(prompt || '').trim());
}

function getAgentsStatus() {
  ensureSwarmLayout();
  return Object.keys(AGENT_DEFS).map((name) => {
    const dir = path.join(AGENTS_DIR, name);
    return {
      name,
      label: AGENT_DEFS[name].label,
      kind: AGENT_DEFS[name].kind,
      alive: fs.existsSync(dir),
      path: dir
    };
  });
}

function getStatusSummary() {
  ensureSwarmLayout();
  return {
    in_progress: listInProgressTasks(),
    pending: listTasks('pending'),
    done: listTasks('done'),
    failed: listTasks('failed')
  };
}

module.exports = {
  AGENT_DEFS,
  ensureSwarmLayout,
  runWorkerTurn,
  runTaskToTiger,
  runTigerFlow,
  continueTask,
  deleteTask,
  extractTigerResult,
  cancelTask,
  askAgent,
  getAgentsStatus,
  getStatusSummary
};
