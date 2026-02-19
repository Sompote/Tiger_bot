#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Source root (where cli.js lives) — always inside the npm package
const srcRoot = path.resolve(__dirname, '..', '..');
// Runtime root (where logs/pids go) — inside TIGER_HOME when installed globally
const runtimeDir = process.env.TIGER_HOME || process.cwd();
const logsDir = path.resolve(runtimeDir, 'logs');
const botLogPath = path.resolve(logsDir, 'telegram.out.log');
const supervisorPidPath = path.resolve(runtimeDir, 'tiger-telegram.pid');
const workerPidPath = path.resolve(runtimeDir, 'tiger-telegram-worker.pid');
const restartDelayMs = 5000;

let worker = null;
let stopping = false;

function appendLog(line) {
  fs.appendFileSync(botLogPath, `[${new Date().toISOString()}] ${line}\n`, 'utf8');
}

function writeBufferToLog(buffer) {
  fs.appendFileSync(botLogPath, buffer);
}

function startWorker() {
  if (stopping) return;

  const cliPath = path.resolve(srcRoot, 'src', 'cli.js');
  worker = spawn(process.execPath, [cliPath, '--telegram', '--worker'], {
    cwd: runtimeDir,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  fs.writeFileSync(workerPidPath, `${worker.pid}\n`, 'utf8');
  appendLog(`worker started (PID ${worker.pid})`);

  if (worker.stdout) {
    worker.stdout.on('data', writeBufferToLog);
  }
  if (worker.stderr) {
    worker.stderr.on('data', writeBufferToLog);
  }

  worker.on('exit', (code, signal) => {
    if (fs.existsSync(workerPidPath)) fs.unlinkSync(workerPidPath);
    if (stopping) return;
    appendLog(`worker exited (code=${code}, signal=${signal || 'none'}), restarting in 5s`);
    setTimeout(startWorker, restartDelayMs);
  });
}

function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  appendLog(`supervisor stopping (${signal})`);

  if (worker && worker.pid) {
    try {
      process.kill(worker.pid, 'SIGTERM');
    } catch (err) {
      // Worker may already be dead.
    }
  }

  if (fs.existsSync(workerPidPath)) fs.unlinkSync(workerPidPath);
  if (fs.existsSync(supervisorPidPath)) fs.unlinkSync(supervisorPidPath);
  process.exit(0);
}

function main() {
  fs.mkdirSync(logsDir, { recursive: true });
  fs.writeFileSync(supervisorPidPath, `${process.pid}\n`, 'utf8');
  appendLog(`supervisor started (PID ${process.pid})`);

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  startWorker();
}

main();
