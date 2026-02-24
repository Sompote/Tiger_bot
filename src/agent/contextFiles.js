const fs = require('fs');
const path = require('path');
const { dataDir } = require('../config');
const { ensureDir } = require('../utils');
const { writeContextFile, syncLegacyRootMirror } = require('./contextFileMirrors');

const files = ['soul.md', 'human.md', 'human2.md', 'ownskill.md'];

function ensureContextFiles() {
  ensureDir(dataDir);
  for (const name of files) {
    const full = path.join(dataDir, name);
    if (!fs.existsSync(full)) {
      writeContextFile(full, `# ${name.replace('.md', '')}\n\n`);
      continue;
    }
    syncLegacyRootMirror(full);
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
