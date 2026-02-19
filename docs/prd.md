# Columns — PRD

## Overview

Columns is a single-file browser homepage that displays the current front page links from Hacker News, TechCrunch, and Product Hunt in a three-column layout. Clicking any link opens the destination in a new tab.

## Requirements

- Replace the default browser homepage with a single view of three key tech news sources.
- Zero infrastructure: no server, no build step, no dependencies. One HTML file opened locally.
- Minimal UI: titles and links for all sources; descriptions shown beneath each item for RSS feeds (TechCrunch, Product Hunt) where available.

## Non-requirements

- Real-time or auto-refreshing updates. The user refreshes the page manually.
- Dark mode (deferred to a future iteration).
- Metadata display (scores, comment counts, timestamps, domains).
- Offline support or caching.
- Mobile responsiveness.

## Data sources

| Source | Method | URL | CORS |
|---|---|---|---|
| Hacker News | REST API (Firebase) | `https://hacker-news.firebaseio.com/v0/topstories.json` + per-item fetch | Native CORS support; no proxy needed |
| TechCrunch | RSS feed | `https://techcrunch.com/feed/` | Requires CORS proxy |
| Product Hunt | RSS feed | `https://www.producthunt.com/feed` | Requires CORS proxy |

### CORS proxy

RSS feeds from TechCrunch and Product Hunt do not serve CORS headers. A third-party CORS proxy will be used to fetch them from a local `file://` or `localhost` origin.

Candidate proxies (in order of preference):

1. `https://api.cors.lol/?url=`
2. `https://api.allorigins.win/raw?url=`
3. `https://corsproxy.io/?url=`

If the chosen proxy becomes unreliable, swap the base URL constant to another proxy. The proxy URL must be defined in a single constant at the top of the script so it can be changed in one place.

### Hacker News API detail

1. Fetch `topstories.json` to get an array of item IDs.
2. Take the first 30 IDs.
3. Fetch each item via `https://hacker-news.firebaseio.com/v0/item/{id}.json`.
4. Use the `title` and `url` fields. If `url` is absent (Ask HN, Show HN text posts), link to `https://news.ycombinator.com/item?id={id}` instead.

### RSS / Atom feed parsing

Parse the XML response using the browser's built-in `DOMParser`. Detect the format by checking the root element: `<rss>` for RSS, `<feed>` for Atom. For RSS, extract `<item>` elements and read `<title>`, `<link>` text, and `<description>`. For Atom, extract `<entry>` elements and read `<title>`, `<link rel="alternate">` `href`, and `<content>`. Display up to 30 items per feed.

## Technical specification

### Stack

- Single `.html` file containing inline `<style>` and `<script>` blocks.
- Vanilla JavaScript (no frameworks, no libraries).
- CSS grid for layout.
- Browser-native `fetch`, `DOMParser`, and `Promise.all`.

### Layout

```
+-------------------+-------------------+-------------------+
|   Hacker News     |   TechCrunch      |   Product Hunt    |
+-------------------+-------------------+-------------------+
| 1. Link title     | 1. Link title     | 1. Link title     |
|                   |    Description…   |    Description…   |
| 2. Link title     | 2. Link title     | 2. Link title     |
|                   |    Description…   |    Description…   |
| ...               | ...               | ...               |
+-------------------+-------------------+-------------------+
```

- Three equal-width columns using `display: grid; grid-template-columns: 1fr 1fr 1fr;`.
- Each column contains a heading (`<h2>`) and an ordered list (`<ol>`) of links.
- All links open in a new tab (`target="_blank"` and `rel="noopener noreferrer"`).
- Columns scroll independently if content overflows (each column gets `overflow-y: auto` with a max height of the viewport).
- Minimum width of each column should be 400px.
- If viewport shrinks too much to show all three columns at the same time, the user can scroll horizontally to navigate between the columns. 

### Styling

- Light background, dark text.
- Inter font.
- Links styled with a subtle colour; underline on hover only.
- Minimal spacing. No decorative elements.
- Column headings left-aligned.

### Loading and error states

- While a feed is loading, display "Loading…" in the relevant column.
- If a fetch fails (network error, proxy down, timeout), display "Failed to load [Source Name]" in the relevant column with no retry logic.
- Each column loads independently — a failure in one does not block the others.

### Fetch behaviour

- All three feeds are fetched in parallel on page load using `Promise.all` (or independent promises).
- No caching. Every page load fetches fresh data.
- Fetch timeout: 10 seconds per request. If exceeded, treat as an error.

## File structure

```
columns.html    ← the entire application
```

## Testing

End-to-end tests verify the full rendering pipeline using Playwright with mocked network requests.

- **Run tests:** `npm test`
- **Requirement:** tests must pass after every change to `columns.html`.
- **All network requests are mocked** — tests never hit live APIs or RSS feeds. Fixture data lives in `tests/fixtures/`.
- **Coverage:** layout, loading states, data rendering (all three columns), error states, and timeout handling.

## Future considerations (out of scope)

- Dark mode / system theme matching.
- Configurable number of items per feed.
- Additional sources (e.g. Lobsters, Reddit, Ars Technica).
- Auto-refresh on a timer.
- Local proxy server as a fallback for CORS proxy unreliability.
- Keyboard navigation between columns.
