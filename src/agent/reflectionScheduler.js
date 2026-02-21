const { soulUpdateHours } = require('../config');
const { maybeRunReflectionCycle } = require('./reflectionAgent');

let intervalHandle = null;

function startReflectionScheduler() {
  if (intervalHandle) return;

  // ใช้ soulUpdateHours (ค่าเริ่มต้น 24 ชั่วโมง) แทน reflectionUpdateHours (12 ชั่วโมง)
  const everyMs = Math.max(1, Number(soulUpdateHours || 24)) * 60 * 60 * 1000;

  console.log(`[ReflectionScheduler] Starting with interval: ${soulUpdateHours || 24} hours (${everyMs}ms)`);

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
