# 🐯 Tiger Agent

Made by **AI Research Group**  
**Department of Civil Engineering**  
**King Mongkut's University of Technology Thonburi (KMUTT)**

## 🐯 What is Tiger Bot?

**Tiger Bot** is an AI Agent Framework developed by the **AI Research Group, Department of Civil Engineering, King Mongkut's University of Technology Thonburi (KMUTT)**.

It's not just another chatbot—it's a **"Cognitive Agent"** with long-term memory, self-learning capabilities, and autonomous task execution.

### 🎯 Key Differentiators

| Feature | Tiger Bot | Generic AI Assistants |
|---------|-----------|---------------------|
| **Memory** | Persistent lifetime memory (Vector DB) | Forgets when session ends |
| **Learning** | Self-training every 12 hours | Static, never improves |
| **Security** | Audit logs + Encryption + Hardened perms | No audit trail |
| **Channels** | CLI + Telegram simultaneously | Single channel only |
| **Execution** | Chains multiple skills autonomously | Single command only |

### 💡 Use Cases

1. **Research Assistant** – Extracts YouTube transcripts, searches web, generates reports automatically
2. **Social Media Manager** – Posts to Facebook, manages Telegram, monitors multiple platforms
3. **Secure Data Guardian** – Encrypted storage, automated backups, credential protection
4. **Personal AI** – Learns user patterns, improves recommendations over time through semantic memory

### 🚀 Why Tiger Over Clawbot?

While **OpenClaw/Clawbot** executes one skill and stops, **Tiger** thinks in workflows:

```
Example: "Summarize this YouTube video"
→ Clawbot: Extracts transcript → Done
→ Tiger: Extracts transcript → Searches relevant sources → 
         Validates facts → Generates conclusion → 
         Stores in memory for future reference
```

- Developers needing enterprise-grade automation
- Researchers handling large-scale data analysis
- Privacy-conscious users wanting local, self-hosted AI
- Power users who need AI that *actually remembers* context across sessions

---

---

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

---

## 🚀 Quick Start (First Run)

```bash
npm install
npm run setup
npm run cli
```

CLI exit commands: `/exit` or `/quit`.

---

## 🔒 Security First

Tiger is built with **security-by-default** principles:

| Feature | Implementation |
|---------|---------------|
| 🔐 **Credential Storage** | Externalized to `.env.secrets` (gitignored) |
| 🛡️ **Database Security** | `~/.tiger/memory/` with `chmod 600` permissions |
| 📝 **Audit Logging** | Sanitized skill usage logs (`~/.tiger/logs/audit.log`) |
| 💾 **Auto Backup** | Daily SQLite backups with 30-day retention |
| 🔒 **Git Hygiene** | Automatic protection for secrets, tokens, and runtime data |
| 🔄 **Secret Rotation** | Built-in 90-day rotation reminders |

### Quick Security Setup

```bash
# 1. Protect secrets
cp .env.example .env
cp .env.secrets.example .env.secrets
chmod 600 .env.secrets

# 2. Enable encrypted secrets (optional but recommended)
export SECRETS_PASSPHRASE='your-long-passphrase'
node scripts/encrypt-env.js --in .env.secrets --out .env.secrets.enc

# 3. Verify database security
npm run memory:stats
```

**[📖 Full Security Documentation →](docs/SECURITY_IMPROVEMENTS.md)**

---

## 📋 Requirements

- Node.js 18+ (20+ recommended)
- npm
- Python 3 (used by SQLite memory helper at `scripts/sqlite_memory.py`)

---

## 🎮 Run Modes

| Mode | Command | Use Case |
|------|---------|----------|
| **CLI** | `npm run cli` | Interactive terminal |
| **Telegram** | `npm run telegram` | Bot foreground |
| **Background** | `npm run telegram:bg` | 24/7 daemon |
| **Stop BG** | `npm run telegram:stop` | Kill daemon |

Background logs: `logs/telegram-supervisor.log`

---

## 🔧 Setup Wizard

`npm run setup` creates:
- `.env` (non-secret settings)
- `.env.secrets` (API keys/tokens, gitignored) or `.env.secrets.enc` (encrypted)

Setup options:
- Persistent vs volatile vector DB (`./db/memory.sqlite` vs `/tmp/`)
- Optional `sqlite-vec` bootstrap
- Optional encrypted secrets file

Manual setup alternative:
```bash
cp .env.example .env
```

---

## 🔑 Environment Variables

Key variables:
- `KIMI_PROVIDER` (`moonshot` or `code`)
- `MOONSHOT_API_KEY` / `KIMI_CODE_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `ALLOW_SHELL` (default `false`)
- `ALLOW_SKILL_INSTALL` (default `false`)
- `VECTOR_DB_PATH` (default `./db/memory.sqlite`)
- `DATA_DIR` (default `./data`)

See `.env.example` for complete list.

### Provider Examples

**Moonshot/Open Platform:**
```env
KIMI_PROVIDER=moonshot
MOONSHOT_API_KEY=your_key
KIMI_BASE_URL=https://api.moonshot.cn/v1
KIMI_CHAT_MODEL=kimi-k1
```

**Kimi Code:**
```env
KIMI_PROVIDER=code
KIMI_CODE_API_KEY=your_key
KIMI_BASE_URL=https://api.kimi.com/coding/v1
KIMI_CHAT_MODEL=k2p5
```

---

## 🧠 Context and Memory

Tiger loads these into system context every turn:
- `data/soul.md`
- `data/human.md`
- `data/human2.md`
- `data/ownskill.md`

Auto-refresh cycles:
- `ownskill.md`: Every `OWN_SKILL_UPDATE_HOURS` (default 24)
- `soul.md`: Every `SOUL_UPDATE_HOURS` (default 24)
- Reflection cycle: Every `REFLECTION_UPDATE_HOURS` (default 12)

Storage:
- Conversations: `DB_PATH` (JSON)
- Vector memory: `VECTOR_DB_PATH` (SQLite)
- Auto-ingestion: Every `MEMORY_INGEST_EVERY_TURNS` turns

### SQLite Vector Setup

Tiger works out-of-the-box with SQLite. Optional `sqlite-vec` acceleration:

```env
VECTOR_DB_PATH=./db/memory.sqlite
SQLITE_VEC_EXTENSION=/path/to/sqlite_vec
```

Quick commands:
```bash
npm run memory:init      # Initialize
npm run memory:stats     # Show status
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

Skills directory: `./skills`

---

## 🆚 Tiger vs OpenClaw

| Feature | **Tiger** 🐯 | **OpenClaw** 🔧 |
|---------|-------------|-----------------|
| **Identity** | Persistent AI persona | Skill marketplace |
| **Memory** | 4-file text + SQLite vector | Skill-based only |
| **Self-Training** | ✅ 12h auto-reflection | ❌ Manual only |
| **Skill Orchestration** | Multi-skill pipelines | Single execution |
| **Context Retention** | ✅ Cross-session | Session-only |
| **Security Focus** | ✅ Encryption + audit logs | Basic |
| **Installation** | `git clone + setup` | `clawhub install` |

**Best For:**
- **Tiger**: Personal AI assistant with persistent memory
- **OpenClaw**: Quick tool library access

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| `401` auth error | Check provider key matches `KIMI_PROVIDER` |
| `403` coding agent | Provider-side restriction for token type |
| `Shell tool disabled` | Set `ALLOW_SHELL=true` |
| Network timeout | Check DNS, reduce `KIMI_TIMEOUT_MS` |
| Stuck processes | `pkill -f "node src/cli.js" && npm run cli` |

---

## 📄 Security Details

### Secret File Split (Recommended)

- **`.env`**: Non-secrets (settings, paths)
- **`.env.secrets`**: API keys (gitignored, `chmod 600`)

### Encrypted Secrets (At-Rest)

Protects secrets if repo/disk is stolen:

```bash
export SECRETS_PASSPHRASE='your-long-passphrase'
node scripts/encrypt-env.js --in .env.secrets --out .env.secrets.enc
rm .env.secrets
```

### Additional Security Features

- **Audit Logging**: All skill calls logged with sanitized params
- **Auto Backup**: Daily compressed backups, auto-cleanup after 30 days
- **Git Hooks**: Optional pre-commit secret scanning
- **Process Isolation**: Skills run in controlled environment

**[🔐 See SECURITY_IMPROVEMENTS.md for full details →](docs/SECURITY_IMPROVEMENTS.md)**

---

## 📁 Project Structure

```
tiger/
├── config/           # Externalized config (user.json)
├── data/            # Runtime context files (gitignored)
├── db/              # SQLite databases (gitignored)
├── docs/            # Documentation
│   └── SECURITY_IMPROVEMENTS.md
├── scripts/         # Utilities
│   ├── audit.sh     # Audit logging
│   ├── backup.sh    # Backup automation
│   └── sqlite_memory.py
├── skills/          # ClawHub skills (gitignored)
├── src/             # Source code
├── .env.example     # Template
├── .env.secrets.example  # Secrets template
└── README.md
```

---

## 👥 Authors

**Made with ❤️ by AI Research Group**  
Department of Civil Engineering  
King Mongkut's University of Technology Thonburi (KMUTT)  
Bangkok, Thailand

---

*[虎 - Hǔ - The Tiger: Powerful, agile, and relentless in pursuit of goals]*
---

---

---

## 📜 License

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

*[虎 - Hǔ - The Tiger: Powerful, agile, and relentless in pursuit of goals]*
