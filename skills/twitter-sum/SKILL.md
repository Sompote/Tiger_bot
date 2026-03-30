---
name: "twitter"
description: "Monitors X (Twitter) trends, searches tweets, retrieves user information, and analyzes trending topics via Clawdbot's Twitter API v2 integration. Use when the user asks to search Twitter, find tweets, check trending topics, look up a Twitter user, or analyze hashtag performance."
---

# X (Twitter) Trends

## Overview

Interacts with X (Twitter) via Clawdbot's Twitter API v2 integration. Supports trend monitoring, tweet search, user lookup, hashtag analytics, and cross-region trend comparison.

## Inputs

- `woeid` — Where On Earth ID for location-based trends (e.g., `1` for worldwide, `23424977` for USA).
- `query` — Search query (supports Twitter search operators like `from:`, `-is:retweet`).
- `username` or `userId` — Twitter user identifier.
- `hashtag` — Hashtag without the `#` symbol.

## Actions

### Get trending topics

```json
{
  "action": "getTrends",
  "woeid": 1,
  "limit": 20
}
```

### Get trends by country

```json
{
  "action": "getTrendsByCountry",
  "country": "US",
  "limit": 10
}
```

### Search tweets

```json
{
  "action": "searchTweets",
  "query": "AI technology",
  "maxResults": 50,
  "sortBy": "recent"
}
```

### Search with filters

```json
{
  "action": "searchTweets",
  "query": "from:elonmusk -is:retweet",
  "maxResults": 20,
  "includeReplies": false
}
```

### Get user info

```json
{
  "action": "userInfo",
  "username": "OpenAI"
}
```

### Get user timeline

```json
{
  "action": "userTimeline",
  "username": "OpenAI",
  "limit": 20,
  "includeRetweets": false
}
```

### Analyze hashtag

```json
{
  "action": "analyzeHashtag",
  "hashtag": "AI",
  "timeframe": "24h"
}
```

### Get trend analytics

```json
{
  "action": "trendAnalytics",
  "trend": "ChatGPT",
  "includeVolume": true,
  "includeSentiment": true
}
```

### Compare trends across regions

```json
{
  "action": "compareTrends",
  "locations": ["US", "UK", "JP"],
  "limit": 10
}
```

### Get available locations

```json
{
  "action": "availableLocations"
}
```

## Workflow Example

To analyze a trending topic end-to-end:

1. **Get trends** for a location (`getTrends` or `getTrendsByCountry`).
2. **Pick a trend** from the results.
3. **Search tweets** about it (`searchTweets` with the trend as query).
4. **Analyze sentiment** (`trendAnalytics` with `includeSentiment: true`).
5. **Verify** results are non-empty before presenting to the user.
