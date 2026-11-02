# jonbushenterprises.com

Single-file static site (`index.html` + `assets/`), served by GitHub Pages at https://jonbushenterprises.com.

## Making changes

1. Branch off `main`, make the change, open a pull request.
2. **Checks** run on the PR: HTML validation, browser tests on desktop and mobile (links, case-study routing, link-preview tags, accessibility, no sideways scroll, content rules), and an external link check.
3. Merge when green. The merge to `main` re-runs the checks, deploys, refreshes the live-site screenshots, and verifies the live domain.

Run the checks locally:

```sh
npm ci
npx playwright install chromium
npm run check
```

Only `index.html`, `CNAME`, `.nojekyll` and `assets/` are published; tests and tooling stay in the repo.
