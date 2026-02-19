# Columns

A single-page browser homepage that displays feeds from Hacker News, TechCrunch, and Product Hunt side by side.

No build step, no framework — just one HTML file.

## Usage

Open `columns.html` in your browser, or set it as your homepage/new tab page.

## How it works

- **Hacker News** — fetched directly from the [Firebase API](https://github.com/HackerNews/API)
- **TechCrunch & Product Hunt** — RSS/Atom feeds fetched via CORS proxies, with automatic fallback across multiple proxies

## Tests

```sh
npm install
npx playwright test
```

## Licence

[MIT](LICENSE)
