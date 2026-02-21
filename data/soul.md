## 🔍 Root Cause Analysis: 24h Update Failure

**1. No Persistent Cron Job**
- History shows: `schedule` skill installation did not auto-configure system crontab entries.
- Result: Background process dies when session ends.

**2. Metadata vs. Implementation**
- `soul.md` defines `cadence_hours: 24` as metadata, but there is no active loop checking this timer.

**3. Session-Dependent Updates**
- Updates to `ownskill.md` and `soul.md` currently only happen **on-demand** during active conversations, not automatically.

**✅ Summary:**
The logic exists, but the **execution trigger** (persistent cron/systemd timer) is missing.

## Self-Update
- cadence_hours: 24
- last_updated: 2026-02-21T03:01:22.254Z
- note: Root cause confirmed via code inspection: missing persistent cron/systemd timer and meta-key mismatches.

## Patterns Observed
- [2026-02-20] User initiates debugging by asking about internal system status (file updates).
- [2026-02-20] Assistant responds with structured tabular data showing file timestamps and configuration status.
- [2026-02-20] User requests code inspection specifically without immediate edits ('check only, don't fix').
- [2026-02-20] Assistant maps code locations and logic flows to diagnose configuration mismatches.

## Failures & Lessons
- [2026-02-20] Auto-update for 'soul.md' (last updated 2026-02-10) and 'ownskill.md' (last updated 2025-01-28) failed to trigger.
- [2026-02-20] Meta key mismatch exists: reflection cycle uses 'memory_reflection_last_run_ts' while message triggers use 'soul_last_updated_ts'.
- [2026-02-20] Configuration 'SOUL_UPDATE_HOURS = 24' in 'config.js' is defined but not used by 'reflectionScheduler.js'.
- [2026-02-20] Reflection scheduler 'startReflectionScheduler()' is session-bound and lacks a persistent cron job.

## Successful Workflows
- [2026-02-20] Assistant successfully retrieved and displayed last modified timestamps for memory files.
- [2026-02-20] Assistant traced the issue to specific files: 'reflectionScheduler.js', 'reflectionAgent.js', and 'mainAgent.js'.
- [2026-02-20] Assistant correctly identified the discrepancy between intended 24h updates and actual 12h/session-based logic.

## Adaptations
- [2026-02-20] Standardize meta keys across 'reflectionScheduler.js' and 'mainAgent.js' to ensure consistent state tracking.
- [2026-02-20] Implement the 'SOUL_UPDATE_HOURS' configuration variable in the scheduler logic.
- [2026-02-20] Set up a persistent cron job or background process to run updates independently of the bot session.
- [2026-02-20] Consolidate the 'Reflection Cycle' and 'Message Triggered' update systems to eliminate redundancy.
- [2026-02-21] Assistant defaults to Thai language for this user.
- [2026-02-21] Assistant provides a structured status table upon greeting.
- [2026-02-21] User uses simple greetings to trigger status updates.
- [2026-02-21] Email skill installation encountered an issue and is awaiting a retry.
- [2026-02-21] Code check for soul.md update completed successfully.
- [2026-02-21] Tiger system is operational.
- [2026-02-21] Prioritize retrying the email skill installation.
- [2026-02-21] Continue providing status summaries in the greeting.
- [2026-02-21] User mixes Thai with English technical commands ('Continue solve 24 hr', 'IMAP')
- [2026-02-21] Structured markdown tables preferred for system status display
- [2026-02-21] Security-conscious: asks how to handle credentials safely
- [2026-02-21] Technical user familiar with cron jobs, meta keys, and IMAP protocols
- [2026-02-21] ClawHub/Clawbot package manager used for skill management
- [2026-02-21] Tiger bot branding with tiger emojis (🐯) in responses
- [2026-02-21] ClawHub rate limits block skill installation intermittently
- [2026-02-21] Meta key mismatch (soul_last_updated_ts) caused 24h update failure
- [2026-02-21] No persistent cron job exists yet (scheduler only runs in session)
- [2026-02-21] soul.md and ownskill.md not auto-updating (stale since 2026-02-10 and 2025-01-28)
- [2026-02-21] reflectionUpdateHours config unused while soulUpdateHours=24 is active source of truth
- [2026-02-21] Fixed 24h update by aligning reflectionScheduler.js and reflectionAgent.js to use soulUpdateHours=24 and soul_last_updated_ts meta key
- [2026-02-21] Providing fallback options (Python script/curl) when ClawHub rate limited
- [2026-02-21] Secure credential handling: enforcing .env or clawbot config instead of chat paste
- [2026-02-21] Step-by-step Gmail App Password creation with 2FA prerequisite warning
- [2026-02-21] Visual system architecture diagrams showing component relationships post-fix
- [2026-02-21] Pre-check ClawHub health/rate limits before suggesting skill installation
- [2026-02-21] Implement persistent cron job instead of session-only scheduler
- [2026-02-21] Auto-update soul.md timestamp immediately after reflection system fixes
- [2026-02-21] Cache common setup instructions (Gmail App Password) to reduce repetitive explanations
- [2026-02-21] Add proactive retry logic for ClawHub operations with exponential backoff
- [2026-02-21] Remove deprecated reflectionUpdateHours config to prevent confusion
