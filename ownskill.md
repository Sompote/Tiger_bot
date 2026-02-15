# ownskill

## Updated
2026-02-15

## Skills Learned
- **tiangong-notebooklm-cli** (v0.1.1): NotebookLM CLI wrapper; requires browser OAuth (incompatible with cloud/headless environments)
- **youtube-transcript**: Extracts video transcripts without API keys; effective fallback when NotebookLM auth fails
- **schedule**: Configured for 12-hour self-training automation cycles
- **bird**: X/Twitter search tool (requires X Bearer Token/paid API)
- **search-x**: X/Twitter search via xAI API ($5/month tier)
- **searxng-local-search**: Identified as potential no-API search alternative
- **nano-banana-pro-2**: Gemini 3 Pro image generation; requires GEMINI_API_KEY

## Anthropic Skill Framework Integration

### Core Concepts (From "Building Skills for Claude")

#### 1. **Modular Skill Architecture**
Skills = composable, reusable capabilities with:
- **Single responsibility**: One function per skill
- **Explicit contracts**: Clear input/output schemas
- **Chainability**: Output of Skill A → Input of Skill B

#### 2. **Skill Categories**
```
INPUT          PROCESSING        OUTPUT         UTILITY
─────────────────────────────────────────────────────────
web-search    →  summarize     →  file-writer  →  schedule
file-reader   →  rag-search    →  telegram-out →  memory-store
telegram-in   →  analyze       →  email-send   →  config-manager
```

#### 3. **Structured Output Design**
All skills return machine-readable structures:
```json
{
  "status": "success|error|partial",
  "data": { /* skill-specific output */ },
  "metadata": {
    "timestamp": "2026-02-15T00:00:00Z",
    "skill_version": "1.0.0",
    "execution_time_ms": 1234
  },
  "errors": [ /* if any */ ]
}
```

#### 4. **Error Handling Patterns**
- **Graceful degradation**: Fail to alternatives, not just fail
- **Actionable messages**: Error includes *what to do next*
- **Structured errors**: `{"error_code": "AUTH_FAILED", "fallback": "use_web_search"}`

#### 5. **Context-Aware Execution**
- Skills access conversation context automatically
- No redundant parameter collection
- Respect user preferences (API avoidance, privacy, cloud constraints)

### Skill Orchestration Patterns

#### Sequential Pipeline
```
youtube-transcript → summarize → store-memory
     [extract]          [nlp]        [persist]
```

#### Parallel Execution
```
compare-tools ─┬→ search-tool-A ─┐
               ├→ search-tool-B ─┤→ aggregate-results → table-output
               └→ search-tool-C ─┘
```

#### Conditional Branching
```
user-requests-X ──has-api-key?──┬─yes→ use-X-API
                                └─no──→ use-web-search-fallback
```

## Recent Work Summary
- **X/Twitter Search Audit**: Evaluated 5+ Twitter skills; determined all require paid API access (X API changes 2023). Established web search with `site:x.com` as viable no-API alternative.
- **NotebookLM Integration Attempt**: Installed CLI wrapper but blocked by Google OAuth browser requirement. Documented limitation for cloud environments.
- **YouTube Analysis Workflow**: Deployed `youtube-transcript` → direct analysis pipeline as functional replacement for NotebookLM video processing.
- **Self-Training Automation**: Implemented 12-hour update cycle using `schedule` skill to append learnings to memory files.
- **PDF Processing**: Successfully extracted and processed Anthropic's "Building Skills for Claude" guide using PyPDF2; integrated concepts into skill architecture.
- **Image Generation Setup**: Installed `nano-banana-pro-2` for Gemini 3 Pro image generation; pending GEMINI_API_KEY configuration.

## Known Limits
- **NotebookLM CLI**: Requires interactive browser authentication; no service account or token-based auth available for headless/cloud deployment.
- **X/Twitter Skills**: 100% require paid API keys (X Bearer Token or xAI API); no functional no-API Twitter search skills exist in ClawHub.
- **DuckDuckGo Search**: CAPTCHA blocking automated queries; `super-web-websearch-realtime` preferred but model-dependent.
- **Auth Persistence**: Cannot persist Google OAuth sessions across container/cloud restarts without manual token export.
- **PDF Processing**: Text extraction from PDFs requires Python libraries (PyPDF2/pdfplumber); not native to ClawHub skills yet.

## Next Improvements
- Evaluate **serpapi** or **tavily** skills for better no-API web search reliability
- Test **beautifulsoup4-scraper** for Nitter/X direct parsing (unofficial, TOS-risk)
- Implement **token export workflow** for NotebookLM: user authenticates locally, exports cookie/token, imports to cloud environment
- Research **Google Service Account** support for NotebookLM API (if available)
- Add **persistent-memory** skill for structured learning storage beyond markdown files
- **Skill Chaining**: Build orchestrator skill for automatic pipeline construction
- **PDF Skill**: Create dedicated PDF extraction skill with text/tables/images support
- **Metadata Registry**: Auto-generate skill index with I/O contracts for discoverability

## Patterns Observed
- [2026-02-11] Requests ranked comparisons (🥇🥈🥉 format) before selecting tools
- [2026-02-11] Explicitly avoids API-key requirements when possible (X/Twitter search)
- [2026-02-11] Cloud environment constraints (no browser, CLI-only operations)
- [2026-02-11] Recurring YouTube-to-conclusions workflow preference
- [2026-02-11] Uses both CLI (local-user) and Telegram (8172556270) channels interchangeably
- [2026-02-11] Asks for 'best' options ranked by rating/score
- [2026-02-15] Interested in Anthropic skill-building frameworks & structured outputs
- [2026-02-15] Requires PDF content extraction for documentation processing

## Failures & Lessons
- [2026-02-11] NotebookLM CLI requires browser OAuth - incompatible with cloud environments
- [2026-02-11] X/Twitter official skills universally require paid API keys ($5-5000/month)
- [2026-02-11] duckduckgo-search encounters CAPTCHA blocks in cloud environments
- [2026-02-11] super-web-websearch-realtime requires model-level tool support not always available
- [2026-02-11] Text-based memory files require manual keyword matching vs semantic retrieval
- [2026-02-11] Schedule skill installation does not automatically configure cron jobs
- [2026-02-15] PDF extraction requires external Python libraries (PyPDF2, pdfplumber)
- [2026-02-15] Anthropic skill framework emphasizes structured outputs - need to apply to all returns

## Successful Workflows
- [2026-02-11] youtube-transcript skill extracts video content without authentication
- [2026-02-11] Web search fallback using site:x.com or site:twitter.com queries avoids API limits
- [2026-02-11] Four-file memory system (ownskill.md, soul.md, human.md, human2.md) captures preferences persistently
- [2026-02-11] 12-hour self-training schedule using 'schedule' skill for automated reflection
- [2026-02-11] Tabular comparisons with feature matrices aid user decision-making
- [2026-02-11] SearxNG and web scrapers as no-API alternatives for social media search
- [2026-02-15] PDF extraction via Python (PyPDF2) works for documentation processing
- [2026-02-15] Anthropic skill concepts align well with ClawHub architecture (modular, composable)
