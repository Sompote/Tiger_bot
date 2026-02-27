<p align="center">
  <img src="./IMG_5745.jpg" alt="Tiger bot" width="900" />
</p>

# 🐯 Tiger Agent

[![npm version](https://img.shields.io/npm/v/tiger-agent.svg)](https://www.npmjs.com/package/tiger-agent)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

**Agentic Swarm AI Agent** with persistent long-term memory, multi-provider LLM support, token management, self-learning, and Telegram bot integration — designed for 24/7 autonomous operation on Linux.

Made by **AI Research Group, Department of Civil Engineering, KMUTT**

---

## 🆕 What's New — v0.3.1

- **YAML swarm architecture** — swarm flow is now configurable in `swarm/architecture/*.yaml` with orchestrator, agents, stages, and judgment matrix
- **YAML task style** — task routing style is configurable in `tasks/styles/*.yaml` and can select which architecture file to use
- **Telegram architecture editing** — added `/architecture` and `/taskstyle` commands so Telegram users can list/show/write YAML and switch default architecture
- **Parallel design orchestration default** — default architecture runs 3 designers in parallel, reviewer selects best, revision loop applies, then spec writer finalizes

### v0.2.5

- **Context-file mirror compatibility** — if legacy root files like `./soul.md` or `./ownskill.md` already exist, Tiger now mirrors updates to them automatically while continuing to use `DATA_DIR` as the canonical source
- **README path clarification** — docs now explicitly distinguish canonical `DATA_DIR` files from optional legacy root mirrors

### v0.2.4

- **ClawHub skill install fixed** — `clawhub_install` and `clawhub_search` now work correctly when installed via `npm install -g`
- **No required API keys** — `tiger onboard` skips providers with no key; any single provider is enough to start
- **`/limit` Telegram command** — set per-provider daily token limits from chat without restarting
- **Soul & ownskill refresh fixed** — 24-hour regeneration timer now uses DB timestamps, not file mtime, so reflection appends no longer block the update cycle

### v0.2.0

- **npm global install** — `npm install -g tiger-agent`, no git clone needed
- **Multi-provider LLM** — 5 providers (Kimi, Z.ai, MiniMax, Claude, Moonshot) with auto-fallback
- **Daily token limits** — per-provider limits with automatic switching at UTC midnight
- **`tiger` CLI** — unified command: `tiger onboard`, `tiger start`, `tiger telegram`, `tiger stop`
- **Telegram `/api`, `/tokens`, `/limit`** — manage providers and usage from chat
- **Encrypted secrets** — optional at-rest encryption for API keys

---

## 🎯 Why Tiger?

| Feature | Tiger | Generic AI Assistants |
|---------|-------|-----------------------|
| **Memory** | Persistent lifetime memory (Vector DB) | Forgets when session ends |
| **Learning** | Self-training every 12 hours | Static, never improves |
| **Security** | Audit logs + Encryption + Hardened perms | No audit trail |
| **Channels** | CLI + Telegram simultaneously | Single channel only |
| **Execution** | Chains multiple skills autonomously | Single command only |

## 📊 Dimension Comparison

| Dimension | Tiger v0.3.1 🐯 | OpenClaw 🔧 | NanoClaw 🪐 |
|---|---|---|---|
| Language | JS + Python | TypeScript | TypeScript |
| Platform | Linux + Docker | macOS/Linux/Win | macOS/Linux/Win |
| Install | `npm install -g tiger-agent` | `npm install -g openclaw` | `git clone` + Claude Code |
| LLM Providers | 5 (Kimi, Z.ai, MiniMax, Claude, Moonshot) | OpenAI + Claude | Claude only |
| Multi-provider Failover | ✅ Auto on 429/403 | ✅ | ❌ |
| Token Budgeting | ✅ Per-provider daily limits | ❌ | ❌ |
| Predefined Agents | ✅ Role-based, customizable via Markdown files | ✅ Built-in typed agents | ❌ User-defined only |
| Swarm Architecture | ✅ YAML configurable | ❌ | ❌ |
| Parallel Execution | ✅ Fault-tolerant `min_success` threshold | ✅ | ✅ |
| Judgment Matrix | ✅ Weighted criteria + review-revise loop | ❌ | ❌ |
| Task Resume | ✅ `/task continue <id>` | ❌ | ❌ |
| Crash Detection | ✅ 60s heartbeat; 5-min stale -> restart worker | ❌ | ✅ 5-min -> reclaim tasks |
| Container Isolation | ✅ Docker hardened (`cap_drop: ALL`, read-only FS) | Optional Docker | ✅ Docker default |
| Memory Persistence | ✅ Cross-session SQLite + 30-day backup | Session only | Team lifetime only |
| Self-learning | ✅ 12h reflection + 24h regeneration | ❌ | ❌ |
| Vector Retrieval | ✅ sqlite-vec / cosine fallback | ❌ | ❌ |
| Audit Logging | ✅ | ❌ | ❌ |
| Voice / Browser | ❌ / ❌ | ✅ / ✅ | ❌ / ❌ |
| Channel Coverage | Telegram, WhatsApp, CLI | All + iMessage + Teams | Most major |
| Core Strength | Cost control + YAML swarm + self-learning | Channel breadth + voice + sync A2A | Security + formal swarm lifecycle |
| Core Weakness | Linux-primary; no cross-task DAG | High complexity; app-layer security | Single-provider lock-in |

---

## 📋 Requirements

- Node.js 18+ (20+ recommended)
- npm
- Python 3 (for SQLite memory helper)

---

## 📦 Installation

```bash
npm install -g tiger-agent
```

All config and runtime data is stored in `~/.tiger/` — nothing written to the npm global directory.

## 🐳 Docker (Safer Runtime Isolation)

Run Tiger in a hardened container with:
- non-root user (`node`)
- dropped Linux capabilities (`cap_drop: [ALL]`)
- `no-new-privileges`
- read-only root filesystem
- persistent writable volume only for `TIGER_HOME` (`/home/node/.tiger`)

Build image:

```bash
docker build -t tiger-agent:local .
```

Run CLI mode:

```bash
docker run --rm -it \
  --env-file .env \
  --read-only \
  --tmpfs /tmp \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  -e TIGER_HOME=/home/node/.tiger \
  -v tiger_home:/home/node/.tiger \
  tiger-agent:local start
```

Run Telegram mode via Compose:

```bash
docker compose up -d
docker compose logs -f tiger
```

Default compose command is `telegram`. Change `command:` in `docker-compose.yml` if you want `start` instead.

---

## 🚀 Quick Start

### 1. Run the setup wizard

```bash
tiger onboard
```

The wizard will ask for:
- **Active provider** — which LLM to use by default (e.g. `zai`, `claude`)
- **Fallback order** — comma-separated list tried when the active provider is rate-limited
- **API keys** — enter only the providers you have keys for; others are skipped automatically
- **Telegram bot token** — from [@BotFather](https://t.me/BotFather) on Telegram
- **Daily token limits** — per-provider caps (0 = unlimited); auto-switches on breach
- **Shell / skill-install** — optional tool permissions

Config is saved to `~/.tiger/.env` (mode 600).

### 2. Start

**CLI chat:**
```bash
tiger start
```
Exit with `/exit` or `/quit`.

**Telegram bot (foreground):**
```bash
tiger telegram
```

**Telegram bot (background daemon):**
```bash
tiger telegram --background   # start
tiger status                  # check if running
tiger stop                    # stop
```

**Restart background bot (after editing `.env` in this repo):**
```bash
cd /root/tiger
npm run telegram:stop
npm run telegram:bg
```

Logs: `~/.tiger/logs/telegram.out.log`

---

## 🎮 Run Modes

| Mode | Command | Description |
|------|---------|-------------|
| **CLI** | `tiger start` | Interactive terminal chat |
| **Telegram** | `tiger telegram` | Telegram bot (foreground) |
| **Background** | `tiger telegram --background` | 24/7 daemon with auto-restart |
| **Stop** | `tiger stop` | Stop background daemon |
| **Status** | `tiger status` | Check daemon status |
| **Onboard** | `tiger onboard` | Re-run setup wizard |

Background crash detection:
- Telegram worker now emits a heartbeat every 60 seconds.
- Supervisor watchdog checks heartbeat every minute.
- If heartbeat is stale for 5 minutes, supervisor force-restarts the worker.

---

## 🔧 Setup Wizard Details

`tiger onboard` writes `~/.tiger/.env` with all settings. You can re-run it at any time to update config.

| Wizard prompt | What it sets |
|---------------|-------------|
| Active provider | `ACTIVE_PROVIDER` |
| Fallback order | `PROVIDER_ORDER` |
| API keys | `ZAI_API_KEY`, `CLAUDE_API_KEY`, etc. |
| Telegram token | `TELEGRAM_BOT_TOKEN` |
| Token limits | `ZAI_TOKEN_LIMIT`, `CLAUDE_TOKEN_LIMIT`, etc. |
| Shell tool | `ALLOW_SHELL` |
| Skill install | `ALLOW_SKILL_INSTALL` |

> **Tip:** You can also edit `~/.tiger/.env` directly and restart the bot to apply changes.

---

## 🔑 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ACTIVE_PROVIDER` | — | Active LLM provider (`kimi`, `zai`, `minimax`, `claude`, `moonshot`) |
| `PROVIDER_ORDER` | — | Fallback order, comma-separated |
| `TELEGRAM_BOT_TOKEN` | — | Telegram bot token |
| `ALLOW_SHELL` | `false` | Enable shell tool |
| `ALLOW_SKILL_INSTALL` | `false` | Enable ClawHub skill install |
| `VECTOR_DB_PATH` | `~/.tiger/db/memory.sqlite` | SQLite vector DB path |
| `DATA_DIR` | `~/.tiger/data` | Canonical context files directory |
| `OWN_SKILL_UPDATE_HOURS` | `24` | Hours between `ownskill.md` regenerations (min 1) |
| `SOUL_UPDATE_HOURS` | `24` | Hours between `soul.md` regenerations (min 1) |
| `REFLECTION_UPDATE_HOURS` | `12` | Hours between reflection cycles (min 1) |
| `MEMORY_INGEST_EVERY_TURNS` | `2` | Ingest durable memory every N conversation turns |
| `MEMORY_INGEST_MIN_CHARS` | `140` | Minimum combined chars in a turn to trigger memory ingest |

Config lives in `~/.tiger/.env` after running `tiger onboard`.

---

## 🌐 Multi-Provider LLM

Tiger supports **5 providers** with automatic fallback and daily token limits.

### Supported Providers

| Provider | ID | Default Model | API Key Variable |
|----------|----|--------------|-----------------|
| Kimi Code | `kimi` | `k2p5` | `KIMI_CODE_API_KEY` |
| Kimi Moonshot | `moonshot` | `kimi-k1` | `MOONSHOT_API_KEY` |
| Z.ai (Zhipu) | `zai` | `glm-4.7` | `ZAI_API_KEY` (format: `id.secret`) |
| MiniMax | `minimax` | `abab6.5s-chat` | `MINIMAX_API_KEY` |
| Claude (Anthropic) | `claude` | `claude-sonnet-4-6` | `CLAUDE_API_KEY` |

### `.env` Example

```env
ACTIVE_PROVIDER=zai
PROVIDER_ORDER=zai,claude,kimi,minimax,moonshot

KIMI_CODE_API_KEY=<key>
ZAI_API_KEY=<key>
MINIMAX_API_KEY=<key>
CLAUDE_API_KEY=<key>
MOONSHOT_API_KEY=<key>

# Daily token limits per provider (0 = unlimited)
KIMI_TOKEN_LIMIT=100000
ZAI_TOKEN_LIMIT=100000
MINIMAX_TOKEN_LIMIT=100000
CLAUDE_TOKEN_LIMIT=500000
MOONSHOT_TOKEN_LIMIT=100000

# Provider request timeouts (ms)
KIMI_TIMEOUT_MS=120000
ZAI_TIMEOUT_MS=120000

# Swarm worker-step timeout (0 = no extra swarm timeout)
SWARM_AGENT_TIMEOUT_MS=120000

# Swarm only: on timeout/network/API error, retry via next provider
SWARM_ROUTE_ON_PROVIDER_ERROR=true

# Swarm execution resilience
SWARM_STEP_MAX_RETRIES=2
SWARM_CONTINUE_ON_ERROR=true

# Swarm task entry policy
SWARM_DEFAULT_FLOW=auto
SWARM_FIRST_AGENT_POLICY=auto
# Used only when SWARM_FIRST_AGENT_POLICY=fixed
SWARM_FIRST_AGENT=designer
```

### Auto-Switch Behaviour

1. Uses `ACTIVE_PROVIDER` for all requests
2. On **429** (rate limit) or **403** (quota exceeded) — switches to next in `PROVIDER_ORDER`
3. When a provider's daily token limit is reached — skipped for the rest of the day
4. Providers with no API key configured are silently skipped
5. Token usage resets at UTC midnight (`~/.tiger/db/token_usage.json`)

---

## 💬 Telegram Commands

| Command | Description |
|---------|-------------|
| `/api` | Show all providers with token usage |
| `/api <id>` | Switch active provider (e.g. `/api claude`) |
| `/tokens` | Show today's token usage per provider |
| `/limit` | Show daily token limits per provider |
| `/limit <provider> <n>` | Set daily token limit (0 = unlimited, e.g. `/limit zai 100000`) |
| `/swarm` | Show agent swarm status (ON/OFF) |
| `/swarm <on|off>` | Enable or disable internal swarm routing for normal messages |
| `/status` | Show swarm task queues (`pending`, `in_progress`, `done`, `failed`) |
| `/task` | List swarm tasks across queues |
| `/task continue <task_id>` | Resume a failed/stuck swarm task from the last failed agent |
| `/task retry <task_id>` | Alias of `/task continue <task_id>` |
| `/task delete <task_id>` | Delete a swarm task file from queue storage |
| `/agents` | Show internal swarm agents and availability |
| `/cancel <task_id>` | Cancel a swarm task |
| `/ask <agent> <question>` | Ask a specific internal agent role directly |
| `/architecture` | List swarm architecture YAML files |
| `/architecture show <file>` | Show one architecture YAML file |
| `/architecture use <file>` | Set default task-style architecture file |
| `/architecture write <file>` + newline + yaml | Save architecture YAML from Telegram |
| `/taskstyle` | List task-style YAML files |
| `/taskstyle show <file>` | Show one task-style YAML file |
| `/taskstyle write <file>` + newline + yaml | Save task-style YAML from Telegram |
| `/help` | Show all commands |

### Swarm Settings (`/swarm`)

Tiger v0.3.1 includes an internal agent swarm for Telegram message routing.

- **Default:** swarm is **ON** when the Telegram bot starts
- **`/swarm on`**: regular user messages are routed through the YAML architecture in `swarm/architecture/*.yaml` (selected by `tasks/styles/default.yaml`)
- **`/swarm off`**: regular user messages skip the swarm and go directly to the standard Tiger agent reply path
- **Scope:** this toggle affects only **normal chat messages** (not admin commands like `/api`, `/tokens`, `/limit`)
- **Current persistence:** the `/swarm` toggle is currently **in-memory only** and resets to **ON** after bot restart
- **Task resume:** use `/task continue <task_id>` (or `/task retry <task_id>`) to continue a failed timeout/API-error task without starting over

### Swarm Timeout / Failover (`.env`)

- `SWARM_AGENT_TIMEOUT_MS`: timeout per swarm worker step (e.g. one `designer` turn). `0` disables the extra swarm timeout.
- `SWARM_ROUTE_ON_PROVIDER_ERROR=true|false`: swarm-only provider failover on timeout/network/API errors.
- `SWARM_STEP_MAX_RETRIES`: retries per failed worker/stage before giving up.
- `SWARM_CONTINUE_ON_ERROR=true|false`: if `true`, swarm continues on degraded path after retries are exhausted (instead of hard failing).
- Provider timeouts are separate and provider-specific, for example `KIMI_TIMEOUT_MS`, `ZAI_TIMEOUT_MS`, `CLAUDE_TIMEOUT_MS`.

### Swarm Entry Policy (`.env`)

- `SWARM_DEFAULT_FLOW=auto|design|research_build`: default flow for new Telegram swarm tasks.
- `SWARM_FIRST_AGENT_POLICY` controls who starts first:
  - `auto` (default): Tiger/orchestrator picks based on the goal text
  - `flow`: use flow mapping (`research_build -> scout`, otherwise `designer`)
  - `fixed`: use `SWARM_FIRST_AGENT`
  - or set a direct agent name (for example `designer`, `scout`, `coder`)
- `SWARM_FIRST_AGENT` is used when `SWARM_FIRST_AGENT_POLICY=fixed`

Examples:

```text
/swarm
/swarm off
/swarm on
/task
/task retry task_xxx
/task delete task_xxx
```

### Swarm Agent Files (Manual Customization)

Tiger creates a local swarm workspace so you can manually customize each agent's behavior.

Default folders (project/runtime root):

```text
agents/
  tiger/
  designer/
  senior_eng/
  spec_writer/
  scout/
  coder/
  critic/
tasks/
  pending/
  in_progress/
  done/
  failed/
```

Each agent folder includes files such as:

- `soul.md` — the agent's personality, rules, and mindset
- `ownskill.md` — what the agent is good at / preferred workflow
- `experience.json` — learned lessons and task stats
- `memory.md` — long-form notes/patterns
- `human.md` — only for `agents/tiger/` (user preferences)

Manual setup / editing:

- Start the bot once (`tiger telegram` or `tiger start`) and Tiger will auto-create missing `agents/` and `tasks/` folders
- You can then open and edit files like `agents/designer/soul.md` or `agents/senior_eng/soul.md` manually
- Your edits are used on future swarm runs (for example `/ask designer ...` or normal swarm-routed messages)
- Keep edits in plain Markdown/JSON and avoid deleting required files while the bot is running

Example customization ideas:

- Make `designer` more creative / visual
- Make `senior_eng` stricter about security, error handling, and scalability
- Make `spec_writer` produce a specific document format your team uses

### Swarm Architecture YAML (v0.3.1)

Default files:

```text
swarm/architecture/tiger_parallel_design.yaml
tasks/styles/default.yaml
```

Default architecture behavior:

- Orchestrator: `tiger`
- Stage 1: send task simultaneously to `designer_a`, `designer_b`, `designer_c` (different souls/personalities)
  - `designer_a`: senior conservative
  - `designer_b`: balanced, around 40 style
  - `designer_c`: young aggressive, higher risk appetite
- Stage 2: `reviewer` evaluates with the judgment matrix and picks best candidate
- Stage 3: selected designer revises based on reviewer feedback (loop until approved)
- Stage 4: `spec_writer` writes final output in two sections: **Calculation Report** and **Executive Summary**

Resilient execution behavior:

- Parallel stages are fault-tolerant: one failed role does not abort the whole stage.
- `type: parallel` now supports `min_success` (default `1`) to define how many successful role outputs are required.
- Failed parallel-role errors are stored in context as `<store_as>_errors`.
- Worker/stage retries are controlled by `SWARM_STEP_MAX_RETRIES`.
- If retries are exhausted and `SWARM_CONTINUE_ON_ERROR=true`, swarm continues on a degraded path instead of hard fail.

Example `swarm/architecture/tiger_parallel_design.yaml`:

```yaml
version: 1
name: tiger_parallel_design
main_orchestrator: tiger
start_stage: design_parallel
agents:
  - id: designer_a
    runtime_agent: designer_a
    role: designer
  - id: designer_b
    runtime_agent: designer_b
    role: designer
  - id: designer_c
    runtime_agent: designer_c
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
    min_success: 2
    store_as: design_candidates
    next: review_best
  - id: review_best
    type: judge
    role: reviewer
    candidates_from: design_candidates
    selected_role_key: selected_role
    feedback_key: reviewer_feedback
    calculation_report_key: best_calculation_report
    pass_next: final_spec
    fail_next: revise_selected
  - id: revise_selected
    type: revise
    role_from_context: selected_role
    feedback_from_context: reviewer_feedback
    candidates_from: design_candidates
    update_context_keys_from_revised:
      - best_calculation_report
    next: review_best
  - id: final_spec
    type: final
    role: spec_writer
    source_from_context: best_calculation_report
    output_sections:
      - Calculation Report
      - Executive Summary
    output_notes: Include formulas, assumptions, step-by-step calculations, final values, and concise recommendations.
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
```

### Task Style YAML

Task style is the selector/policy layer for swarm execution.

- `architecture`: which file in `swarm/architecture/` to run
- `flow`: flow label for task routing mode
- `objective_prefix`: text prepended to the user objective before processing

Default file:

```text
tasks/styles/default.yaml
```

Example:

```yaml
version: 1
name: default
architecture: tiger_parallel_design.yaml
flow: architecture
objective_prefix: "Objective:"
```

---

## 🧠 Memory & Context

### Context Files

Loaded on every turn from `DATA_DIR` (default: `~/.tiger/data/`):

| File | Purpose |
|------|---------|
| `soul.md` | Agent identity, principles, and stable preferences |
| `human.md` | User profile — goals, patterns, preferences |
| `human2.md` | Running update log written after every conversation turn |
| `ownskill.md` | Known skills, workflows, and lessons learned |

> **v0.2.5 compatibility note:** If root-level legacy files already exist (for example `./soul.md`, `./ownskill.md`), Tiger mirrors updates to those files automatically. The canonical source remains `DATA_DIR`.

### Auto-Refresh Cycles

Tiger periodically regenerates these files using the LLM. All durations are configurable in `.env` (minimum 1 hour).

| Cycle | `.env` Variable | Default | What It Does |
|-------|----------------|---------|--------------|
| **Skill summary** | `OWN_SKILL_UPDATE_HOURS` | `24` | Rewrites `ownskill.md` with updated skills, workflows, and lessons derived from recent conversations |
| **Soul refresh** | `SOUL_UPDATE_HOURS` | `24` | Rewrites `soul.md` to reflect any evolved identity, operating rules, or preferences |
| **Reflection** | `REFLECTION_UPDATE_HOURS` | `12` | Extracts long-term memory bullets from recent messages and appends them to `soul.md`, `human.md`, `ownskill.md`, and the vector DB |
| **Memory ingest** | `MEMORY_INGEST_EVERY_TURNS` | `2` | After every N conversation turns, distils durable preference or workflow facts into the vector DB |

> **Note:** Refresh timers for `soul.md` and `ownskill.md` are tracked in the DB (not file modification time), so reflection appends do not reset the 24-hour clock.

Example `.env` — tighten cycles for an active bot:

```env
OWN_SKILL_UPDATE_HOURS=12
SOUL_UPDATE_HOURS=12
REFLECTION_UPDATE_HOURS=6
MEMORY_INGEST_EVERY_TURNS=2
MEMORY_INGEST_MIN_CHARS=140
```

### Vector Memory

Stored in `~/.tiger/db/memory.sqlite`. Optional `sqlite-vec` extension enables fast ANN search:

```env
SQLITE_VEC_EXTENSION=/path/to/sqlite_vec
```

Without it, Tiger falls back to cosine similarity in Python — slower but fully functional.

---

## 🛠️ Built-in Tools

| Category | Tools |
|----------|-------|
| **Files** | `list_files`, `read_file`, `write_file` |
| **Shell** | `run_shell` (requires `ALLOW_SHELL=true`) |
| **Skills** | `list_skills`, `load_skill`, `clawhub_search`, `clawhub_install` |
| **Orchestration** | `run_sub_agents` |

### ClawHub Skills

Tiger can search and install skills from [ClawHub](https://clawhub.dev) — a community registry of reusable agent skills. The `clawhub` CLI is bundled with Tiger, no separate install needed.

Enable skill install in `~/.tiger/.env`:

```env
ALLOW_SKILL_INSTALL=true
```

Then just ask Tiger in chat:

```
Search for a web search skill on clawhub
Install the web-search skill
```

Skills are installed to `~/.tiger/skills/` and loaded automatically on demand.

> **Note:** `ALLOW_SKILL_INSTALL=true` must be set during `tiger onboard` or added manually to `~/.tiger/.env`.

---

## 🔒 Security

| Feature | Detail |
|---------|--------|
| **Credential Storage** | `~/.tiger/.env.secrets` with mode 600 |
| **Database Security** | `~/.tiger/db/` with hardened permissions |
| **Audit Logging** | Sanitized skill logs at `~/.tiger/logs/audit.log` |
| **Auto Backup** | Daily SQLite backups, 30-day retention |
| **Secret Rotation** | Built-in 90-day rotation reminders |

### Optional: Encrypted Secrets

```bash
# Run from ~/.tiger after onboard
export SECRETS_PASSPHRASE='your-passphrase'
node $(npm root -g)/tiger-agent/scripts/encrypt-env.js \
  --in .env.secrets --out .env.secrets.enc
rm .env.secrets
```

---

## 🆚 Tiger vs OpenClaw

| Feature | **Tiger** 🐯 | **OpenClaw** 🔧 |
|---------|-------------|-----------------|
| **Identity** | Persistent AI persona | Skill marketplace |
| **Memory** | Text files + SQLite vector | Skill-based only |
| **Self-Training** | ✅ 12h auto-reflection | ❌ Manual only |
| **Skill Orchestration** | Multi-skill pipelines | Single execution |
| **Context Retention** | ✅ Cross-session | Session-only |
| **Security** | ✅ Encryption + audit logs | Basic |
| **Installation** | `npm install -g tiger-agent` | `clawhub install` |

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Bot stuck on one provider | `/api <name>` in Telegram to switch manually |
| Provider silently skipped | No API key set, or daily limit reached — check `/tokens` |
| `401` auth error | Wrong or missing API key |
| `403` quota error | Daily quota exhausted — auto-switches; raise `*_TOKEN_LIMIT` |
| `429` rate limit | Auto-switches to next provider in `PROVIDER_ORDER` |
| Z.ai auth fails | Key must be `id.secret` format (from Zhipu/BigModel console) |
| Telegram bot runs but does not respond | Ensure only one polling instance is running for the same bot token (stop old/global service copies) |
| `soul.md` / `ownskill.md` look stale | Check `DATA_DIR` first (default `~/.tiger/data`). In v0.2.5+, existing root legacy copies are mirrored automatically |
| Shell tool disabled | Set `ALLOW_SHELL=true` in `~/.tiger/.env` |
| Stuck processes | `pkill -f tiger-agent` then restart |
| Reset token counters | Delete `~/.tiger/db/token_usage.json` and restart |

---

## 📁 Data Directory

All runtime data lives in `~/.tiger/`:

```
~/.tiger/
├── .env                  # Settings
├── .env.secrets          # API keys (mode 600)
├── data/                 # Context files (soul.md, human.md, ...)
├── db/
│   ├── agent.json        # Conversation state
│   ├── memory.sqlite     # Vector memory
│   └── token_usage.json  # Daily token counters
└── logs/
    ├── audit.log
    └── telegram-supervisor.log
```

---

## 👥 Authors

**AI Research Group**
Department of Civil Engineering
King Mongkut's University of Technology Thonburi (KMUTT)
Bangkok, Thailand

---

## 📜 License

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

*[虎 - Hǔ - The Tiger: Powerful, agile, and relentless in pursuit of goals]*
