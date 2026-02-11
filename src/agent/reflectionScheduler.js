const { reflectionUpdateHours } = require('../config');
const { maybeRunReflectionCycle } = require('./reflectionAgent');

let intervalHandle = null;

function startReflectionScheduler() {
  if (intervalHandle) return;

  const everyMs = Math.max(1, Number(reflectionUpdateHours || 12)) * 60 * 60 * 1000;

  // Kick one asynchronous check on startup.
  maybeRunReflectionCycle().catch(() => {});

  intervalHandle = setInterval(() => {
    maybeRunReflectionCycle().catch(() => {});
  }, everyMs);
}

module.exports = {
  startReflectionScheduler
};
