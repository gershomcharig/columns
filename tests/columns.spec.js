import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

const fixturesDir = join(import.meta.dirname, 'fixtures');

function readFixture(name) {
  return readFileSync(join(fixturesDir, name), 'utf-8');
}

const hnIds = readFixture('hn-ids.json');
const hnItem = readFixture('hn-item.json');
const hnItemAsk = readFixture('hn-item-ask.json');
const techcrunchXml = readFixture('techcrunch.xml');
const bubblesXml = readFixture('bubbles.xml');

const FALLBACK_PROXY_PATTERNS = [
  '**/api.codetabs.com/**',
  '**/api.allorigins.win/**',
];

function fulfillRssByUrl(route, url) {
  if (url.includes('techcrunch.com')) {
    return route.fulfill({ contentType: 'application/xml', body: techcrunchXml });
  }
  if (url.includes('bubbles.town')) {
    return route.fulfill({ contentType: 'application/xml', body: bubblesXml });
  }
  return route.abort();
}

async function setupHappyPathRoutes(page) {
  await page.route('**/hacker-news.firebaseio.com/v0/topstories.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: hnIds }),
  );

  await page.route('**/hacker-news.firebaseio.com/v0/item/*.json', (route) => {
    const url = route.request().url();
    const id = url.match(/item\/(\d+)\.json/)[1];
    if (id === '2') {
      return route.fulfill({ contentType: 'application/json', body: hnItemAsk });
    }
    // Return a unique title per ID so we can verify count
    const item = JSON.parse(hnItem);
    item.id = Number(id);
    item.title = `Test Story ${id}`;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(item) });
  });

  // First proxy succeeds — fallbacks should never be reached
  await page.route('**/api.cors.lol/**', (route) =>
    fulfillRssByUrl(route, route.request().url()),
  );

  // Block fallback proxies so tests fail fast if first proxy is accidentally skipped
  for (const pattern of FALLBACK_PROXY_PATTERNS) {
    await page.route(pattern, (route) => route.abort());
  }
}

async function blockAllProxies(page, handler) {
  await page.route('**/api.cors.lol/**', handler);
  for (const pattern of FALLBACK_PROXY_PATTERNS) {
    await page.route(pattern, handler);
  }
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

test.describe('layout', () => {
  test('has three columns with correct headings', async ({ page }) => {
    await setupHappyPathRoutes(page);
    await page.goto('/columns.html');

    const columns = page.locator('.column');
    await expect(columns).toHaveCount(3);

    const headings = page.locator('.column h2');
    await expect(headings.nth(0)).toHaveText('Hacker News');
    await expect(headings.nth(1)).toHaveText('TechCrunch');
    await expect(headings.nth(2)).toHaveText('Bubbles');
  });

  test('grid uses three equal columns with min-width 1200px', async ({ page }) => {
    await setupHappyPathRoutes(page);
    await page.goto('/columns.html');

    const grid = page.locator('.grid');
    await expect(grid).toHaveCSS('display', 'grid');
    await expect(grid).toHaveCSS('min-width', '1200px');

    // Verify three equal-width columns (computed value depends on viewport)
    const columns = await grid.evaluate((el) => {
      const cols = getComputedStyle(el).gridTemplateColumns.split(' ');
      return cols.map((c) => parseFloat(c));
    });
    expect(columns).toHaveLength(3);
    expect(columns[0]).toBeCloseTo(columns[1], 0);
    expect(columns[1]).toBeCloseTo(columns[2], 0);
    expect(columns[0]).toBeGreaterThanOrEqual(400);
  });

  test('columns have independent overflow-y scroll', async ({ page }) => {
    await setupHappyPathRoutes(page);
    await page.goto('/columns.html');

    const columns = page.locator('.column');
    for (let i = 0; i < 3; i++) {
      await expect(columns.nth(i)).toHaveCSS('overflow-y', 'auto');
    }
  });
});

// ---------------------------------------------------------------------------
// Loading states
// ---------------------------------------------------------------------------

test.describe('loading states', () => {
  test('all columns show loading text before data arrives', async ({ page }) => {
    // Set up routes that never respond, so we can observe loading state
    await page.route('**/hacker-news.firebaseio.com/**', (route) => {
      // Never fulfill — keeps loading state visible
    });
    await blockAllProxies(page, (route) => {
      // Never fulfill
    });

    await page.goto('/columns.html');

    await expect(page.locator('#hn .status')).toHaveText('Loading…');
    await expect(page.locator('#tc .status')).toHaveText('Loading…');
    await expect(page.locator('#bubbles .status')).toHaveText('Loading…');
  });
});

// ---------------------------------------------------------------------------
// Hacker News column
// ---------------------------------------------------------------------------

test.describe('Hacker News column', () => {
  test('renders exactly 30 items from 35 IDs', async ({ page }) => {
    await setupHappyPathRoutes(page);
    await page.goto('/columns.html');

    const items = page.locator('#hn ol li');
    await expect(items).toHaveCount(30);
  });

  test('titles and links render correctly', async ({ page }) => {
    await setupHappyPathRoutes(page);
    await page.goto('/columns.html');

    const firstLink = page.locator('#hn ol li a').first();
    await expect(firstLink).toHaveText('Test Story 1');
    await expect(firstLink).toHaveAttribute('href', 'https://example.com/story');
  });

  test('all links open in new tab with security attributes', async ({ page }) => {
    await setupHappyPathRoutes(page);
    await page.goto('/columns.html');

    const links = page.locator('#hn ol li a');
    const count = await links.count();
    for (let i = 0; i < count; i++) {
      await expect(links.nth(i)).toHaveAttribute('target', '_blank');
      await expect(links.nth(i)).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  test('Ask HN posts link to news.ycombinator.com', async ({ page }) => {
    await setupHappyPathRoutes(page);
    await page.goto('/columns.html');

    // ID 2 is the Ask HN item (second in the list)
    const askLink = page.locator('#hn ol li:nth-child(2) a');
    await expect(askLink).toHaveText('Ask HN: Test Question');
    await expect(askLink).toHaveAttribute('href', 'https://news.ycombinator.com/item?id=2');
  });

  test('no description elements in HN column', async ({ page }) => {
    await setupHappyPathRoutes(page);
    await page.goto('/columns.html');

    // Wait for items to render
    await expect(page.locator('#hn ol li')).toHaveCount(30);

    const descriptions = page.locator('#hn .description');
    await expect(descriptions).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// TechCrunch column
// ---------------------------------------------------------------------------

test.describe('TechCrunch column', () => {
  test('renders correct number of items', async ({ page }) => {
    await setupHappyPathRoutes(page);
    await page.goto('/columns.html');

    const items = page.locator('#tc ol li');
    await expect(items).toHaveCount(3);
  });

  test('titles and links render correctly', async ({ page }) => {
    await setupHappyPathRoutes(page);
    await page.goto('/columns.html');

    const firstLink = page.locator('#tc ol li:nth-child(1) a');
    await expect(firstLink).toHaveText('TC Article With HTML Description');
    await expect(firstLink).toHaveAttribute('href', 'https://techcrunch.com/article-1');
  });

  test('no description elements in TC column', async ({ page }) => {
    await setupHappyPathRoutes(page);
    await page.goto('/columns.html');

    await expect(page.locator('#tc ol li')).toHaveCount(3);
    const descriptions = page.locator('#tc .description');
    await expect(descriptions).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Bubbles column
// ---------------------------------------------------------------------------

test.describe('Bubbles column', () => {
  test('renders independently with correct content', async ({ page }) => {
    await setupHappyPathRoutes(page);
    await page.goto('/columns.html');

    const items = page.locator('#bubbles ol li');
    await expect(items).toHaveCount(2);

    const firstLink = page.locator('#bubbles ol li:nth-child(1) a');
    await expect(firstLink).toHaveText('Bubbles Post One');
    await expect(firstLink).toHaveAttribute('href', 'https://example.com/posts/bubbles-one');

    const secondLink = page.locator('#bubbles ol li:nth-child(2) a');
    await expect(secondLink).toHaveText('Bubbles Post Two');
  });

  test('no description elements in Bubbles column', async ({ page }) => {
    await setupHappyPathRoutes(page);
    await page.goto('/columns.html');

    await expect(page.locator('#bubbles ol li')).toHaveCount(2);
    const descriptions = page.locator('#bubbles .description');
    await expect(descriptions).toHaveCount(0);
  });

  test('all links open in new tab with security attributes', async ({ page }) => {
    await setupHappyPathRoutes(page);
    await page.goto('/columns.html');

    const links = page.locator('#bubbles ol li a');
    const count = await links.count();
    for (let i = 0; i < count; i++) {
      await expect(links.nth(i)).toHaveAttribute('target', '_blank');
      await expect(links.nth(i)).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });
});

// ---------------------------------------------------------------------------
// Error states
// ---------------------------------------------------------------------------

test.describe('error states', () => {
  test('shows error when Hacker News fails', async ({ page }) => {
    await page.route('**/hacker-news.firebaseio.com/**', (route) => route.abort());
    // Keep RSS feeds working via first proxy
    await page.route('**/api.cors.lol/**', (route) =>
      fulfillRssByUrl(route, route.request().url()),
    );
    for (const pattern of FALLBACK_PROXY_PATTERNS) {
      await page.route(pattern, (route) => route.abort());
    }

    await page.goto('/columns.html');

    await expect(page.locator('#hn .status.error')).toHaveText('Failed to load Hacker News');
    // Other columns still work
    await expect(page.locator('#tc ol li')).toHaveCount(3);
    await expect(page.locator('#bubbles ol li')).toHaveCount(2);
  });

  test('shows error when TechCrunch fails', async ({ page }) => {
    await page.route('**/hacker-news.firebaseio.com/v0/topstories.json', (route) =>
      route.fulfill({ contentType: 'application/json', body: hnIds }),
    );
    await page.route('**/hacker-news.firebaseio.com/v0/item/*.json', (route) => {
      const item = JSON.parse(hnItem);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(item) });
    });
    // All proxies fail for TechCrunch, succeed for Bubbles
    const rssHandler = (route) => {
      const url = route.request().url();
      if (url.includes('techcrunch.com')) return route.abort();
      if (url.includes('bubbles.town')) {
        return route.fulfill({ contentType: 'application/xml', body: bubblesXml });
      }
      return route.abort();
    };
    await page.route('**/api.cors.lol/**', rssHandler);
    for (const pattern of FALLBACK_PROXY_PATTERNS) {
      await page.route(pattern, rssHandler);
    }

    await page.goto('/columns.html');

    await expect(page.locator('#tc .status.error')).toHaveText('Failed to load TechCrunch');
    await expect(page.locator('#hn ol li')).toHaveCount(30);
    await expect(page.locator('#bubbles ol li')).toHaveCount(2);
  });

  test('shows error when Bubbles fails', async ({ page }) => {
    await page.route('**/hacker-news.firebaseio.com/v0/topstories.json', (route) =>
      route.fulfill({ contentType: 'application/json', body: hnIds }),
    );
    await page.route('**/hacker-news.firebaseio.com/v0/item/*.json', (route) => {
      const item = JSON.parse(hnItem);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(item) });
    });
    // All proxies fail for Bubbles, succeed for TechCrunch
    const rssHandler = (route) => {
      const url = route.request().url();
      if (url.includes('techcrunch.com')) {
        return route.fulfill({ contentType: 'application/xml', body: techcrunchXml });
      }
      if (url.includes('bubbles.town')) return route.abort();
      return route.abort();
    };
    await page.route('**/api.cors.lol/**', rssHandler);
    for (const pattern of FALLBACK_PROXY_PATTERNS) {
      await page.route(pattern, rssHandler);
    }

    await page.goto('/columns.html');

    await expect(page.locator('#bubbles .status.error')).toHaveText('Failed to load Bubbles');
    await expect(page.locator('#hn ol li')).toHaveCount(30);
    await expect(page.locator('#tc ol li')).toHaveCount(3);
  });
});

// ---------------------------------------------------------------------------
// Timeout handling
// ---------------------------------------------------------------------------

test.describe('timeout handling', () => {
  test('shows error when request exceeds timeout across all proxies', async ({ page }) => {
    // Install fake timers before navigating
    await page.clock.install();

    // HN topstories route that never responds — simulates a hang
    await page.route('**/hacker-news.firebaseio.com/v0/topstories.json', async (route) => {
      // Never fulfill — the abort signal will cancel this
    });

    // RSS feeds also hang across all proxies
    await blockAllProxies(page, async (route) => {
      // Never fulfill
    });

    await page.goto('/columns.html');

    // Advance time in steps so each sequential proxy timeout fires
    // and the next proxy attempt can schedule its own timeout
    for (let i = 0; i < 3; i++) {
      await page.clock.fastForward(11000);
    }

    await expect(page.locator('#hn .status.error')).toHaveText('Failed to load Hacker News');
    await expect(page.locator('#tc .status.error')).toHaveText('Failed to load TechCrunch');
    await expect(page.locator('#bubbles .status.error')).toHaveText('Failed to load Bubbles');
  });
});

// ---------------------------------------------------------------------------
// Proxy fallback
// ---------------------------------------------------------------------------

test.describe('proxy fallback', () => {
  test('falls back to next proxy when first proxy fails', async ({ page }) => {
    // HN routes work normally
    await page.route('**/hacker-news.firebaseio.com/v0/topstories.json', (route) =>
      route.fulfill({ contentType: 'application/json', body: hnIds }),
    );
    await page.route('**/hacker-news.firebaseio.com/v0/item/*.json', (route) => {
      const item = JSON.parse(hnItem);
      item.id = 1;
      item.title = 'Test Story 1';
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(item) });
    });

    // First proxy fails
    await page.route('**/api.cors.lol/**', (route) => route.abort());

    // Second proxy succeeds
    await page.route('**/api.codetabs.com/**', (route) =>
      fulfillRssByUrl(route, route.request().url()),
    );

    // Third proxy not needed but block it to be safe
    await page.route('**/api.allorigins.win/**', (route) => route.abort());

    await page.goto('/columns.html');

    // RSS columns should render via the second proxy
    await expect(page.locator('#tc ol li')).toHaveCount(3);
    await expect(page.locator('#bubbles ol li')).toHaveCount(2);
  });
});
