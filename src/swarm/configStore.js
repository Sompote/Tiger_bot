'use strict';

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(process.env.TIGER_HOME || process.cwd());
const SWARM_DIR = path.join(ROOT_DIR, 'swarm');
const ARCHITECTURE_DIR = path.join(SWARM_DIR, 'architecture');
const TASK_STYLE_DIR = path.join(ROOT_DIR, 'tasks', 'styles');
const DEFAULT_ARCHITECTURE_FILE = 'tiger_parallel_design.yaml';
const DEFAULT_TASK_STYLE_FILE = 'default.yaml';

const DEFAULT_ARCHITECTURE_YAML = `version: 1
name: tiger_parallel_design
main_orchestrator: tiger
start_stage: design_parallel
agents:
  - id: designer_a
    runtime_agent: designer
    role: designer
  - id: designer_b
    runtime_agent: designer
    role: designer
  - id: designer_c
    runtime_agent: designer
    role: designer
  - id: reviewer
    runtime_agent: senior_eng
    role: reviewer
  - id: spec_writer
    runtime_agent: spec_writer
    role: spec_writer
stages:
  - id: design_parallel
    type: parallel
    roles:
      - designer_a
      - designer_b
      - designer_c
    store_as: design_candidates
    next: review_best
  - id: review_best
    type: judge
    role: reviewer
    candidates_from: design_candidates
    selected_role_key: selected_role
    feedback_key: reviewer_feedback
    pass_next: final_spec
    fail_next: revise_selected
  - id: revise_selected
    type: revise
    role_from_context: selected_role
    feedback_from_context: reviewer_feedback
    candidates_from: design_candidates
    next: review_best
  - id: final_spec
    type: final
    role: spec_writer
    source_from_context: design_candidates
    next: tiger_done
judgment_matrix:
  criteria:
    - name: objective_fit
      weight: 0.35
      description: How well the design satisfies the objective.
    - name: feasibility
      weight: 0.25
      description: Delivery realism and technical viability.
    - name: clarity
      weight: 0.2
      description: Readability and implementation clarity.
    - name: risk
      weight: 0.2
      description: Risk exposure and mitigation quality.
  pass_rule: reviewer_approval
`;

const DEFAULT_TASK_STYLE_YAML = `version: 1
name: default
architecture: tiger_parallel_design.yaml
flow: architecture
objective_prefix: "Objective:"
`;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeName(name) {
  const text = String(name || '').trim();
  if (!/^[a-zA-Z0-9._-]+\.ya?ml$/.test(text)) {
    throw new Error('File name must be a simple .yaml/.yml file name');
  }
  return text;
}

function stripComment(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return '';
  return line;
}

function parseScalar(text) {
  const value = String(text || '').trim();
  if (value === '') return '';
  if (/^".*"$/.test(value) || /^'.*'$/.test(value)) {
    return value.slice(1, -1);
  }
  if (/^\[(.*)\]$/.test(value)) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((x) => parseScalar(x.trim()));
  }
  if (/^(true|false)$/i.test(value)) return /^true$/i.test(value);
  if (/^null$/i.test(value)) return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function splitKeyValue(content) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    if (ch === '"' && !inSingle) inDouble = !inDouble;
    if (ch === ':' && !inSingle && !inDouble) {
      return {
        key: content.slice(0, i).trim(),
        rest: content.slice(i + 1).trim()
      };
    }
  }
  return null;
}

function parseYaml(text, label = 'yaml') {
  const lines = String(text || '').replace(/\t/g, '  ').split(/\r?\n/);
  const tokens = [];
  for (const raw of lines) {
    const line = stripComment(raw);
    if (!line.trim()) continue;
    const indent = line.match(/^\s*/)[0].length;
    tokens.push({ indent, content: line.trim() });
  }

  let idx = 0;

  function parseNode(indent) {
    if (idx >= tokens.length) return {};
    const token = tokens[idx];
    if (token.indent < indent) return {};
    if (token.content.startsWith('- ') && token.indent === indent) return parseSeq(indent);
    return parseMap(indent);
  }

  function parseMap(indent) {
    const out = {};
    while (idx < tokens.length) {
      const token = tokens[idx];
      if (token.indent < indent) break;
      if (token.indent > indent) {
        throw new Error(`Invalid indentation near "${token.content}" in ${label}`);
      }
      if (token.content.startsWith('- ')) break;
      const kv = splitKeyValue(token.content);
      if (!kv || !kv.key) throw new Error(`Invalid mapping line "${token.content}" in ${label}`);
      idx += 1;
      if (kv.rest === '') {
        if (idx < tokens.length && tokens[idx].indent > indent) {
          out[kv.key] = parseNode(tokens[idx].indent);
        } else {
          out[kv.key] = null;
        }
      } else {
        out[kv.key] = parseScalar(kv.rest);
      }
    }
    return out;
  }

  function parseSeq(indent) {
    const arr = [];
    while (idx < tokens.length) {
      const token = tokens[idx];
      if (token.indent < indent) break;
      if (token.indent !== indent || !token.content.startsWith('- ')) break;
      const rest = token.content.slice(2).trim();
      idx += 1;

      if (!rest) {
        if (idx < tokens.length && tokens[idx].indent > indent) {
          arr.push(parseNode(tokens[idx].indent));
        } else {
          arr.push(null);
        }
        continue;
      }

      const kv = splitKeyValue(rest);
      if (kv && kv.key) {
        const item = {};
        if (kv.rest === '') {
          if (idx < tokens.length && tokens[idx].indent > indent) {
            item[kv.key] = parseNode(tokens[idx].indent);
          } else {
            item[kv.key] = null;
          }
        } else {
          item[kv.key] = parseScalar(kv.rest);
        }
        if (idx < tokens.length && tokens[idx].indent > indent) {
          const extra = parseNode(tokens[idx].indent);
          if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
            Object.assign(item, extra);
          }
        }
        arr.push(item);
      } else {
        arr.push(parseScalar(rest));
      }
    }
    return arr;
  }

  if (!tokens.length) return {};
  return parseNode(tokens[0].indent);
}

function validateArchitectureObject(obj) {
  const data = obj && typeof obj === 'object' ? obj : {};
  const stages = Array.isArray(data.stages) ? data.stages : [];
  const agents = Array.isArray(data.agents) ? data.agents : [];
  if (!data.main_orchestrator) throw new Error('architecture.main_orchestrator is required');
  if (!stages.length) throw new Error('architecture.stages must contain at least one stage');
  if (!agents.length) throw new Error('architecture.agents must contain at least one agent');
  for (const stage of stages) {
    if (!stage || typeof stage !== 'object') throw new Error('Each stage must be an object');
    if (!stage.id || !stage.type) throw new Error('Each stage requires id and type');
    const type = String(stage.type).toLowerCase();
    if (type === 'judge' && (!stage.pass_next || !stage.fail_next)) {
      throw new Error(`judge stage "${stage.id}" requires pass_next and fail_next`);
    }
  }
}

function validateTaskStyleObject(obj) {
  const data = obj && typeof obj === 'object' ? obj : {};
  if (!data.architecture) throw new Error('task_style.architecture is required');
}

function ensureSwarmConfigLayout() {
  ensureDir(ARCHITECTURE_DIR);
  ensureDir(TASK_STYLE_DIR);
  const architecturePath = path.join(ARCHITECTURE_DIR, DEFAULT_ARCHITECTURE_FILE);
  if (!fs.existsSync(architecturePath)) {
    fs.writeFileSync(architecturePath, DEFAULT_ARCHITECTURE_YAML, 'utf8');
  }
  const taskStylePath = path.join(TASK_STYLE_DIR, DEFAULT_TASK_STYLE_FILE);
  if (!fs.existsSync(taskStylePath)) {
    fs.writeFileSync(taskStylePath, DEFAULT_TASK_STYLE_YAML, 'utf8');
  }
}

function listArchitectureFiles() {
  ensureSwarmConfigLayout();
  return fs
    .readdirSync(ARCHITECTURE_DIR)
    .filter((name) => /\.ya?ml$/i.test(name))
    .sort();
}

function listTaskStyleFiles() {
  ensureSwarmConfigLayout();
  return fs
    .readdirSync(TASK_STYLE_DIR)
    .filter((name) => /\.ya?ml$/i.test(name))
    .sort();
}

function readArchitectureText(name = DEFAULT_ARCHITECTURE_FILE) {
  ensureSwarmConfigLayout();
  const fileName = safeName(name);
  return fs.readFileSync(path.join(ARCHITECTURE_DIR, fileName), 'utf8');
}

function writeArchitectureText(name, text) {
  ensureSwarmConfigLayout();
  const fileName = safeName(name);
  const parsed = parseYaml(text, `architecture (${fileName})`);
  validateArchitectureObject(parsed);
  fs.writeFileSync(path.join(ARCHITECTURE_DIR, fileName), String(text || ''), 'utf8');
  return { fileName, parsed };
}

function readTaskStyleText(name = DEFAULT_TASK_STYLE_FILE) {
  ensureSwarmConfigLayout();
  const fileName = safeName(name);
  return fs.readFileSync(path.join(TASK_STYLE_DIR, fileName), 'utf8');
}

function writeTaskStyleText(name, text) {
  ensureSwarmConfigLayout();
  const fileName = safeName(name);
  const parsed = parseYaml(text, `task style (${fileName})`);
  validateTaskStyleObject(parsed);
  fs.writeFileSync(path.join(TASK_STYLE_DIR, fileName), String(text || ''), 'utf8');
  return { fileName, parsed };
}

function loadTaskStyle(name = DEFAULT_TASK_STYLE_FILE) {
  const text = readTaskStyleText(name);
  const parsed = parseYaml(text, `task style (${name})`);
  validateTaskStyleObject(parsed);
  return parsed;
}

function loadArchitecture(name = DEFAULT_ARCHITECTURE_FILE) {
  const text = readArchitectureText(name);
  const parsed = parseYaml(text, `architecture (${name})`);
  validateArchitectureObject(parsed);
  return parsed;
}

function updateDefaultStyleArchitecture(architectureFile) {
  const fileName = safeName(architectureFile);
  ensureSwarmConfigLayout();
  const stylePath = path.join(TASK_STYLE_DIR, DEFAULT_TASK_STYLE_FILE);
  const text = fs.readFileSync(stylePath, 'utf8');
  const lines = text.split(/\r?\n/);
  let replaced = false;
  const out = lines.map((line) => {
    if (/^\s*architecture\s*:/.test(line)) {
      replaced = true;
      return `architecture: ${fileName}`;
    }
    return line;
  });
  if (!replaced) out.push(`architecture: ${fileName}`);
  const next = out.join('\n').replace(/\n*$/, '\n');
  writeTaskStyleText(DEFAULT_TASK_STYLE_FILE, next);
  return loadTaskStyle(DEFAULT_TASK_STYLE_FILE);
}

module.exports = {
  ARCHITECTURE_DIR,
  TASK_STYLE_DIR,
  DEFAULT_ARCHITECTURE_FILE,
  DEFAULT_TASK_STYLE_FILE,
  ensureSwarmConfigLayout,
  listArchitectureFiles,
  listTaskStyleFiles,
  readArchitectureText,
  writeArchitectureText,
  readTaskStyleText,
  writeTaskStyleText,
  loadTaskStyle,
  loadArchitecture,
  updateDefaultStyleArchitecture
};
