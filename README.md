# 🐯 Tiger Agent

**Made by AI Research Group, Department of Civil Engineering, King Mongkut's University of Technology Thonburi (KMUTT)**

Tiger is a **Cognitive AI Agent** with persistent long-term memory, multi-provider LLM support, self-learning, and Telegram bot integration — designed for 24/7 autonomous operation on Linux.

---

## 🎯 Why Tiger?

| Feature | Tiger Bot | Generic AI Assistants |
|---------|-----------|----------------------|
| **Memory** | Persistent lifetime memory (Vector DB) | Forgets when session ends |
| **Learning** | Self-training every 12 hours | Static, never improves |
| **Security** | Audit logs + Encryption + Hardened perms | No audit trail |
| **Channels** | CLI + Telegram simultaneously | Single channel only |
| **Execution** | Chains multiple skills autonomously | Single command only |

---

## 📦 Installation

```bash
npm install -g tiger-agent
```

No git clone needed.

---

## 🚀 Quick Start

```bash
tiger onboard     # First-time setup wizard
tiger start       # Start CLI chat
```

CLI exit: `/exit` or `/quit`

For Telegram:

```bash
tiger telegram              # Foreground
tiger telegram --background # Background daemon
tiger stop                  # Stop daemon
tiger status                # Check daemon status
```

---

## 📋 Requirements

- Node.js 18+ (20+ recommended)
- npm
- Python 3 (for SQLite memory helper)

---

## 🎮 Run Modes

| Mode | Global install | From source | Use Case |
|------|---------------|-------------|----------|
| **CLI** | `tiger start` | `npm run cli` | Interactive terminal |
| **Telegram** | `tiger telegram` | `npm run telegram` | Bot foreground |
| **Background** | `tiger telegram --background` | `npm run telegram:bg` | 24/7 daemon |
| **Stop** | `tiger stop` | `npm run telegram:stop` | Kill daemon |
| **Status** | `tiger status` | — | Check daemon |

Background logs: `~/.tiger/logs/telegram-supervisor.log`

---

## 🔧 Setup Wizard

`tiger onboard` (global) or `npm run setup` (from source) configures:

- `~/.tiger/.env` — non-secret settings
- `~/.tiger/.env.secrets` — API keys and tokens (mode 600)

Options during setup:
- Persistent vs temporary vector DB
- Optional `sqlite-vec` acceleration
- Optional encrypted secrets file

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
| `DATA_DIR` | `~/.tiger/data` | Context files directory |

---

## 🌐 Multi-Provider LLM

Tiger supports **5 providers** with automatic fallback and daily token limits.

### Supported Providers

| Provider | ID | Default Model | API Key |
|----------|----|--------------|---------|
| Kimi Code | `kimi` | `k2p5` | `KIMI_CODE_API_KEY` |
| Kimi Moonshot | `moonshot` | `kimi-k1` | `MOONSHOT_API_KEY` |
| Z.ai (Zhipu) | `zai` | `glm-5` | `ZAI_API_KEY` (format: `id.secret`) |
| MiniMax | `minimax` | `abab6.5s-chat` | `MINIMAX_API_KEY` |
| Claude (Anthropic) | `claude` | `claude-sonnet-4-6` | `CLAUDE_API_KEY` |

### `.env` Configuration

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
```

### Auto-Switch Behaviour

1. Uses `ACTIVE_PROVIDER` for all requests
2. On **429** (rate limit) or **403** (quota exceeded) — switches to next in `PROVIDER_ORDER`
3. When a provider's daily token limit is reached — skipped for the rest of the day
4. Providers with no API key are silently skipped
5. Token usage tracked in `~/.tiger/db/token_usage.json`, resets at UTC midnight

---

## 💬 Telegram Commands

| Command | Description |
|---------|-------------|
| `/api` | Show all providers with token usage |
| `/api <id>` | Switch provider (e.g. `/api claude`) |
| `/tokens` | Show today's token usage per provider |
| `/help` | Show all commands |

---

## 🧠 Memory & Context

Context files loaded every turn (from `~/.tiger/data/`):

- `soul.md` — Agent personality
- `human.md` / `human2.md` — User profile
- `ownskill.md` — Known skills (auto-refreshed every 24h)

Auto-refresh cycles (configurable via `.env`):

| Cycle | Variable | Default |
|-------|----------|---------|
| Skill summary | `OWN_SKILL_UPDATE_HOURS` | 24h |
| Soul refresh | `SOUL_UPDATE_HOURS` | 24h |
| Reflection | `REFLECTION_UPDATE_HOURS` | 12h |
| Memory ingest | `MEMORY_INGEST_EVERY_TURNS` | every N turns |

Vector memory DB: `~/.tiger/db/memory.sqlite`

Optional `sqlite-vec` acceleration:
```env
SQLITE_VEC_EXTENSION=/path/to/sqlite_vec
```

Memory commands (from source):
```bash
npm run memory:init      # Initialize DB
npm run memory:stats     # Show stats
npm run memory:migrate   # Migrate from /tmp/
npm run memory:vec:check # Check sqlite-vec
```

---

## 🛠️ Built-in Tools

| Category | Tools |
|----------|-------|
| **Files** | `list_files`, `read_file`, `write_file` |
| **Shell** | `run_shell` (requires `ALLOW_SHELL=true`) |
| **Skills** | `list_skills`, `load_skill`, `clawhub_search`, `clawhub_install` |
| **Orchestration** | `run_sub_agents` |

---

## 🔒 Security

| Feature | Detail |
|---------|--------|
| **Credential Storage** | Externalized to `~/.tiger/.env.secrets` (mode 600) |
| **Database Security** | `~/.tiger/db/` with hardened permissions |
| **Audit Logging** | Sanitized skill logs at `~/.tiger/logs/audit.log` |
| **Auto Backup** | Daily SQLite backups, 30-day retention |
| **Secret Rotation** | Built-in 90-day rotation reminders |

### Encrypted Secrets (optional)

```bash
export SECRETS_PASSPHRASE='your-long-passphrase'
node scripts/encrypt-env.js --in .env.secrets --out .env.secrets.enc
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
| `403` quota error | Daily quota exhausted — auto-switches; top up billing or raise `*_TOKEN_LIMIT` |
| `429` rate limit | Auto-switches to next provider in `PROVIDER_ORDER` |
| Z.ai auth fails | Key must be `id.secret` format (from Zhipu/BigModel console) |
| Shell tool disabled | Set `ALLOW_SHELL=true` in `.env` |
| Stuck processes | `pkill -f "node src/cli.js"` then restart |
| Reset token counters | Delete `~/.tiger/db/token_usage.json` and restart |

---

## 📁 Data Directory

After global install, all runtime data lives in `~/.tiger/`:

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
