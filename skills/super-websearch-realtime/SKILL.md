---
name: "super-websearch-realtime"
description: "Performs priority live web searches using the web_search_preview tool to retrieve real-time information from the internet. Use when the user asks about current events, breaking news, live data, recent updates, or any question requiring up-to-date information beyond the model's training cutoff."
allowed-tools: "web_search_preview"
---

# Super Web Search Realtime

Retrieves real-time information from the web using the `web_search_preview` tool. Prioritizes recency and authoritative sources.

## Workflow

1. **Search**: Invoke `web_search_preview` with the user's query.
2. **Evaluate sources**: Prefer the most recent and authoritative results.
3. **Summarize**: Present findings clearly in the user's language.
4. **Flag gaps**: Indicate when information may be incomplete or outdated.

## Fallback

If `web_search_preview` is unavailable (model does not support it), respond using internal knowledge and clearly state the answer is **not based on real-time data**.

## Notes

- Always attempt `web_search_preview` before falling back to internal knowledge.
- Respond in the same language as the user.
