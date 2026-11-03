# jonbushenterprises.com

Single-file static site (`index.html` + `assets/`), served by GitHub Pages at https://jonbushenterprises.com.

## Making changes

1. Branch off `main`, make the change, open a pull request.
2. **Checks** run on the PR: HTML validation, browser tests on desktop and mobile (links, case-study routing, link-preview tags, accessibility, no sideways scroll, content rules), and an external link check.
3. Merge when green. The merge to `main` re-runs the checks, records the live site's health as a baseline, deploys, and refreshes the live-site screenshots.
4. **Verify** then proves the deploy landed: it waits for https://jonbushenterprises.com/health.json to report the new commit, recomputes every flag from the live HTML and assets, and fails if the live site doesn't match the build or if any feature or count went down since the last deploy.

## Health check (`/health.json`)

`.github/scripts/health.cjs` derives each flag from the files actually served (live-site links, case-study pages and router, booking links, link-preview tags, icons, thumbnails, analytics, content rules). Nothing is hand-declared, so a flag can't claim a feature that isn't shipped. It's public: commit, timestamps, booleans and counts only.

Removing something on purpose (e.g. taking a product link down)? Put `[health-ok]` in the commit message so the regression gate lets it through.

```sh
node .github/scripts/health.cjs live https://jonbushenterprises.com   # what's live right now
```

Run the checks locally:

```sh
npm ci
npx playwright install chromium
npm run check
```

Only `index.html`, `CNAME`, `.nojekyll` and `assets/` are published; tests and tooling stay in the repo.
