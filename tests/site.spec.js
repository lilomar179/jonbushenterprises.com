// End-to-end checks for jonbushenterprises.com (single-page site, project pages routed on the hash).
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const PROJECTS = ['permitvista', 'espiral', 'polymarket-edge', 'moviz', 'juryflow'];
const LIVE = {
  'https://permitvista.com': 'PermitVista',
  'https://espiralusa.com': 'Espiral USA',
  'https://moviz-web-1rkd.onrender.com': 'Moviz',
  'https://trading.jonbushenterprises.com': 'Polymarket Edge',
};

// Collect script errors on our own origin. Third-party requests (fonts, analytics) are ignored so the
// suite also passes on machines without internet access.
function trackErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

// Keep tests hermetic: block every request that isn't the local test server. Third-party scripts
// (fonts, the Cloudflare analytics beacon) would otherwise make tests depend on the network and
// count CI runs as visits in the site's analytics.
test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname;
    return host === '127.0.0.1' || host === 'localhost' ? route.continue() : route.abort();
  });
});

test.describe('home page', () => {
  test('loads without script errors and shows the main sections', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/');
    await expect(page.locator('h1').first()).toContainText('Production systems');
    for (const id of ['live-work', 'services', 'process', 'about', 'contact']) {
      await expect(page.locator(`#${id}`)).toBeAttached();
    }
    expect(errors).toEqual([]);
  });

  test('"See it live" row is above the fold and links to every live product in a new tab', async ({ page }) => {
    await page.goto('/');
    const row = page.getByRole('navigation', { name: 'See it live' });
    await expect(row).toBeInViewport();
    for (const url of Object.keys(LIVE)) {
      const link = row.locator(`a[href="${url}"]`);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', /noopener/);
    }
  });

  test('Live work cards are in order with the right badges and buttons', async ({ page }) => {
    await page.goto('/');
    const cards = page.locator('#live-work .card');
    await expect(cards).toHaveCount(6);
    const expected = [
      ['PermitVista', 'Live', 'https://permitvista.com'],
      ['Espiral USA', 'Live', 'https://espiralusa.com'],
      ['Moviz', 'Live beta', 'https://moviz-web-1rkd.onrender.com'],
      ['Polymarket Edge', 'Live results', 'https://trading.jonbushenterprises.com'],
      ['JuryFlow', 'In build', null],
      ['Enterprise data platform', 'Client work', null],
    ];
    for (const [i, [name, badge, url]] of expected.entries()) {
      const card = cards.nth(i);
      await expect(card.locator('h3')).toHaveText(name);
      await expect(card.locator('.tag').first()).toHaveText(badge);
      const visit = card.getByRole('link', { name: /Visit site/ });
      if (url) {
        await expect(visit).toHaveAttribute('href', url);
        await expect(card.locator('.shot img')).toBeAttached();
      } else {
        await expect(visit).toHaveCount(0);
      }
    }
  });

  test('screenshot thumbnails load', async ({ page }) => {
    await page.goto('/#live-work');
    const imgs = page.locator('#live-work .shot img');
    const n = await imgs.count();
    expect(n).toBe(4);
    for (let i = 0; i < n; i++) {
      await imgs.nth(i).scrollIntoViewIfNeeded();
      await expect.poll(() => imgs.nth(i).evaluate((el) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
    }
  });

  test('footer repeats the live links', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer');
    for (const url of Object.keys(LIVE)) await expect(footer.locator(`a[href="${url}"]`)).toHaveCount(1);
  });

  test('every booking button goes to the scoping-call page', async ({ page }) => {
    await page.goto('/');
    const book = page.locator('a', { hasText: /Book a/ });
    expect(await book.count()).toBeGreaterThan(0);
    for (const href of await book.evaluateAll((els) => els.map((e) => e.getAttribute('href')))) {
      expect(href).toBe('https://cal.com/jonbush/scoping-call');
    }
  });
});

test.describe('navigation and routing', () => {
  test('every in-page #link points at an element that exists', async ({ page }) => {
    await page.goto('/');
    const missing = await page.evaluate(() =>
      [...document.querySelectorAll('a[href^="#"]')]
        .map((a) => a.getAttribute('href').slice(1))
        .filter((id) => id && !document.getElementById(id))
    );
    expect(missing).toEqual([]);
  });

  test('nav links scroll to their sections', async ({ page }) => {
    await page.goto('/');
    for (const id of ['live-work', 'services', 'about', 'contact']) {
      await page.locator(`header a[href="#${id}"]`).click();
      await expect(page.locator(`#${id}`)).toBeInViewport();
    }
  });

  test('old #work links still land on the showcase', async ({ page }) => {
    await page.goto('/#work');
    await expect(page.locator('#live-work')).toBeInViewport();
  });

  for (const id of PROJECTS) {
    test(`case study #${id} shows alone and links back`, async ({ page }) => {
      const errors = trackErrors(page);
      await page.goto(`/#${id}`);
      await expect(page.locator(`#${id}`)).toBeVisible();
      await expect(page.locator('#home')).toBeHidden();
      for (const other of PROJECTS.filter((p) => p !== id)) await expect(page.locator(`#${other}`)).toBeHidden();
      await page.locator(`#${id} a.back`).click();
      await expect(page.locator('#home')).toBeVisible();
      await expect(page.locator('#live-work')).toBeInViewport();
      expect(errors).toEqual([]);
    });
  }

  test('Case study buttons open the matching page', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('#live-work .card').filter({ hasText: 'PermitVista' });
    await card.getByRole('link', { name: 'Case study' }).click();
    await expect(page.locator('#permitvista')).toBeVisible();
  });

  test('live case studies have a Visit button at the top', async ({ page }) => {
    for (const [id, url] of [['permitvista', 'https://permitvista.com'], ['espiral', 'https://espiralusa.com'], ['moviz', 'https://moviz-web-1rkd.onrender.com'], ['polymarket-edge', 'https://trading.jonbushenterprises.com']]) {
      await page.goto(`/#${id}`);
      const btn = page.locator(`#${id} .head a.btn[href="${url}"]`);
      await expect(btn).toBeVisible();
      await expect(btn).toHaveAttribute('target', '_blank');
    }
  });
});

test.describe('layout', () => {
  for (const route of ['/', ...PROJECTS.map((p) => `/#${p}`)]) {
    test(`no sideways scrolling on ${route}`, async ({ page }) => {
      await page.goto(route);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});

test.describe('accessibility', () => {
  for (const route of ['/', '/#permitvista']) {
    test(`no serious accessibility problems on ${route}`, async ({ page }) => {
      await page.goto(route);
      const results = await new AxeBuilder({ page }).analyze();
      const bad = results.violations
        .filter((v) => ['serious', 'critical'].includes(v.impact))
        .map((v) => `${v.id}: ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0].target.join(' ')}`);
      expect(bad).toEqual([]);
    });
  }
});

test.describe('link previews and icons', () => {
  test('page has the tags WhatsApp, iMessage, LinkedIn and X read', async ({ page }) => {
    await page.goto('/');
    const meta = (sel) => page.locator(sel).getAttribute('content');
    await expect(page).toHaveTitle('Jon Bush Enterprises · Data platforms, integrations & custom software');
    expect(await meta('meta[property="og:image"]')).toBe('https://jonbushenterprises.com/assets/og-image.png');
    expect(await meta('meta[property="og:image:width"]')).toBe('1200');
    expect(await meta('meta[property="og:image:height"]')).toBe('630');
    for (const p of ['og:type', 'og:site_name', 'og:title', 'og:description', 'og:url', 'og:image:alt']) {
      expect(await meta(`meta[property="${p}"]`), p).toBeTruthy();
    }
    expect(await meta('meta[name="twitter:card"]')).toBe('summary_large_image');
    expect(await meta('meta[name="twitter:image"]')).toBe('https://jonbushenterprises.com/assets/og-image.png');
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', 'assets/apple-touch-icon.png');
  });

  test('share image is 1200x630 PNG under 300 KB', () => {
    const buf = fs.readFileSync(path.join(ROOT, 'assets/og-image.png'));
    expect(buf.subarray(1, 4).toString()).toBe('PNG');
    expect(buf.readUInt32BE(16)).toBe(1200);
    expect(buf.readUInt32BE(20)).toBe(630);
    expect(buf.length).toBeLessThan(300 * 1024);
  });

  test('every local file the page references exists', async ({ request }) => {
    const refs = [...HTML.matchAll(/(?:src|href)="((?:assets\/)[^"#?]+)"/g)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThan(5);
    for (const ref of new Set(refs)) {
      const res = await request.get('/' + ref);
      expect(res.status(), ref).toBe(200);
    }
  });
});

test.describe('content rules', () => {
  test('no banned words or former-employer names', () => {
    const text = HTML.toLowerCase();
    for (const word of ['scraping', 'scraper', 'served with honor', 'swh']) {
      expect(text.includes(word), `found "${word}"`).toBe(false);
    }
  });

  test('every new-tab link is opened safely', () => {
    const bad = [...HTML.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)].map((m) => m[0]).filter((a) => !/rel="[^"]*noopener/.test(a));
    expect(bad).toEqual([]);
  });
});

test.describe('health probe', () => {
  const { probe, regressions } = require('../.github/scripts/health.cjs');

  test('every health flag is true on the current page', async () => {
    const f = await probe(HTML, async (p) => fs.existsSync(path.join(ROOT, p)));
    const off = Object.entries(f).filter(([, v]) => v === false || v === 0).map(([k]) => k);
    expect(off, 'flags that came back false or 0 (did a sentinel get renamed?)').toEqual([]);
    expect(f.live_products).toBe(Object.keys(LIVE).length);
    expect(f.case_studies).toBe(PROJECTS.length);
  });

  test('regressions() flags dropped features and lower counts only', () => {
    expect(regressions({ a: true, n: 4 }, { a: true, n: 5 })).toEqual([]);
    expect(regressions({ a: true, n: 4 }, { a: false, n: 3 })).toEqual(['a: true -> false', 'n: 4 -> 3']);
    expect(regressions({}, { a: true })).toEqual([]);
  });
});
