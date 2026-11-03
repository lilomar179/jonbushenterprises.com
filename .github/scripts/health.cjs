#!/usr/bin/env node
// Self-verifying health check for a static site.
//
// Every flag is DERIVED from the files actually being served -- never declared. The same probe runs
// against the built folder (to write /health.json at deploy time) and against the live domain (to prove
// the CDN is serving what was built).
//
//   node health.cjs build <dir> <commit>   write <dir>/health.json
//   node health.cjs live  <base-url>       print health computed from the live site
//   node health.cjs diff  <before.json> <after.json>   exit 1 if any flag or count regressed
//
// Output is public: version, commit, booleans and counts only. Never put config values or secrets here.
'use strict';
const fs = require('fs');
const path = require('path');

const SERVICE = 'jonbushenterprises.com';
// Sentinels the probes look for. If you rename one of these in index.html, update it here too:
// the unit test in tests/site.spec.js fails if any flag comes back false on the current page.
const SENTINEL = {
  liveWorkSection: 'id="live-work"',
  seeItLiveNav: 'class="live-row"',
  bookingUrl: 'https://cal.com/jonbush/scoping-call',
  ogImage: 'https://jonbushenterprises.com/assets/og-image.png',
  analytics: 'data-goatcounter=',
};
const BANNED = ['scraping', 'served with honor'];

const count = (s, re) => (s.match(re) || []).length;
const between = (s, start, endTag) => {
  const i = s.indexOf(start);
  if (i < 0) return '';
  const j = s.indexOf(endTag, i);
  return j < 0 ? '' : s.slice(i, j);
};

// assetOk(relativePath) -> Promise<boolean>
async function probe(html, assetOk) {
  const f = {};
  const run = async (name, fn) => {
    try { f[name] = await fn(); } catch { f[name] = typeof f[name] === 'number' ? 0 : false; }
  };

  await run('live_work_section', () => html.includes(SENTINEL.liveWorkSection));
  await run('live_products', () => count(between(html, SENTINEL.liveWorkSection, '</section>'), /target="_blank"[^>]*>Visit site ↗</g));
  await run('see_it_live_links', () => count(between(html, SENTINEL.seeItLiveNav, '</nav>'), /<a [^>]*target="_blank"/g));
  await run('footer_live_links', () => count(between(html, '<footer', '</footer>'), /<a [^>]*target="_blank"/g));

  // Case studies: every page the router knows about must exist as an <article>, and vice versa.
  const pages = [...html.matchAll(/<article class="project" id="([^"]+)"/g)].map((m) => m[1]);
  await run('case_studies', () => pages.length);
  await run('router_matches_pages', () => {
    const m = html.match(/var projects = \[([^\]]*)\]/);
    if (!m) return false;
    const routed = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    return routed.length === pages.length && routed.every((id) => pages.includes(id));
  });

  await run('booking_links', () => html.split(SENTINEL.bookingUrl).length - 1);

  // Link previews and icons: tag present AND the file it points to is actually served.
  await run('og_image', async () => html.includes(`property="og:image" content="${SENTINEL.ogImage}"`) && (await assetOk('assets/og-image.png')));
  await run('og_image_size_tags', () => /og:image:width" content="1200"/.test(html) && /og:image:height" content="630"/.test(html));
  await run('twitter_large_card', () => html.includes('name="twitter:card" content="summary_large_image"'));
  await run('apple_touch_icon', async () => html.includes('rel="apple-touch-icon"') && (await assetOk('assets/apple-touch-icon.png')));
  await run('favicon_png', async () => html.includes('href="assets/favicon-32.png"') && (await assetOk('assets/favicon-32.png')));

  await run('thumbnails', async () => {
    const shots = [...html.matchAll(/src="(assets\/shots\/[^"]+)"/g)].map((m) => m[1]);
    let ok = 0;
    for (const s of new Set(shots)) if (await assetOk(s)) ok++;
    return ok;
  });

  await run('analytics', () => html.includes(SENTINEL.analytics));
  await run('content_rules_clean', () => !BANNED.some((w) => html.toLowerCase().includes(w)));
  return f;
}

function envelope(features, extra) {
  return { service: SERVICE, status: 'healthy', ...extra, features_verified: features };
}

// Anything true before and not true after, or any count that went down, is a regression.
function regressions(before, after) {
  const out = [];
  for (const [k, b] of Object.entries(before || {})) {
    const a = after[k];
    if (b === true && a !== true) out.push(`${k}: true -> ${a}`);
    if (typeof b === 'number' && !(typeof a === 'number' && a >= b)) out.push(`${k}: ${b} -> ${a}`);
  }
  return out;
}

async function fetchRetry(url, opts = {}, tries = 5) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { cache: 'no-store', ...opts });
      if (res.status < 500) return res; // 4xx is a real answer; 5xx is retried
      last = new Error(`HTTP ${res.status}`);
    } catch (e) { last = e; }
    await new Promise((r) => setTimeout(r, 3000 * (i + 1)));
  }
  throw last;
}

async function main() {
  const [mode, a, b] = process.argv.slice(2);
  if (mode === 'build') {
    const dir = a;
    const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
    const features = await probe(html, async (p) => fs.existsSync(path.join(dir, p)));
    const out = envelope(features, { commit: b || 'unknown', built_at: new Date().toISOString() });
    fs.writeFileSync(path.join(dir, 'health.json'), JSON.stringify(out, null, 2) + '\n');
    console.log(JSON.stringify(out, null, 2));
  } else if (mode === 'live') {
    const base = a.replace(/\/$/, '');
    const bust = `?t=${Date.now()}`;
    const html = await (await fetchRetry(`${base}/${bust}`)).text();
    const features = await probe(html, async (p) => (await fetchRetry(`${base}/${p}${bust}`, { method: 'HEAD' })).status === 200);
    console.log(JSON.stringify(envelope(features, { checked_at: new Date().toISOString() }), null, 2));
  } else if (mode === 'diff') {
    const read = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')).features_verified || {}; } catch { return {}; } };
    const bad = regressions(read(a), read(b));
    if (bad.length) { console.log('Regressed:\n  ' + bad.join('\n  ')); process.exit(1); }
    console.log('No regressions.');
  } else {
    console.error('usage: health.cjs build <dir> <commit> | live <url> | diff <before> <after>');
    process.exit(2);
  }
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { probe, regressions };
