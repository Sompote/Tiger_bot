const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const { allowShell } = require('../config');
const { listSkills, loadSkill, clawhubSearch, clawhubInstall } = require('./skills');
const { runSubAgentBatch } = require('./subAgent');

const execAsync = promisify(exec);
const rootDir = process.env.TIGER_HOME || process.cwd();
const skillsDir = path.resolve(rootDir, 'skills');

function toAbsolutePath(inputPath) {
  return path.resolve(String(inputPath || '.'));
}

function listFiles(args = {}) {
  const target = toAbsolutePath(args.path || '.');
  const recursive = Boolean(args.recursive);
  const limit = Number(args.limit || 200);
  const out = [];

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      out.push({
        path: full,
        type: entry.isDirectory() ? 'dir' : 'file'
      });
      if (out.length >= limit) return;
      if (recursive && entry.isDirectory()) {
        walk(full);
        if (out.length >= limit) return;
      }
    }
  }

  walk(target);
  return { root: target, items: out, truncated: out.length >= limit };
}

function readFile(args = {}) {
  const target = toAbsolutePath(args.path);
  const maxChars = Number(args.max_chars || 16000);
  const content = fs.readFileSync(target, 'utf8');
  return {
    path: target,
    content: content.slice(0, maxChars),
    truncated: content.length > maxChars
  };
}

function writeFile(args = {}) {
  const target = toAbsolutePath(args.path);
  const append = Boolean(args.append);
  const content = String(args.content || '');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (append) {
    fs.appendFileSync(target, content, 'utf8');
  } else {
    fs.writeFileSync(target, content, 'utf8');
  }
  return { path: target, bytes: Buffer.byteLength(content, 'utf8'), append };
}

async function runShell(args = {}) {
  if (!allowShell) {
    return { ok: false, error: 'Shell tool disabled. Set ALLOW_SHELL=true to enable.' };
  }
  const command = String(args.command || '').trim();
  if (!command) {
    return { ok: false, error: 'Missing command.' };
  }
  const cwd = toAbsolutePath(args.cwd || process.cwd());
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: Number(args.timeout_ms || 15000),
      maxBuffer: 1024 * 1024
    });
    return { ok: true, cwd, stdout, stderr };
  } catch (err) {
    return {
      ok: false,
      cwd,
      error: err.message,
      stdout: err.stdout || '',
      stderr: err.stderr || ''
    };
  }
}

async function runSubAgentsTool(args = {}) {
  const tasks = Array.isArray(args.tasks) ? args.tasks.map(String) : [];
  const context = String(args.context || '');
  const results = await runSubAgentBatch(tasks, context);
  return { count: results.length, results };
}

function listSkillsTool() {
  const skills = listSkills(skillsDir);
  return { skills, skills_dir: skillsDir };
}

function loadSkillTool(args = {}) {
  const skill = String(args.skill || '').trim();
  if (!skill) return { ok: false, error: 'Missing skill name.' };
  const content = loadSkill(skillsDir, skill);
  return { ok: true, skill, content };
}

async function clawhubSearchTool(args = {}) {
  return clawhubSearch({
    query: args.query,
    limit: args.limit,
    workdir: args.workdir || rootDir,
    dir: args.dir || 'skills',
    timeout_ms: args.timeout_ms
  });
}

async function clawhubInstallTool(args = {}) {
  return clawhubInstall({
    slug: args.slug,
    version: args.version,
    force: args.force,
    workdir: args.workdir || rootDir,
    dir: args.dir || 'skills',
    timeout_ms: args.timeout_ms
  });
}

const tools = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files/directories from a path. Supports recursive mode.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          recursive: { type: 'boolean' },
          limit: { type: 'integer' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read text file content from disk.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          max_chars: { type: 'integer' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write or append text content to a file on disk.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
          append: { type: 'boolean' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_shell',
      description: 'Execute shell command on the computer if enabled by ALLOW_SHELL=true.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string' },
          cwd: { type: 'string' },
          timeout_ms: { type: 'integer' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_skills',
      description: 'List available local skills.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'load_skill',
      description: 'Load full SKILL.md content for a specific local skill.',
      parameters: {
        type: 'object',
        properties: {
          skill: { type: 'string' }
        },
        required: ['skill']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'clawhub_search',
      description: 'Search ClawHub skills using the clawhub CLI.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'integer' },
          workdir: { type: 'string' },
          dir: { type: 'string' },
          timeout_ms: { type: 'integer' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'clawhub_install',
      description: 'Install a ClawHub skill by slug into the local skills directory.',
      parameters: {
        type: 'object',
        properties: {
          slug: { type: 'string' },
          version: { type: 'string' },
          force: { type: 'boolean' },
          workdir: { type: 'string' },
          dir: { type: 'string' },
          timeout_ms: { type: 'integer' }
        },
        required: ['slug']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_sub_agents',
      description: 'Run multiple focused sub-agents and return all outputs for orchestration.',
      parameters: {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            items: { type: 'string' }
          },
          context: { type: 'string' }
        },
        required: ['tasks']
      }
    }
  }
];

async function callTool(name, args) {
  if (name === 'list_files') return listFiles(args);
  if (name === 'read_file') return readFile(args);
  if (name === 'write_file') return writeFile(args);
  if (name === 'run_shell') return runShell(args);
  if (name === 'list_skills') return listSkillsTool();
  if (name === 'load_skill') return loadSkillTool(args);
  if (name === 'clawhub_search') return clawhubSearchTool(args);
  if (name === 'clawhub_install') return clawhubInstallTool(args);
  if (name === 'run_sub_agents') return runSubAgentsTool(args);
  return { ok: false, error: `Unknown tool: ${name}` };
}

module.exports = {
  tools,
  callTool
};
