# Tiger Agent

Made by AI Research Group.

Tiger is an Agentic AI assistant for Linux. It is designed for continuous operation (24/7), practical task execution, and long-lived memory.
From the start, Tiger combines:
- an agentic reasoning loop (assistant -> tools -> tool results -> final reply)
- persistent context files (`human.md`, `human2.md`, `soul.md`)
- compacted long-term memory with optional vector retrieval
- a self-maintained `ownskill.md` summary that auto-refreshes every 24 hours

Core capabilities:
- CLI chat mode
- Telegram bot mode (foreground or background)
- Local conversation memory (`db/agent.json` by default)
- Tool calling (files, shell, skills, sub-agents)
- ClawHub skill search/install support
- OpenClaw-style tool loop (assistant -> tool calls -> tool results -> final synthesis)

## Requirements

- Node.js 18+ (20+ recommended)
- npm

## Quick Start

```bash
npm install
cp .env.example .env
```

Set required values in `.env`:

- `KIMI_PROVIDER=moonshot` or `code`
- If `moonshot`: `MOONSHOT_API_KEY=...` (or `KIMI_API_KEY`)
- If `code`: `KIMI_CODE_API_KEY=...` (or `KIMI_API_KEY`)

Then run:

```bash
npm run cli
```

Exit with `/exit` or `/quit`.

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
- `TELEGRAM_BOT_TOKEN`
- `ALLOW_SHELL` (default `false`)
- `ALLOW_SKILL_INSTALL` (present in config; default `false`)
- `DATA_DIR` (default `./data`)
- `DB_PATH` (default `./db/agent.json`)
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
- Conversations/messages/memories are stored in `DB_PATH` (JSON file).
- When embeddings are enabled, compacted memory recall uses vector similarity.

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
- Optional: enable the local git secret-scan hooks: `git config core.hooksPath .githooks`.
- Rotate keys immediately if exposed.
