# Tiger Agent

Made by AI Research Group KMUTT.

Practical local AI agent with:
- CLI chat
- Telegram bot mode
- Local conversation memory
- Tool calling (files, shell, skills, sub-agents)
- ClawHub skill search/install support
- OpenClaw-style tool loop (assistant -> tool calls -> tool results -> final synthesis)

## Requirements

- Node.js 18+ (recommended: 20+)
- npm

## Installation (Step by Step)

1. Clone repository:

```bash
git clone <your-repo-url> tiger
cd tiger
```

2. Install dependencies:

```bash
npm install
```

3. Create env file:

```bash
cp .env.example .env
```

4. Edit `.env` with your provider and key:

- `KIMI_PROVIDER=moonshot` or `code`
- Moonshot key: `MOONSHOT_API_KEY=...`
- or Kimi Code key: `KIMI_CODE_API_KEY=...`
- (Recommended) `KIMI_TIMEOUT_MS=30000`

5. (Optional) Enable shell tools:

```env
ALLOW_SHELL=true
```

6. Start CLI:

```bash
npm run cli
```

7. Verify it works:

- Type: `hello`
- Exit with: `/exit`

## Configuration

Copy env template (if not already done):

```bash
cp .env.example .env
```

Edit `.env` and set at least:

- `KIMI_PROVIDER=moonshot` or `code`
- Provider key:
  - Moonshot: `MOONSHOT_API_KEY=...`
  - Kimi Code: `KIMI_CODE_API_KEY=...` (or `KIMI_API_KEY`)
- Optional:
  - `KIMI_TIMEOUT_MS=30000`
  - `ALLOW_SHELL=true` to let the agent run shell commands
  - `TELEGRAM_BOT_TOKEN=...` for Telegram mode

## Run

CLI:

```bash
npm run cli
```

Telegram bot:

```bash
npm run telegram
```

## Provider Notes

### Moonshot Open Platform (recommended for custom apps)

```env
KIMI_PROVIDER=moonshot
MOONSHOT_API_KEY=your_key
KIMI_BASE_URL=https://api.moonshot.cn/v1
KIMI_CHAT_MODEL=kimi-k1
KIMI_ENABLE_EMBEDDINGS=true
KIMI_EMBED_MODEL=kimi-embedding-v1
```

### Kimi Code mode

```env
KIMI_PROVIDER=code
KIMI_CODE_API_KEY=your_key
KIMI_BASE_URL=https://api.kimi.com/coding/v1
KIMI_CHAT_MODEL=k2p5
KIMI_USER_AGENT=KimiCLI/0.77
KIMI_ENABLE_EMBEDDINGS=false
KIMI_TIMEOUT_MS=30000
```

Note: Kimi Code access is policy-restricted by provider; some custom clients may be blocked even with valid keys.
Tiger normalizes provider-style refs automatically:
- `kimi-coding/k2p5` -> `k2p5`
- `moonshot/kimi-k2.5` -> `kimi-k2.5`

## Skills (ClawHub)

Tiger includes:
- `clawhub_search` tool
- `clawhub_install` tool

Also install CLI locally:

```bash
npm install clawhub
```

If registry auth is needed:

```bash
npx clawhub login
```

Skills are installed under `./skills`.

## Common Commands

- Start CLI: `npm run cli`
- Exit CLI: `/exit`
- Show local skills: ask Tiger to run `list_skills`
- Read a skill: ask Tiger to run `load_skill`

## Troubleshooting

- `401 Invalid Authentication`:
  - wrong/revoked key
  - wrong provider key type
  - extra spaces/quotes in env values

- `403 ... only available for Coding Agents`:
  - Kimi Code policy restriction for your client type

- `thinking is enabled but reasoning_content is missing`:
  - fixed in current code by forwarding `reasoning_content` across tool-call turns

- `Shell tool disabled`:
  - set `ALLOW_SHELL=true` in `.env`
  - restart process

- `Kimi API network error: fetch failed` or `Kimi API timeout after ...`:
  - server cannot reach/resolve provider endpoint (DNS/network issue)
  - common cause on VPS: `EAI_AGAIN` DNS resolver failure
  - check quickly:
    - `ping -c 2 1.1.1.1`
    - `ping -c 2 api.kimi.com`
    - `cat /etc/resolv.conf`
  - reduce debug wait time with `KIMI_TIMEOUT_MS=10000`

- CLI seems stuck / multiple Tiger jobs:
  - avoid `Ctrl+Z` while in chat
  - stop all old sessions:
    - `pkill -f "node src/cli.js|npm run cli"`
  - restart one clean session: `npm run cli`

## Security

- Never commit `.env`.
- Rotate leaked API keys immediately.
