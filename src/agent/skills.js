const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const localClawhubBin = path.resolve(process.cwd(), 'node_modules', '.bin', 'clawhub');

function listSkills(baseDir) {
  if (!fs.existsSync(baseDir)) return [];
  return fs
    .readdirSync(baseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

function loadSkill(baseDir, skillName) {
  const skillDir = path.join(baseDir, skillName);
  const skillFile = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillFile)) {
    throw new Error(`Skill not found: ${skillName}`);
  }
  return fs.readFileSync(skillFile, 'utf8');
}

function isValidSlug(slug) {
  return /^[a-z0-9][a-z0-9-]*$/.test(String(slug || ''));
}

async function ensureClawhubCli() {
  const candidates = ['clawhub'];
  if (fs.existsSync(localClawhubBin)) {
    candidates.unshift(localClawhubBin);
  }

  for (const bin of candidates) {
    try {
      const { stdout, stderr } = await execFileAsync(bin, ['--cli-version'], {
        timeout: 10000,
        maxBuffer: 256 * 1024
      });
      return { ok: true, bin, version: String(stdout || stderr || '').trim() };
    } catch (err) {
      // try next candidate
    }
  }

  return {
    ok: false,
    error:
      'clawhub CLI is not available. Install it with: npm i -g clawhub or npm i clawhub in this project.'
  };
}

async function runClawhub(argv, opts = {}) {
  const cli = await ensureClawhubCli();
  if (!cli.ok) return cli;
  try {
    const { stdout, stderr } = await execFileAsync(cli.bin, argv, {
      timeout: Number(opts.timeout || 30000),
      maxBuffer: Number(opts.maxBuffer || 1024 * 1024)
    });
    return {
      ok: true,
      bin: cli.bin,
      version: cli.version,
      stdout: String(stdout || '').trim(),
      stderr: String(stderr || '').trim()
    };
  } catch (err) {
    return {
      ok: false,
      bin: cli.bin,
      version: cli.version,
      error: err.message,
      stdout: String(err.stdout || '').trim(),
      stderr: String(err.stderr || '').trim()
    };
  }
}

async function clawhubSearch(args = {}) {
  const query = String(args.query || '').trim();
  if (!query) return { ok: false, error: 'Missing query.' };

  const limit = Math.max(1, Math.min(50, Number(args.limit || 10)));
  const workdir = path.resolve(String(args.workdir || process.cwd()));
  const dir = String(args.dir || 'skills').trim() || 'skills';

  const argv = ['search', query, '--limit', String(limit), '--no-input', '--workdir', workdir, '--dir', dir];
  const res = await runClawhub(argv, {
    timeout: Number(args.timeout_ms || 30000),
    maxBuffer: 1024 * 1024
  });
  if (res.ok) {
    return {
      ok: true,
      bin: res.bin,
      query,
      limit,
      workdir,
      dir,
      output: res.stdout,
      warning: res.stderr
    };
  }
  return {
    ok: false,
    bin: res.bin,
    query,
    workdir,
    dir,
    error: res.error,
    output: res.stdout || '',
    warning: res.stderr || ''
  };
}

async function clawhubInstall(args = {}) {
  const slug = String(args.slug || '').trim();
  if (!slug) return { ok: false, error: 'Missing slug.' };
  if (!isValidSlug(slug)) {
    return { ok: false, error: 'Invalid slug format. Use lowercase letters, numbers, and hyphens only.' };
  }

  const workdir = path.resolve(String(args.workdir || process.cwd()));
  const dir = String(args.dir || 'skills').trim() || 'skills';
  const version = String(args.version || '').trim();
  const force = Boolean(args.force);

  const argv = ['install', slug, '--no-input', '--workdir', workdir, '--dir', dir];
  if (version) argv.push('--version', version);
  if (force) argv.push('--force');

  const res = await runClawhub(argv, {
    timeout: Number(args.timeout_ms || 120000),
    maxBuffer: 1024 * 1024
  });
  if (res.ok) {
    const skillPath = path.join(workdir, dir, slug, 'SKILL.md');
    return {
      ok: true,
      bin: res.bin,
      slug,
      version: version || 'latest',
      installed_path: skillPath,
      skill_exists: fs.existsSync(skillPath),
      output: res.stdout,
      warning: res.stderr
    };
  }
  return {
    ok: false,
    bin: res.bin,
    slug,
    version: version || 'latest',
    error: res.error,
    output: res.stdout || '',
    warning: res.stderr || ''
  };
}

module.exports = {
  listSkills,
  loadSkill,
  clawhubSearch,
  clawhubInstall
};
