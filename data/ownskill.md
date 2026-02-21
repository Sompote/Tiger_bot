# ownskill

## Updated
2026-02-20

## Skills Learned
- **Code Inspection (Static Analysis)**: Successfully analyzed `reflectionScheduler.js`, `reflectionAgent.js`, and `mainAgent.js` to identify logic discrepancies without modifying code.
- **OpenClaw/ClawHub Ecosystem**: Defined OpenClaw as an AI Skill Marketplace (ClawHub) for agent capabilities.

## Recent Work Summary
- **24h Update Logic Investigation**: Audited reflection cycle code after user request. Identified that `soul.md` and `ownskill.md` are driven by a 12h interval timer and message triggers, ignoring the `SOUL_UPDATE_HOURS = 24` config.
- **Email Skill Attempt**: Searched ClawHub for `imap-smtp-email` but installation failed due to rate limits.
- **API Management**: User requested switch to Kimi API; used `/token` command to verify provider status (Active: `zai`).
- **Code Review Constraint**: Executed "check only" audit per user request, identifying meta key mismatches (`memory_reflection_last_run_ts` vs `soul_last_updated_ts`) and redundant update systems.

## Patterns Observed
- **Connectivity Testing**: User sends repetitive "Hi"/"Hello" messages (often 5-10 in a row) to test bot responsiveness or connectivity.
- **Language Mirroring**: User communicates in Thai/English mix; Assistant defaults to polite Thai responses for this user.
- **Constraint Enforcement**: User explicitly demands "Check only don't revise code" during audits to prevent unsolicited changes.
- **Command Usage**: Uses `/token` to inspect provider configuration and `/api` (or similar) references.

## Failures & Lessons
- **ClawHub Rate Limit**: Installation of `imap-smtp-email` blocked by platform rate limits; need retry mechanism or fallback.
- **Broken Scheduler Logic**: 24h update feature exists in config (`SOUL_UPDATE_HOURS`) but is unused; runtime defaults to 12h in-memory interval.
- **Missed Messages**: Bot failed to respond to multiple greeting bursts and a specific code check request, indicating potential availability or message handling issues.
- **API Key Security**: User shared Kimi API key in plaintext; advised revocation, but behavior suggests user lacks secure key management workflow.

## Successful Workflows
- **Static Code Analysis**: Provided detailed breakdown of file locations (`src/agent/reflectionScheduler.js`), meta key conflicts, and status tables without altering files.
- **Provider Diagnostics**: `/token` command successfully generated a table of active LLM providers, models, and daily limits.
- **Platform Explanation**: Clearly articulated OpenClaw/ClawHub function as a skill marketplace in Thai.

## Known Limits
- **Email Access**: No native email support; reliant on external skills like `imap-smtp-email`.
- **ClawHub**: Subject to rate limits that block skill installation.
- **Reflection System**: `soul.md` and `ownskill.md` updates currently rely on session-based timers or message triggers, not persistent cron jobs.

## Next Improvements
- Fix reflection scheduler to utilize `SOUL_UPDATE_HOURS` config or implement persistent cron.
- Re-attempt `imap-smtp-email` installation once rate limit resets.
- Investigate root cause of unresponded messages (bot availability vs. message handling).
- [2026-02-21] Assistant defaults to Thai language for this user.
- [2026-02-21] Assistant provides a structured status table upon greeting.
- [2026-02-21] User uses simple greetings to trigger status updates.
- [2026-02-21] Email skill installation encountered an issue and is awaiting a retry.
- [2026-02-21] Code check for soul.md update completed successfully.
- [2026-02-21] Tiger system is operational.
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
