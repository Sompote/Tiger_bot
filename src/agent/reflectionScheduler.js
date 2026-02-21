const { reflectionUpdateHours } = require('../config');
const { maybeRunReflectionCycle } = require('./reflectionAgent');

let intervalHandle = null;

function startReflectionScheduler() {
  if (intervalHandle) return;

  const everyMs = Math.max(1, Number(reflectionUpdateHours || 12)) * 60 * 60 * 1000;

  console.log(`[ReflectionScheduler] Starting with interval: ${reflectionUpdateHours || 12} hours (${everyMs}ms)`);

  // Kick one asynchronous check on startup.
  maybeRunReflectionCycle().catch((err) => {
    console.error('[ReflectionScheduler] Startup check failed:', err.message);
  });

  intervalHandle = setInterval(() => {
    console.log('[ReflectionScheduler] Running scheduled reflection cycle...');
    maybeRunReflectionCycle().catch((err) => {
      console.error('[ReflectionScheduler] Scheduled cycle failed:', err.message);
    });
  }, everyMs);
}

function stopReflectionScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log('[ReflectionScheduler] Stopped');
  }
}

module.exports = {
  startReflectionScheduler,
  stopReflectionScheduler
};
