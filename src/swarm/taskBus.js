'use strict';

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(process.env.TIGER_HOME || process.cwd());
const TASKS_DIR = path.join(ROOT_DIR, 'tasks');
const AGENTS_DIR = path.join(ROOT_DIR, 'agents');

const TASK_BUCKETS = ['pending', 'in_progress', 'done', 'failed'];
const DEFAULT_AGENT_DIRS = [
  'tiger',
  'designer',
  'designer_a',
  'designer_b',
  'designer_c',
  'senior_eng',
  'spec_writer',
  'scout',
  'coder',
  'critic'
];

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJsonAtomic(filePath, value) {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function safeReadJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function defaultAgentFileContent(agentName, fileName) {
  if (fileName === 'soul.md') {
    return `# ${agentName}\n\n## Identity\n${agentName} worker for Tiger swarm.\n`;
  }
  if (fileName === 'ownskill.md') {
    return `# ownskill\n\n- Role: ${agentName}\n`;
  }
  if (fileName === 'memory.md') {
    return `# memory\n\n`;
  }
  if (fileName === 'human.md' && agentName === 'tiger') {
    return '# human\n\n';
  }
  if (fileName === 'experience.json') {
    return JSON.stringify(
      {
        total_tasks: 0,
        success_rate: 0,
        lessons: [],
        collaboration: {}
      },
      null,
      2
    ) + '\n';
  }
  return '';
}

function ensureAgentFolder(agentName) {
  const dir = path.join(AGENTS_DIR, agentName);
  ensureDir(dir);
  const baseFiles = ['soul.md', 'ownskill.md', 'experience.json', 'memory.md'];
  if (agentName === 'tiger') baseFiles.push('human.md');
  for (const fileName of baseFiles) {
    const full = path.join(dir, fileName);
    if (!fs.existsSync(full)) {
      fs.writeFileSync(full, defaultAgentFileContent(agentName, fileName), 'utf8');
    }
  }
}

function ensureSwarmLayout() {
  ensureDir(TASKS_DIR);
  ensureDir(AGENTS_DIR);
  for (const bucket of TASK_BUCKETS) ensureDir(path.join(TASKS_DIR, bucket));
  for (const agentName of DEFAULT_AGENT_DIRS) ensureAgentFolder(agentName);
}

function taskFilePath(bucket, taskId) {
  return path.join(TASKS_DIR, bucket, `${taskId}.json`);
}

function makeTaskId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `task_${ts}_${rand}`;
}

function formatThreadMsg(by, msg, at = nowIso()) {
  return { by, at, msg: String(msg || '').trim() };
}

function createTask({ from = 'tiger', goal, nextAgent = 'designer', flow = 'design', metadata = {} }) {
  ensureSwarmLayout();
  const task = {
    task_id: makeTaskId(),
    created_at: nowIso(),
    status: 'pending',
    from,
    goal: String(goal || '').trim(),
    flow,
    next_agent: nextAgent,
    thread: [],
    result: null,
    metadata
  };
  task.thread.push(formatThreadMsg(from, `task created: ${task.goal}`));
  writeJsonAtomic(taskFilePath('pending', task.task_id), task);
  return task;
}

function listTaskFiles(bucket) {
  ensureSwarmLayout();
  const dir = path.join(TASKS_DIR, bucket);
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => path.join(dir, name));
}

function readTaskAt(filePath) {
  const task = safeReadJson(filePath);
  return { task, filePath };
}

function listTasks(bucket) {
  return listTaskFiles(bucket).map((filePath) => readTaskAt(filePath).task);
}

function findTask(taskId) {
  for (const bucket of TASK_BUCKETS) {
    const filePath = taskFilePath(bucket, taskId);
    if (fs.existsSync(filePath)) {
      const task = safeReadJson(filePath);
      return { bucket, filePath, task };
    }
  }
  return null;
}

function saveTaskInPlace(filePath, task) {
  writeJsonAtomic(filePath, task);
}

function moveTaskFile(filePath, targetBucket, task) {
  const nextPath = taskFilePath(targetBucket, task.task_id);
  writeJsonAtomic(nextPath, task);
  if (path.resolve(nextPath) !== path.resolve(filePath) && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  return nextPath;
}

function appendThread(task, by, msg) {
  if (!Array.isArray(task.thread)) task.thread = [];
  const text = String(msg || '').trim();
  if (!text) return task;
  task.thread.push(formatThreadMsg(by, text));
  return task;
}

function claimPendingTask(agentName) {
  const candidates = listTaskFiles('pending');
  for (const filePath of candidates) {
    const task = safeReadJson(filePath);
    if (task.next_agent !== agentName) continue;
    task.status = 'in_progress';
    const nextPath = moveTaskFile(filePath, 'in_progress', task);
    return { task, filePath: nextPath, bucket: 'in_progress' };
  }
  return null;
}

function releaseTask(task, filePath, bucket) {
  const targetBucket = bucket || task.status || 'pending';
  const nextPath = moveTaskFile(filePath, targetBucket, task);
  return { task, filePath: nextPath, bucket: targetBucket };
}

function cancelTask(taskId, by = 'tiger') {
  const found = findTask(taskId);
  if (!found) return { ok: false, error: 'Task not found' };
  const { filePath, task } = found;
  task.status = 'failed';
  appendThread(task, by, 'task cancelled');
  moveTaskFile(filePath, 'failed', task);
  return { ok: true, task };
}

function deleteTask(taskId) {
  const found = findTask(taskId);
  if (!found) return { ok: false, error: 'Task not found' };
  const { filePath, task, bucket } = found;
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  return { ok: true, task, bucket };
}

function listInProgressTasks() {
  return listTasks('in_progress');
}

function listAgentFolders() {
  ensureSwarmLayout();
  return fs
    .readdirSync(AGENTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

module.exports = {
  ROOT_DIR,
  TASKS_DIR,
  AGENTS_DIR,
  TASK_BUCKETS,
  ensureSwarmLayout,
  ensureAgentFolder,
  createTask,
  listTasks,
  listInProgressTasks,
  findTask,
  saveTaskInPlace,
  moveTaskFile,
  appendThread,
  claimPendingTask,
  releaseTask,
  cancelTask,
  deleteTask,
  listAgentFolders,
  nowIso
};
