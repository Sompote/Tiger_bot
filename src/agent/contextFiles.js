const fs = require('fs');
const path = require('path');
const { dataDir } = require('../config');
const { ensureDir } = require('../utils');

const files = ['soul.md', 'human.md', 'human2.md'];

function ensureContextFiles() {
  ensureDir(dataDir);
  for (const name of files) {
    const full = path.join(dataDir, name);
    if (!fs.existsSync(full)) {
      fs.writeFileSync(full, `# ${name.replace('.md', '')}\n\n`, 'utf8');
    }
  }
}

function loadContextFiles() {
  ensureContextFiles();
  return files.map((name) => {
    const full = path.join(dataDir, name);
    const content = fs.readFileSync(full, 'utf8');
    return { name, full, content };
  });
}

module.exports = {
  ensureContextFiles,
  loadContextFiles
};
