#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');
const os = require('os');
const { ensureContextFiles } = require('./agent/contextFiles');
const { startReflectionScheduler } = require('./agent/reflectionScheduler');
const { initVectorMemory } = require('./agent/db');
const { startTelegramBot } = require('./telegram/bot');
const { handleMessage } = require('./agent/mainAgent');
const { ensureSwarmLayout } = require('./swarm');

// Source root — always inside the npm package
const srcRoot = path.resolve(__dirname, '..');
// Runtime root — inside TIGER_HOME when installed globally, otherwise project root
const rootDir = process.env.TIGER_HOME || process.cwd();
const supervisorPidPath = path.resolve(rootDir, 'tiger-telegram.pid');
const workerHeartbeatPath = path.resolve(rootDir, 'tiger-telegram-worker.heartbeat');

process.on('unhandledRejection', (reason) => {
  const msg = reason && reason.stack ? reason.stack : String(reason);
  process.stderr.write(`[process] unhandledRejection: ${msg}\n`);
});

process.on('uncaughtException', (err) => {
  process.stderr.write(`[process] uncaughtException: ${err.stack || err.message}\n`);
});

function isTelegramMode(argv) {
  return argv.includes('--telegram');
}

function hasFlag(argv, flag) {
  return argv.includes(flag);
}

function writeWorkerHeartbeat() {
  try {
    fs.writeFileSync(workerHeartbeatPath, `${Date.now()}\n`, 'utf8');
  } catch (err) {
    // Heartbeat is best-effort and must not crash the worker.
  }
}

function isPidRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return false;
  }
}

function getExistingSupervisorPid() {
  if (!fs.existsSync(supervisorPidPath)) return null;
  const pid = Number(fs.readFileSync(supervisorPidPath, 'utf8').trim());
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function startTelegramInBackground() {
  ensureContextFiles();
  ensureSwarmLayout();
  const existingPid = getExistingSupervisorPid();
  if (existingPid && isPidRunning(existingPid)) {
    process.stdout.write(`Telegram background bot is already running (PID ${existingPid}).\n`);
    return;
  }

  fs.mkdirSync(path.resolve(rootDir, 'logs'), { recursive: true });
  const supervisorLogPath = path.resolve(rootDir, 'logs', 'telegram-supervisor.log');
  const logFd = fs.openSync(supervisorLogPath, 'a');
  const supervisorScript = path.resolve(srcRoot, 'src', 'telegram', 'supervisor.js');
  const child = spawn(process.execPath, [supervisorScript], {
    cwd: rootDir,
    env: process.env,
    detached: true,
    stdio: ['ignore', logFd, logFd]
  });
  child.unref();
  fs.closeSync(logFd);

  fs.writeFileSync(supervisorPidPath, `${child.pid}\n`, 'utf8');
  process.stdout.write(`Telegram background bot started (supervisor PID ${child.pid}).\n`);
}

function stopTelegramBackground() {
  const pid = getExistingSupervisorPid();
  if (!pid || !isPidRunning(pid)) {
    if (fs.existsSync(supervisorPidPath)) fs.unlinkSync(supervisorPidPath);
    process.stdout.write('Telegram background bot is not running.\n');
    return;
  }

  process.kill(pid, 'SIGTERM');
  fs.unlinkSync(supervisorPidPath);
  const workerPidPath = path.resolve(rootDir, 'tiger-telegram-worker.pid');
  const workerHeartbeatPath = path.resolve(rootDir, 'tiger-telegram-worker.heartbeat');
  if (fs.existsSync(workerPidPath)) fs.unlinkSync(workerPidPath);
  if (fs.existsSync(workerHeartbeatPath)) fs.unlinkSync(workerHeartbeatPath);
  process.stdout.write(`Stopped Telegram background bot (supervisor PID ${pid}).\n`);
}

function printVectorMemoryStatus(vectorStatus) {
  if (vectorStatus.ok) {
    const vecMode = vectorStatus.sqliteVecLoaded ? 'enabled' : 'not loaded';
    const count = Number(vectorStatus?.counts?.memories || 0);
    process.stdout.write(
      `Vector memory: sqlite (${vectorStatus.dbPath}) | sqlite-vec: ${vecMode} | memories: ${count}\n`
    );
    if (String(vectorStatus.dbPath || '').startsWith(`${os.tmpdir()}${path.sep}`)) {
      process.stdout.write(
        'Warning: VECTOR_DB_PATH is under /tmp and may be wiped after restart. Use ./db/memory.sqlite for persistence.\n'
      );
    }
    if (!vectorStatus.sqliteVecLoaded) {
      process.stdout.write(
        'Info: sqlite-vec not loaded. Semantic recall still works using cosine fallback.\n'
      );
    }
    return;
  }
  process.stdout.write(`Vector memory: json fallback (${vectorStatus.dbPath})\n`);
}

async function runCli() {
  ensureContextFiles();
  ensureSwarmLayout();
  startReflectionScheduler();
  const vectorStatus = initVectorMemory();
  printVectorMemoryStatus(vectorStatus);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'you> '
  });

  const userId = 'local-user';
  process.stdout.write('Tiger agent ready. Type /exit to quit.\n');
  rl.prompt();

  rl.on('line', async (line) => {
    const text = String(line || '').trim();
    if (!text) {
      rl.prompt();
      return;
    }
    if (text === '/exit' || text === '/quit') {
      rl.close();
      return;
    }

    try {
      const reply = await handleMessage({
        platform: 'cli',
        userId,
        text
      });
      process.stdout.write(`tiger> ${reply}\n`);
    } catch (err) {
      process.stdout.write(`error> ${err.message}\n`);
    }
    rl.prompt();
  });

  rl.on('close', () => {
    process.stdout.write('bye\n');
    process.exit(0);
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const isWorkerProcess = hasFlag(argv, '--worker');
  if (hasFlag(argv, '--telegram-stop')) {
    stopTelegramBackground();
    return;
  }

  if (isTelegramMode(argv) && hasFlag(argv, '--background')) {
    startTelegramInBackground();
    return;
  }

  if (isTelegramMode(argv)) {
    ensureContextFiles();
    ensureSwarmLayout();
    startReflectionScheduler();
    const vectorStatus = initVectorMemory();
    printVectorMemoryStatus(vectorStatus);
    if (isWorkerProcess) {
      // NanoClaw-style heartbeat: worker emits liveness every minute.
      writeWorkerHeartbeat();
      setInterval(writeWorkerHeartbeat, 60 * 1000);
    }
    startTelegramBot();
    process.stdout.write('Telegram bot started.\n');
    return;
  }
  await runCli();
}

main().catch((err) => {
  process.stderr.write(`${err.stack || err.message}\n`);
  process.exit(1);
});
