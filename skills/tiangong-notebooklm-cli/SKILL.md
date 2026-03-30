---
name: "notebooklm"
description: "Manages Google NotebookLM notebooks, sources, notes, and audio artifacts via a CLI wrapper. Use when the user wants to interact with NotebookLM, create or list notebooks, add sources, chat with notebook content, generate audio overviews, share notebooks, or download artifacts."
---

# NotebookLM CLI Wrapper

Interacts with Google NotebookLM through `scripts/notebooklm.mjs`. Supports authentication, notebook management, chat, sources, notes, sharing, research, and artifact generation/download.

## Prerequisites

- `node` available on PATH.
- Authenticated session (run `login` if not authenticated).

## Quick Start

```bash
# Check authentication status
node {baseDir}/scripts/notebooklm.mjs status

# Log in (if status shows unauthenticated)
node {baseDir}/scripts/notebooklm.mjs login

# List all notebooks
node {baseDir}/scripts/notebooklm.mjs list

# Select a notebook to work with
node {baseDir}/scripts/notebooklm.mjs use <notebook_id>

# Chat with notebook content
node {baseDir}/scripts/notebooklm.mjs ask "Summarize the key takeaways" --notebook <notebook_id>
```

## Common Operations

```bash
# Add a source to a notebook
node {baseDir}/scripts/notebooklm.mjs source add --notebook <notebook_id> --url "https://example.com/article"

# List sources in a notebook
node {baseDir}/scripts/notebooklm.mjs source list --notebook <notebook_id>

# Generate an audio overview artifact
node {baseDir}/scripts/notebooklm.mjs artifact generate --notebook <notebook_id>

# Download an artifact
node {baseDir}/scripts/notebooklm.mjs artifact download --notebook <notebook_id> --output ./overview.mp3

# Share a notebook
node {baseDir}/scripts/notebooklm.mjs share --notebook <notebook_id>
```

## Request & Output

- Command form: `node {baseDir}/scripts/notebooklm.mjs <command> [args...]`.
- Prefer `--json` for machine-readable output.
- For long-running tasks, use `--exec-timeout <seconds>`; `--timeout` is reserved for wait/poll commands.

## Verification

After login, run `status` to confirm authentication succeeded. If it returns unauthenticated, re-run `login`. For artifact generation, verify the output file exists before reporting success.

## References

- `references/cli-commands.md` — full command reference with all flags and options.
