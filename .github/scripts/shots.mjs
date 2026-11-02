// Captures fresh thumbnails of the live products at deploy time.
// If a site can't be reached, the committed fallback image in assets/shots/ is kept.
import { chromium } from 'playwright';
const sites = [['https://permitvista.com', 'assets/shots/permitvista.jpg'], ['https://espiralusa.com', 'assets/shots/espiralusa.jpg'], ['https://moviz-web-1rkd.onrender.com', 'assets/shots/moviz.jpg']];
const browser = await chromium.launch();
for (const [url, out] of sites) {
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 0.5 });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: out, type: 'jpeg', quality: 80 });
    console.log('captured', url);
    await page.close();
  } catch (e) { console.log('kept fallback for', url, '-', e.message); }
}
await browser.close();
