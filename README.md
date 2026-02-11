# Tiger Agent

Made by AI Research Group.

Tiger is an Agentic AI assistant for Linux. It is designed for continuous operation (24/7), practical task execution, and long-lived memory.
From the start, Tiger combines:
- an agentic reasoning loop (assistant -> tools -> tool results -> final reply)
- persistent context files (`human.md`, `human2.md`, `soul.md`)
- compacted long-term memory with SQLite-backed vector retrieval (default)
- a self-maintained `ownskill.md` summary that auto-refreshes every 24 hours

Core capabilities:
- CLI chat mode
- Telegram bot mode (foreground or background)
- Local conversation/message state (`db/agent.json` by default) plus SQLite vector memory (`db/memory.sqlite` by default)
- Tool calling (files, shell, skills, sub-agents)
- ClawHub skill search/install support
- OpenClaw-style tool loop (assistant -> tool calls -> tool results -> final synthesis)

## Requirements

- Node.js 18+ (20+ recommended)
- npm
- Python 3 (used by SQLite memory helper at `scripts/sqlite_memory.py`)

## Quick Start (First Run)

Use this exact sequence on a fresh clone:

```bash
npm install
npm run setup
npm run cli
```

CLI exit commands: `/exit` or `/quit`.

## Setup Wizard Output

`npm run setup` creates:

- `.env` (non-secret settings)
- `.env.secrets` (API keys/tokens, gitignored) or `.env.secrets.enc` (encrypted)

Setup opt-ins during install:
- persistent vs volatile vector DB path (`./db/memory.sqlite` vs `/tmp/tiger_memory.db`)
- optional immediate `sqlite-vec` bootstrap (`pip install` + extension auto-detect)
- optional encrypted secrets file (`.env.secrets.enc`)

If you prefer manual setup:

```bash
cp .env.example .env
```

## Run Modes

CLI:

```bash
npm run cli
```

Telegram foreground:

```bash
npm run telegram
```

Telegram background supervisor:

```bash
npm run telegram:bg
```

Stop background Telegram:

```bash
npm run telegram:stop
```

Background logs are written to `logs/telegram-supervisor.log`.

## Environment Variables

From `.env.example`:

- `KIMI_PROVIDER` (`moonshot` or `code`)
- `MOONSHOT_API_KEY`
- `KIMI_CODE_API_KEY`
- `KIMI_API_KEY` (fallback alias)
- `KIMI_BASE_URL`
- `KIMI_CHAT_MODEL`
- `KIMI_EMBED_MODEL`
- `KIMI_USER_AGENT`
- `KIMI_ENABLE_EMBEDDINGS`
- `KIMI_TIMEOUT_MS` (default `30000`)
- `OWN_SKILL_UPDATE_HOURS` (default `24`)
- `SOUL_UPDATE_HOURS` (default `24`)
- `REFLECTION_UPDATE_HOURS` (default `12`)
- `MEMORY_INGEST_EVERY_TURNS` (default `2`)
- `MEMORY_INGEST_MIN_CHARS` (default `140`)
- `TELEGRAM_BOT_TOKEN`
- `ALLOW_SHELL` (default `false`)
- `ALLOW_SKILL_INSTALL` (present in config; default `false`)
- `DATA_DIR` (default `./data`)
- `DB_PATH` (default `./db/agent.json`, JSON state file)
- `VECTOR_DB_PATH` (default `./db/memory.sqlite`)
- `SQLITE_VEC_EXTENSION` (optional path to `sqlite-vec` extension library)
- `MAX_MESSAGES` (default `200`)
- `RECENT_MESSAGES` (default `40`)

## Provider Examples

Moonshot/Open Platform:

```env
KIMI_PROVIDER=moonshot
MOONSHOT_API_KEY=your_key
KIMI_BASE_URL=https://api.moonshot.cn/v1
KIMI_CHAT_MODEL=kimi-k1
KIMI_ENABLE_EMBEDDINGS=true
KIMI_EMBED_MODEL=kimi-embedding-v1
```

Kimi Code:

```env
KIMI_PROVIDER=code
KIMI_CODE_API_KEY=your_key
KIMI_BASE_URL=https://api.kimi.com/coding/v1
KIMI_CHAT_MODEL=k2p5
KIMI_USER_AGENT=KimiCLI/0.77
KIMI_ENABLE_EMBEDDINGS=false
KIMI_TIMEOUT_MS=30000
```

## Context and Memory

Tiger loads these files into system context every turn:

- `data/soul.md`
- `data/human.md`
- `data/human2.md`
- `data/ownskill.md`

These `data/*.md` files are **local runtime state** and are gitignored by default to avoid accidentally committing personal info.
They are auto-created on first run if missing.

Behavior summary:

- `human2.md` may be appended with profile updates over time.
- `ownskill.md` is refreshed periodically (`OWN_SKILL_UPDATE_HOURS`).
- `soul.md` is refreshed periodically (`SOUL_UPDATE_HOURS`).
- A reflection cycle runs periodically (`REFLECTION_UPDATE_HOURS`) and updates:
  - semantic memory (`self_reflection` entries in SQLite at `VECTOR_DB_PATH`)
  - structured files (`ownskill.md`, `human.md`, `human2.md`, `soul.md`)
    with `Patterns Observed`, `Failures & Lessons`, and `Successful Workflows`
- Conversations/messages are stored in `DB_PATH` (JSON file).
- Vector memory is stored in SQLite at `VECTOR_DB_PATH`.
- If `SQLITE_VEC_EXTENSION` is set and loadable, SQLite can use `sqlite-vec`; otherwise Tiger falls back to in-process cosine ranking over stored embeddings.

ChromaDB is not required for Tiger's default memory stack.

## SQLite Vector Setup

Tiger works out-of-the-box with SQLite-backed memory and no external APIs.

Optional `sqlite-vec` acceleration:

1. Install/build `sqlite-vec` on your host.
2. Set `SQLITE_VEC_EXTENSION` to the absolute extension file path in `.env`.
3. Restart Tiger.

Example:

```env
VECTOR_DB_PATH=./db/memory.sqlite
SQLITE_VEC_EXTENSION=/absolute/path/to/sqlite_vec
```

If extension loading fails, Tiger continues using SQLite storage with in-process cosine ranking.

Automatic ingestion and tracking:
- Tiger ingests one compact durable memory roughly every `MEMORY_INGEST_EVERY_TURNS` turns (or sooner when preference/workflow signals are detected).
- Tool/skill calls are recorded in the SQLite `skills` table.

Quick commands:

```bash
npm run memory:init
npm run memory:stats
npm run memory:smoke
npm run memory:migrate
npm run memory:vec:check
npm run memory:vec:install
```

Recommended persistent path:

```env
VECTOR_DB_PATH=./db/memory.sqlite
```

Verify active runtime config:

```bash
rg -n "^VECTOR_DB_PATH=|^SQLITE_VEC_EXTENSION=" .env
npm run memory:stats
npm run memory:vec:check
```

If a report still shows `/tmp/tiger_memory.db`, it is reading an old file or old config snapshot. Tiger uses the path currently set in `.env`.

If you previously used `/tmp/tiger_memory.db`, migrate it:

```bash
npm run memory:migrate
```

## Built-in Tools

Tiger can call local tools for:

- file ops: `list_files`, `read_file`, `write_file`
- shell: `run_shell` (`ALLOW_SHELL=true` required)
- skills: `list_skills`, `load_skill`, `clawhub_search`, `clawhub_install`
- orchestration: `run_sub_agents`

Skills directory: `./skills`

## Troubleshooting

Authentication errors (`401`):
- wrong provider key for selected `KIMI_PROVIDER`
- missing key value
- extra quotes/spaces in `.env`

`403 ... only available for Coding Agents`:
- provider-side restriction for your token/client type

`Shell tool disabled`:
- set `ALLOW_SHELL=true` and restart

Network/timeout errors:
- verify DNS/network reachability from host
- optionally reduce timeout during debugging (`KIMI_TIMEOUT_MS=10000`)

Multiple CLI processes / stuck sessions:

```bash
pkill -f "node src/cli.js|npm run cli"
npm run cli
```

## Security

- Do not commit `.env`.
- Prefer splitting secrets into `.env.secrets` (gitignored) or using `.env.secrets.enc` (encrypted at rest).
- Optional: enable the local git secret-scan hooks: `git config core.hooksPath .githooks`.
- Rotate keys immediately if exposed.

### Secret File Split (Recommended)

- Put non-secrets in `.env`
- Put API keys/tokens in `.env.secrets` (gitignored)

Create it from the template:

```bash
cp .env.secrets.example .env.secrets
chmod 600 .env.secrets
```

### Encrypted Secrets (At-Rest)

This protects secrets if someone steals the repo/disk, but it does not protect you if an attacker already has root access on the server.

Encrypt:

```bash
export SECRETS_PASSPHRASE='your-long-passphrase'
node scripts/encrypt-env.js --in .env.secrets --out .env.secrets.enc
rm .env.secrets
```

Run the bot with:

- `SECRETS_PASSPHRASE` set in the environment (not in git)
- optional `SECRETS_FILE=.env.secrets.enc`
