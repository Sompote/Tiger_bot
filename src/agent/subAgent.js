const { chatCompletion } = require('../kimiClient');

async function runSubAgent(task, contextText) {
  const system = [
    'You are a focused sub-agent.',
    'Complete only the assigned task.',
    'Return concise findings, key facts, and action items.'
  ].join(' ');

  const message = [
    `Task: ${task}`,
    contextText ? `Context:\n${contextText}` : ''
  ]
    .filter(Boolean)
    .join('\n\n');

  const result = await chatCompletion([
    { role: 'system', content: system },
    { role: 'user', content: message }
  ]);

  return result.content || '';
}

async function runSubAgentBatch(tasks, contextText) {
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const out = await Promise.all(
    safeTasks.map(async (task) => {
      const answer = await runSubAgent(task, contextText);
      return { task, answer };
    })
  );
  return out;
}

module.exports = {
  runSubAgent,
  runSubAgentBatch
};
