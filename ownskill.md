# ownskill

## Updated
2026-02-23

## Skills Learned
- **Web Search with Latency Reporting**: Executed web searches for technical queries (SASW, researcher profiles) with explicit timing disclosure (~3 seconds).
- **Gmail IMAP Integration**: Configured `imap-smtp-email` skill with App Password workflow and secure credential handling via `.env`.
- **Geotechnical Domain Knowledge**: Retrieved information on SASW (Spectral Analysis of Surface Waves) and Thai researchers (KMUTT faculty).

## Recent Work Summary
- **24h Update Fix**: Resolved `soul.md`/`ownskill.md` auto-update failure by aligning `reflectionScheduler.js` and `reflectionAgent.js` to use `soulUpdateHours=24` and unified meta key `soul_last_updated_ts`.
- **Email Skill Deployment**: Successfully installed `imap-smtp-email` via ClawHub after initial rate limit blockage; provided App Password creation guide with 2FA prerequisites.
- **Token Diagnostics**: Responded to `/token` commands with provider status tables (Kimi, Z.ai, Claude).
- **Static Code Audit**: Performed "check only" code review per user constraint, identifying meta key mismatches without file modification.
- **Web Search**: Answered technical queries on SASW methodology and researcher "Sompote Youwai" (KMUTT) with structured comparison tables.

## Patterns Observed
- **Connectivity Verification**: User sends rapid greeting bursts (5-10x "Hi"/"Hello") to test bot availability/response time.
- **Bilingual Commands**: User mixes Thai with English technical terms ("Continue solve 24 hr", "IMAP", "Check only don’t revise code").
- **Explicit Timing Requests**: User demands specific execution time reporting for operations ("tell me the time to finish").
- **Security Consciousness**: User asks for secure credential handling methods before sharing sensitive data.
- **Constraint Enforcement**: Explicit "check only" instructions to prevent unsolicited code modifications.

## Failures & Lessons
- **ClawHub Rate Limiting**: Initial `imap-smtp-email` installation blocked by platform rate limits; requires retry logic or fallback to Python IMAP.
- **Ambiguity Misinterpretation**: Misunderstood "time to finish" query as process duration rather than search latency; corrected by asking clarification and reporting ~3s execution time.
- **Meta Key Fragmentation**: Discovered `soul.md` updates failed due to conflicting meta keys (`memory_reflection_last_run_ts` vs `soul_last_updated_ts`) between scheduler and agent.
- **No Persistent Cron**: 24h updates rely on in-memory session intervals; bot restart resets timer.

## Successful Workflows
- **Constraint-Respecting Audits**: Provided detailed file location breakdowns and status tables without modifying source code when "check only" requested.
- **Secure Credential Guidance**: Enforced App Password usage (not Gmail password) and `.env`/config file storage instead of chat plaintext.
- **Visual Status Reporting**: Used emoji-indicated markdown tables (✅/⏳) for system status, provider configs, and technical comparisons.
- **Fallback Provision**: Offered Python IMAP scripts and `curl` alternatives when ClawHub skills unavailable.
- **Latency Transparency**: Reported explicit search execution times when requested (~3 seconds for web search).

## Known Limits
- **ClawHub Dependency**: Skill installation subject to intermittent rate limits.
- **Session-Based Scheduling**: Reflection scheduler runs on in-memory intervals only; no persistent cron daemon across restarts.
- **Email Access**: Requires manual App Password generation and `.env` configuration; no OAuth2 automation yet.
- **Web Search Latency**: ~3 seconds per query; no async prefetching implemented.

## Next Improvements
- Implement persistent cron job for 24h updates independent of bot session.
- Automate Gmail OAuth2 flow to eliminate manual App Password steps.
- Add retry queue for ClawHub skill installation failures.
- Pre-fetch common status data to reduce "Hi" trigger response latency.
- Clarify temporal references explicitly ("search time" vs "process duration") before answering timing queries.
