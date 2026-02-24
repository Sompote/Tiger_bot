const fs = require('fs');
const path = require('path');

function getLegacyRootMirrorPath(filePath) {
  const canonical = path.resolve(filePath);
  const candidate = path.resolve(process.cwd(), path.basename(canonical));

  if (candidate === canonical) return null;
  if (!fs.existsSync(candidate)) return null;

  return candidate;
}

function syncLegacyRootMirror(filePath) {
  const canonical = path.resolve(filePath);
  const legacy = getLegacyRootMirrorPath(canonical);
  if (!legacy) return;

  const content = fs.readFileSync(canonical, 'utf8');
  fs.writeFileSync(legacy, content, 'utf8');
}

function writeContextFile(filePath, content) {
  const canonical = path.resolve(filePath);
  fs.writeFileSync(canonical, content, 'utf8');
  syncLegacyRootMirror(canonical);
}

function appendContextFile(filePath, content) {
  const canonical = path.resolve(filePath);
  fs.appendFileSync(canonical, content, 'utf8');
  syncLegacyRootMirror(canonical);
}

module.exports = {
  writeContextFile,
  appendContextFile,
  syncLegacyRootMirror
};
