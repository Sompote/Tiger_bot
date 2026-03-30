---
name: "duckduckgo-search"
description: "Performs privacy-friendly web searches using DuckDuckGo to retrieve real-time information. Use when the user needs to search for current events, documentation, tutorials, news, images, videos, or any information requiring web search. Supports text, news, image, video, and map searches."
allowed-tools: "Bash(duckduckgo-search:*), Bash(python:*), Bash(pip:*), Bash(uv:*)"
---

# DuckDuckGo Web Search

Searches the web via the `duckduckgo-search` Python library. No API key required.

## Setup

```bash
uv pip install duckduckgo-search
```

## Text Search (most common)

```bash
python -c "
from duckduckgo_search import DDGS

with DDGS() as ddgs:
    results = list(ddgs.text('Python tutorial', max_results=5))
    for r in results:
        print(f\"Title: {r['title']}\")
        print(f\"URL: {r['href']}\")
        print(f\"Snippet: {r['body']}\")
        print('---')
"
```

**Key parameters:** `region` (`us-en`, `cn-zh`, `wt-wt`), `safesearch` (`on`, `moderate`, `off`), `timelimit` (`d`, `w`, `m`, `y`), `max_results`.

## News Search

```bash
python -c "
from duckduckgo_search import DDGS

with DDGS() as ddgs:
    results = list(ddgs.news('AI technology', timelimit='d', max_results=5))
    for r in results:
        print(f\"{r['title']} — {r['source']} ({r['date']})\")
        print(f\"  {r['url']}\")
"
```

## Image Search

```bash
python -c "
from duckduckgo_search import DDGS

with DDGS() as ddgs:
    results = list(ddgs.images('cute cats', max_results=5))
    for r in results:
        print(f\"{r['title']}: {r['image']}\")
"
```

**Image parameters:** `size` (`Small`, `Medium`, `Large`, `Wallpaper`), `type_image` (`photo`, `clipart`, `gif`, `transparent`), `layout` (`Square`, `Tall`, `Wide`).

## Video Search

```bash
python -c "
from duckduckgo_search import DDGS

with DDGS() as ddgs:
    results = list(ddgs.videos('Python programming', max_results=5))
    for r in results:
        print(f\"{r['title']} ({r.get('duration', 'N/A')}) — {r['content']}\")
"
```

## Error Handling

```bash
python -c "
from duckduckgo_search import DDGS
from duckduckgo_search.exceptions import DuckDuckGoSearchException

try:
    with DDGS() as ddgs:
        results = list(ddgs.text('test query', max_results=5))
        print(f'Found {len(results)} results')
except DuckDuckGoSearchException as e:
    print(f'Search error: {e}')
"
```

## Notes

- Add `time.sleep(1)` between batch requests to avoid rate limiting.
- Use `max_results=5` for quick lookups; increase only when needed.
- Proxy support: `DDGS(proxy='http://127.0.0.1:7890')`.
