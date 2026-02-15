# 🔒 Security Policy

## Credential Storage

| Location | Purpose | Protection |
|----------|---------|------------|
| `.env` | Local secrets | Gitignored, 600 permissions |
| `.clawhub/lock.json` | Auth tokens | Gitignored, encrypt recommended |
| `~/.tiger/memory/` | Database | 700 dir, 600 file permissions |

## Database Security

```bash
# Database location
~/.tiger/memory/tiger_memory.db

# Permissions
chmod 700 ~/.tiger
chmod 600 ~/.tiger/memory/tiger_memory.db
```

## Token Rotation Schedule

| Token Type | Rotation | Last Check |
|------------|----------|------------|
| Gemini API | 90 days | Manual |
| Telegram Bot | 90 days | Manual |
| X Bearer | 90 days | Manual |

## Incident Response

If credentials leaked:
1. Revoke tokens immediately at provider console
2. Rotate in `.env` file
3. Check `~/.tiger/memory/` access logs (if enabled)
