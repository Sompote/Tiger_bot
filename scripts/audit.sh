#!/bin/bash
# Tiger Audit Logger
# Logs skill usage with sanitization (no secrets)
# Format: TIMESTAMP | SKILL | ACTION | STATUS | USER_HASH

TIGER_HOME="${TIGER_HOME:-$HOME/.tiger}"
AUDIT_LOG="$TIGER_HOME/logs/audit.log"
MAX_LOG_SIZE=10485760  # 10MB
MAX_LOG_FILES=5

# Create log directory
mkdir -p "$(dirname "$AUDIT_LOG")"
chmod 700 "$(dirname "$AUDIT_LOG")"

# Rotate logs if too large
rotate_logs() {
    if [ -f "$AUDIT_LOG" ] && [ $(stat -f%z "$AUDIT_LOG" 2>/dev/null || stat -c%s "$AUDIT_LOG" 2>/dev/null || echo 0) -gt $MAX_LOG_SIZE ]; then
        for i in $(seq $MAX_LOG_FILES -1 1); do
            [ -f "$AUDIT_LOG.$i" ] && mv "$AUDIT_LOG.$i" "$AUDIT_LOG.$((i+1))"
        done
        [ -f "$AUDIT_LOG" ] && mv "$AUDIT_LOG" "$AUDIT_LOG.1"
        touch "$AUDIT_LOG"
        chmod 600 "$AUDIT_LOG"
    fi
}

# Log function
log_audit() {
    rotate_logs
    
    local skill="$1"
    local action="$2"
    local status="$3"
    local timestamp=$(date -Iseconds)
    local user_hash=$(echo "$USER@$(hostname)" | sha256sum | cut -d' ' -f1 | head -c16)
    
    # Sanitize: remove potential secrets from action
    local sanitized_action=$(echo "$action" | sed -E 's/(api[_-]?key|token|password|secret)[=:][^ ]+/\1=***/gi')
    
    echo "[$timestamp] | $skill | $sanitized_action | $status | $user_hash" >> "$AUDIT_LOG"
    chmod 600 "$AUDIT_LOG"
}

# Example usage:
# log_audit "nano-banana-pro-2" "generate_image --prompt '...'" "success"

# If called directly, show usage
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    echo "Tiger Audit Logger"
    echo "Usage: source $0 && log_audit <skill> <action> <status>"
    echo ""
    echo "Recent audit entries:"
    [ -f "$AUDIT_LOG" ] && tail -20 "$AUDIT_LOG" || echo "(no entries yet)"
fi