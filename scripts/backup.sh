#!/bin/bash
# Tiger Database Backup Script
# Runs: Daily via cron or manual
# Backs up: SQLite memory DB, config files

set -e

TIGER_HOME="${TIGER_HOME:-$HOME/.tiger}"
BACKUP_DIR="$TIGER_HOME/backup"
DB_PATH="$TIGER_HOME/memory/tiger_memory.db"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

echo "🐯 Tiger Backup Started: $DATE"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup SQLite database (with WAL if exists)
if [ -f "$DB_PATH" ]; then
    BACKUP_FILE="$BACKUP_DIR/tiger_memory_$DATE.db"
    sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"
    gzip "$BACKUP_FILE"
    echo "✅ Database backed up: ${BACKUP_FILE}.gz"
else
    echo "⚠️ Database not found at $DB_PATH"
fi

# Backup config (excluding secrets)
if [ -d "$TIGER_HOME/config" ]; then
    CONFIG_BACKUP="$BACKUP_DIR/config_$DATE.tar.gz"
    tar -czf "$CONFIG_BACKUP" -C "$TIGER_HOME" config/ 2>/dev/null || true
    echo "✅ Config backed up: $CONFIG_BACKUP"
fi

# Cleanup old backups (keep last 30 days)
find "$BACKUP_DIR" -name "*.gz" -type f -mtime +$RETENTION_DAYS -delete
echo "🧹 Cleaned backups older than $RETENTION_DAYS days"

# Log backup event
logger -t tiger-backup "Backup completed: $DATE"
echo "✅ Backup completed successfully"