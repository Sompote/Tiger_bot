'use strict';

const fs = require('fs');
const path = require('path');
const { chatCompletion } = require('../llmClient');
const {
  swarmAgentTimeoutMs,
  swarmRouteOnProviderError,
  swarmDefaultFlow,
  swarmFirstAgentPolicy,
  swarmFirstAgent,
  swarmStepMaxRetries,
  swarmContinueOnError
} = require('../config');
const {
  AGENTS_DIR,
  ensureSwarmLayout,
  createTask,
  listInProgressTasks,
  listTasks,
  findTask,
  saveTaskInPlace,
  appendThread,
  claimPendingTask,
  releaseTask,
  cancelTask,
  deleteTask
} = require('./taskBus');
const {
  ensureSwarmConfigLayout,
  loadTaskStyle,
  loadArchitecture
} = require('./configStore');

const AGENT_DEFS = {
  tiger: { label: 'Tiger', kind: 'orchestrator' },
  designer: { label: 'Designer', kind: 'worker' },
  senior_eng: { label: 'Senior Eng', kind: 'worker' },
  spec_writer: { label: 'Spec Writer', kind: 'worker' },
  scout: { label: 'Scout', kind: 'worker' },
  coder: { label: 'Coder', kind: 'worker' },
  critic: { label: 'Critic', kind: 'worker' }
};
const WORKER_AGENT_NAMES = Object.keys(AGENT_DEFS).filter((n) => n !== 'tiger');

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

function stageRef(id) {
  return `stage:${id}`;
}

function isStageRef(value) {
  return String(value || '').startsWith('stage:');
}

function stageIdFromRef(value) {
  return String(value || '').replace(/^stage:/, '').trim();
}

function getTaskContext(task) {
  if (!task.metadata || typeof task.metadata !== 'object') task.metadata = {};
  if (!task.metadata.swarm_ctx || typeof task.metadata.swarm_ctx !== 'object') {
    task.metadata.swarm_ctx = {};
  }
  return task.metadata.swarm_ctx;
}

function getRetryState(task) {
  if (!task.metadata || typeof task.metadata !== 'object') task.metadata = {};
  if (!task.metadata.retry_state || typeof task.metadata.retry_state !== 'object') {
    task.metadata.retry_state = {};
  }
  const state = task.metadata.retry_state;
  if (!state.workers || typeof state.workers !== 'object') state.workers = {};
  if (!state.stages || typeof state.stages !== 'object') state.stages = {};
  return state;
}

function markRetryAttempt(task, scope, key) {
  const state = getRetryState(task);
  const store = scope === 'stage' ? state.stages : state.workers;
  const k = String(key || '').trim();
  if (!k) return 1;
  store[k] = Number(store[k] || 0) + 1;
  return store[k];
}

function clearRetryAttempts(task, scope, key) {
  const state = getRetryState(task);
  const store = scope === 'stage' ? state.stages : state.workers;
  const k = String(key || '').trim();
  if (!k) return;
  delete store[k];
}

function resolveRoleMap(architecture) {
  const out = {};
  const agents = Array.isArray(architecture && architecture.agents) ? architecture.agents : [];
  for (const row of agents) {
    const id = String(row && row.id ? row.id : '').trim();
    if (!id) continue;
    out[id] = {
      id,
      runtimeAgent: String(row.runtime_agent || id).trim(),
      role: String(row.role || '').trim()
    };
  }
  return out;
}

function getStageById(architecture, id) {
  const stageId = String(id || '').trim();
  const stages = Array.isArray(architecture && architecture.stages) ? architecture.stages : [];
  return stages.find((s) => String(s && s.id ? s.id : '').trim() === stageId) || null;
}

function parseReviewerDecision(raw, fallbackRoleId) {
  const parsed = safeJsonParse(raw, null);
  if (parsed && typeof parsed === 'object') {
    return {
      approved: Boolean(parsed.approved),
      selectedRole: String(parsed.selected_role || fallbackRoleId || '').trim(),
      feedback: String(parsed.feedback || '').trim(),
      reasoning: String(parsed.reasoning || '').trim(),
      calculationReport: String(parsed.calculation_report || '').trim()
    };
  }
  return {
    approved: /approved\s*✅?|approve\b/i.test(raw) && !/reject/i.test(raw),
    selectedRole: String(fallbackRoleId || '').trim(),
    feedback: String(raw || '').trim(),
    reasoning: '',
    calculationReport: ''
  };
}

async function llmText(system, user, stepLabel) {
  // Step-level timeout: each LLM call gets its own fresh timer (hook reset)
  const stepTimeoutMs = Number(process.env.SWARM_AGENT_TIMEOUT_MS || swarmAgentTimeoutMs || 720000);
  const label = stepLabel || 'llmText';

  const llmCall = chatCompletion([
    { role: 'system', content: system },
    { role: 'user', content: user }
  ], {
    fallbackOnAnyProviderError: swarmRouteOnProviderError
  });

  // Fresh timeout per LLM step — resets on every hook call
  const out = await withTimeout(llmCall, stepTimeoutMs, `[step:${label}] LLM call`);
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
  const text = await llmText(system, user, 'designer:propose');
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
  const raw = await llmText(system, user, 'senior_eng:review');
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
  const spec = await llmText(system, user, 'spec_writer:write');
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
    [`Goal: ${task.goal}`, 'Thread:', renderThread(task)].join('\n\n'),
    `${agentName}:step`
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

async function runRoleStep(task, roleId, runtimeAgent, roleHint, promptLines, opts = {}) {
  const soul = getAgentSoul(runtimeAgent);
  const text = await llmText(
    [
      `You are ${roleId} in Tiger swarm (runtime agent: ${runtimeAgent}).`,
      roleHint,
      'Respond concisely and practically.',
      soul
    ].join('\n\n'),
    [
      `Goal: ${task.goal}`,
      'Thread:',
      renderThread(task),
      ...(Array.isArray(promptLines) ? promptLines : [])
    ].join('\n\n'),
    `${roleId}:step`
  );
  if (opts.appendThread !== false) {
    appendThread(task, roleId, text || `${roleId} completed step`);
  }
  return text || '';
}

async function runArchitectureStage(task, architecture, stage) {
  const roleMap = resolveRoleMap(architecture);
  const ctx = getTaskContext(task);
  const stageType = String(stage.type || '').toLowerCase();

  if (stageType === 'parallel') {
    const roles = Array.isArray(stage.roles) ? stage.roles.map((x) => String(x || '').trim()).filter(Boolean) : [];
    const roleRuns = await Promise.allSettled(roles.map(async (roleId) => {
      const role = roleMap[roleId] || { runtimeAgent: roleId };
      const text = await runRoleStep(
        task,
        roleId,
        role.runtimeAgent,
        'Create a concrete design candidate that fits the objective.',
        ['Return one complete proposal.'],
        { appendThread: false }
      );
      return { role: roleId, runtime_agent: role.runtimeAgent, text };
    }));
    const outputs = [];
    const failures = [];
    for (let i = 0; i < roleRuns.length; i += 1) {
      const roleId = roles[i];
      const outcome = roleRuns[i];
      if (outcome.status === 'fulfilled') {
        outputs.push(outcome.value);
      } else {
        failures.push({
          role: roleId,
          error: String(outcome.reason && outcome.reason.message ? outcome.reason.message : outcome.reason || 'unknown error')
        });
      }
    }

    for (const out of outputs) {
      appendThread(task, out.role, out.text || `${out.role} completed step`);
    }
    for (const fail of failures) {
      appendThread(task, fail.role, `error: ${fail.error}`);
    }

    const key = String(stage.store_as || `${stage.id}_outputs`).trim();
    ctx[key] = outputs;
    ctx[`${key}_errors`] = failures;
    const minSuccess = Math.max(1, Number(stage.min_success || 1));
    if (outputs.length < minSuccess) {
      throw new Error(
        `parallel stage "${stage.id}" produced ${outputs.length}/${roles.length} successful outputs (min_success=${minSuccess})`
      );
    }
    appendThread(task, 'tiger', `stage ${stage.id} completed with ${outputs.length} parallel outputs`);
    task.next_agent = stage.next ? stageRef(stage.next) : 'tiger';
    task.status = 'pending';
    return task;
  }

  if (stageType === 'judge') {
    const roleId = String(stage.role || '').trim();
    const role = roleMap[roleId] || { runtimeAgent: roleId };
    const candidateKey = String(stage.candidates_from || 'design_candidates').trim();
    const candidates = Array.isArray(ctx[candidateKey]) ? ctx[candidateKey] : [];
    const matrix = architecture && architecture.judgment_matrix ? architecture.judgment_matrix : {};
    const criteria = Array.isArray(matrix.criteria) ? matrix.criteria : [];
    const fallbackRole = candidates[0] && candidates[0].role ? candidates[0].role : '';

    const decisionRaw = await runRoleStep(
      task,
      roleId,
      role.runtimeAgent,
      'Evaluate candidates and select the best one using the judgment matrix. Build an explicit calculation report for the selected candidate.',
      [
        `Candidates JSON: ${JSON.stringify(candidates)}`,
        `Judgment matrix: ${JSON.stringify(criteria)}`,
        'Return strict JSON only: {"approved":true|false,"selected_role":"...","feedback":"...","reasoning":"...","calculation_report":"..."}'
      ]
    );
    const decision = parseReviewerDecision(decisionRaw, fallbackRole);
    const selectedKey = String(stage.selected_role_key || 'selected_role').trim();
    const feedbackKey = String(stage.feedback_key || 'reviewer_feedback').trim();
    const calculationReportKey = String(stage.calculation_report_key || '').trim();
    ctx[selectedKey] = decision.selectedRole || fallbackRole;
    ctx[feedbackKey] = decision.feedback || '';
    if (calculationReportKey) {
      ctx[calculationReportKey] = decision.calculationReport || '';
    }
    appendThread(
      task,
      roleId,
      `decision approved=${decision.approved} selected=${ctx[selectedKey]} feedback=${ctx[feedbackKey]}`
    );
    task.next_agent = stageRef(decision.approved ? stage.pass_next : stage.fail_next);
    task.status = 'pending';
    return task;
  }

  if (stageType === 'revise') {
    const roleKey = String(stage.role_from_context || 'selected_role').trim();
    const feedbackKey = String(stage.feedback_from_context || 'reviewer_feedback').trim();
    const candidateKey = String(stage.candidates_from || 'design_candidates').trim();
    const roleId = String(ctx[roleKey] || '').trim();
    const role = roleMap[roleId] || { runtimeAgent: roleId || 'designer' };
    const feedback = String(ctx[feedbackKey] || '').trim();
    const revised = await runRoleStep(
      task,
      roleId || 'designer',
      role.runtimeAgent,
      'Revise your selected proposal based on reviewer feedback.',
      [`Reviewer feedback: ${feedback}`]
    );

    if (Array.isArray(ctx[candidateKey])) {
      ctx[candidateKey] = ctx[candidateKey].map((c) => (
        c && c.role === roleId ? { ...c, text: revised } : c
      ));
    }
    const selectedRoleValue = String(ctx[roleKey] || '').trim();
    const keysToUpdate = Array.isArray(stage.update_context_keys_from_revised)
      ? stage.update_context_keys_from_revised.map((x) => String(x || '').trim()).filter(Boolean)
      : [];
    if (roleId && selectedRoleValue === roleId) {
      for (const key of keysToUpdate) {
        ctx[key] = revised;
      }
    }
    appendThread(task, 'tiger', `revision completed by ${roleId || 'designer'}`);
    task.next_agent = stage.next ? stageRef(stage.next) : 'tiger';
    task.status = 'pending';
    return task;
  }

  if (stageType === 'final') {
    const roleId = String(stage.role || '').trim();
    const role = roleMap[roleId] || { runtimeAgent: roleId };
    const sourceKey = String(stage.source_from_context || 'design_candidates').trim();
    const source = ctx[sourceKey];
    const outputSections = Array.isArray(stage.output_sections)
      ? stage.output_sections.map((x) => String(x || '').trim()).filter(Boolean)
      : [];
    const outputNotes = String(stage.output_notes || '').trim();
    const finalPromptLines = [`Source context JSON: ${JSON.stringify(source || null)}`];
    if (outputSections.length) {
      finalPromptLines.push(`Required output sections: ${outputSections.join(', ')}`);
    }
    if (outputNotes) {
      finalPromptLines.push(`Output requirements: ${outputNotes}`);
    }
    const finalText = await runRoleStep(
      task,
      roleId,
      role.runtimeAgent,
      'Write the final polished specification from the selected and revised design.',
      finalPromptLines
    );
    task.result = finalText;
    task.next_agent = 'tiger';
    task.status = 'pending';
    return task;
  }

  throw new Error(`Unsupported stage type: ${stage.type}`);
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

  // ✅ Hook-based timeout: each LLM step inside processWorkerTask resets its own timer
  // withTimeout is applied per-step inside llmText() — no outer wrap needed here
  let { task, filePath } = claim;
  try {
    task = await processWorkerTask(agentName, task);
    clearRetryAttempts(task, 'worker', agentName);
    const out = releaseTask(task, filePath, task.status === 'failed' ? 'failed' : 'pending');
    return { ok: true, idle: false, agent: agentName, task: out.task };
  } catch (err) {
    const errorMsg = String(err && err.message ? err.message : 'unknown error');
    appendThread(task, agentName, `error: ${errorMsg}`);
    const attempt = markRetryAttempt(task, 'worker', agentName);
    const maxRetries = Math.max(0, Number(process.env.SWARM_STEP_MAX_RETRIES || swarmStepMaxRetries || 0));

    if (attempt <= maxRetries) {
      task.status = 'pending';
      task.next_agent = agentName;
      appendThread(task, 'tiger', `retry scheduled for ${agentName} (${attempt}/${maxRetries})`);
      const out = releaseTask(task, filePath, 'pending');
      return {
        ok: true,
        idle: false,
        retrying: true,
        agent: agentName,
        error: errorMsg,
        task: out.task
      };
    }

    if (!task.metadata || typeof task.metadata !== 'object') task.metadata = {};
    task.metadata.last_failed_agent = agentName;
    task.metadata.last_error = errorMsg;

    if (swarmContinueOnError) {
      appendThread(task, 'tiger', `continuing after ${agentName} failure (retries exhausted)`);
      task.status = 'pending';
      task.next_agent = 'tiger';
      if (!task.result) {
        task.result = `Task completed with degraded path: ${agentName} failed after ${attempt - 1} retries. Last error: ${errorMsg}`;
      }
      const out = releaseTask(task, filePath, 'pending');
      return { ok: true, idle: false, degraded: true, agent: agentName, error: errorMsg, task: out.task };
    }

    task.status = 'failed';
    task.next_agent = 'tiger';
    const out = releaseTask(task, filePath, 'failed');
    return { ok: false, idle: false, agent: agentName, error: errorMsg, task: out.task };
  }
}

function pickFlowFirstAgent(flow) {
  return flow === 'research_build' ? 'scout' : 'designer';
}

function pickAutoFirstAgent(goal, flow) {
  const text = String(goal || '').toLowerCase();
  if (flow === 'research_build') return 'scout';
  if (/(research|investigate|compare|look up|search|verify|news|find out)/i.test(text)) return 'scout';
  if (/(bug|fix|error|exception|stack trace|refactor|implement|write code|code change|patch)/i.test(text)) return 'coder';
  if (/(review|audit|critique|risk check)/i.test(text)) return 'critic';
  if (/(spec|prd|requirements|design doc|document)/i.test(text)) return 'designer';
  return 'designer';
}

function resolveFirstAgent(goal, flow, opts = {}) {
  const policy = String(opts.firstAgentPolicy || swarmFirstAgentPolicy || 'auto').toLowerCase();
  const fixed = String(opts.firstAgent || swarmFirstAgent || '').toLowerCase();

  if (WORKER_AGENT_NAMES.includes(policy)) return policy;
  if (policy === 'fixed' && WORKER_AGENT_NAMES.includes(fixed)) return fixed;
  if (policy === 'flow') return pickFlowFirstAgent(flow);
  return pickAutoFirstAgent(goal, flow);
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
    const { task, filePath } = found;
    if (task.next_agent === 'tiger') {
      return { ok: true, task, readyForTiger: true };
    }
    if (task.status === 'failed') {
      return { ok: false, task, error: 'Task failed' };
    }

    const agentName = task.next_agent;
    if (isStageRef(agentName)) {
      const architectureFile = String(task.metadata && task.metadata.architecture_file ? task.metadata.architecture_file : '').trim();
      const architecture = loadArchitecture(architectureFile);
      const stageId = stageIdFromRef(agentName);
      const stage = getStageById(architecture, stageId);
      if (!stage) return { ok: false, task, error: `Unknown stage: ${stageId}` };
      if (onProgress) onProgress({ phase: 'worker_start', agent: stage.id, task });
      try {
        const updated = await runArchitectureStage(task, architecture, stage);
        clearRetryAttempts(updated, 'stage', stageId);
        saveTaskInPlace(filePath, updated);
        if (onProgress) onProgress({ phase: 'worker_done', agent: stage.id, task: updated, turn: { ok: true } });
      } catch (err) {
        const errorMsg = String(err && err.message ? err.message : 'unknown error');
        appendThread(task, 'tiger', `stage ${stageId} error: ${errorMsg}`);
        const attempt = markRetryAttempt(task, 'stage', stageId);
        const maxRetries = Math.max(0, Number(process.env.SWARM_STEP_MAX_RETRIES || swarmStepMaxRetries || 0));

        if (attempt <= maxRetries) {
          task.status = 'pending';
          task.next_agent = stageRef(stageId);
          appendThread(task, 'tiger', `retry scheduled for stage ${stageId} (${attempt}/${maxRetries})`);
          saveTaskInPlace(filePath, task);
          if (onProgress) {
            onProgress({
              phase: 'worker_done',
              agent: stage.id,
              task,
              turn: { ok: true, retrying: true, error: errorMsg }
            });
          }
          continue;
        }

        if (swarmContinueOnError) {
          const fallbackNext = stage.fail_next || stage.next || 'tiger';
          task.status = 'pending';
          task.next_agent = fallbackNext === 'tiger' ? 'tiger' : stageRef(fallbackNext);
          appendThread(task, 'tiger', `continuing after stage ${stageId} failure (retries exhausted)`);
          if (!task.result && task.next_agent === 'tiger') {
            task.result = `Task completed with degraded path: stage ${stageId} failed after ${attempt - 1} retries. Last error: ${errorMsg}`;
          }
          saveTaskInPlace(filePath, task);
          if (onProgress) {
            onProgress({
              phase: 'worker_done',
              agent: stage.id,
              task,
              turn: { ok: true, degraded: true, error: errorMsg }
            });
          }
          continue;
        }

        task.status = 'failed';
        task.next_agent = 'tiger';
        saveTaskInPlace(filePath, task);
        return { ok: false, task, error: errorMsg };
      }
      continue;
    }

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
  ensureSwarmConfigLayout();

  const requestedStyle = String(opts.taskStyle || process.env.SWARM_TASK_STYLE || 'default.yaml').trim();
  const taskStyle = loadTaskStyle(requestedStyle);
  const architectureFile = String(taskStyle.architecture || '').trim();
  const architecture = loadArchitecture(architectureFile);
  const stages = Array.isArray(architecture.stages) ? architecture.stages : [];
  const startStage = String(architecture.start_stage || (stages[0] && stages[0].id) || '').trim();
  const flow = String(opts.flow || taskStyle.flow || swarmDefaultFlow || 'architecture').toLowerCase();
  const objectivePrefix = String(taskStyle.objective_prefix || '').trim();
  const normalizedGoal = objectivePrefix ? `${objectivePrefix} ${String(goal || '').trim()}` : String(goal || '').trim();
  const firstAgent = startStage ? stageRef(startStage) : resolveFirstAgent(normalizedGoal, flow, opts);
  const task = createTask({
    from: 'tiger',
    goal: normalizedGoal,
    nextAgent: firstAgent,
    flow,
    metadata: {
      ...(opts.metadata || {}),
      first_agent_policy: String(opts.firstAgentPolicy || swarmFirstAgentPolicy || 'auto').toLowerCase(),
      first_agent: firstAgent,
      task_style_file: requestedStyle,
      architecture_file: architectureFile
    }
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
    const resumeAgent = isStageRef(task.next_agent) ? task.next_agent : inferResumeAgent(task);
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
