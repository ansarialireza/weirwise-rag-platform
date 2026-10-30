const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT_DIR = path.resolve(__dirname, '../../artifacts/screenshots/customer_ux');

const VIEWPORTS = [
  { name: '360x800', width: 360, height: 800, isMobile: true },
  { name: '375x812', width: 375, height: 812, isMobile: true },
  { name: '390x844', width: 390, height: 844, isMobile: true },
  { name: '414x896', width: 414, height: 896, isMobile: true },
  { name: '430x932', width: 430, height: 932, isMobile: true },
  { name: '768x1024', width: 768, height: 1024, isMobile: false },
  { name: '1024x768', width: 1024, height: 768, isMobile: false },
  { name: '1280x800', width: 1280, height: 800, isMobile: false },
  { name: '1440x900', width: 1440, height: 900, isMobile: false }
];

async function captureAll() {
  console.log('Starting full mobile & responsive screenshot capture suite...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // Login
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const demo = btns.find(b => b.textContent.includes('1-Click Demo Access'));
    if (demo) demo.click();
  });
  await page.waitForFunction(() => window.location.pathname.includes('/overview'), { timeout: 15000 });

  const currentUrl = page.url();
  const baseProjUrl = currentUrl.replace('/overview', '');
  const wsMatch = currentUrl.match(/workspaces\/([^/]+)/);
  const wsId = wsMatch ? wsMatch[1] : '';

  await page.goto(`${baseProjUrl}/assistants`, { waitUntil: 'networkidle0' });
  const asstConfigHref = await page.evaluate(() => {
    const a = Array.from(document.querySelectorAll('a')).find(el => el.textContent.includes('Configure'));
    return a ? a.getAttribute('href') : null;
  });

  const routes = [
    { prefix: '02_overview', url: `${baseProjUrl}/overview` },
    { prefix: '03_sources', url: `${baseProjUrl}/sources` },
    { prefix: '04_assistants', url: `${baseProjUrl}/assistants` },
    { prefix: '05_playground', url: `${baseProjUrl}/playground` },
    { prefix: '06_settings', url: `http://localhost:3000/workspaces/${wsId}/settings` },
    { prefix: '07_assistant_studio', url: asstConfigHref ? `http://localhost:3000${asstConfigHref}` : `${baseProjUrl}/assistants` }
  ];

  for (const r of routes) {
    console.log(`Capturing route: ${r.prefix}...`);
    for (const theme of ['dark', 'light']) {
      for (const vp of VIEWPORTS) {
        await page.setViewport({ width: vp.width, height: vp.height, isMobile: vp.isMobile });
        await page.goto(r.url, { waitUntil: 'networkidle0' }).catch(() => {});
        await page.evaluate((t) => {
          document.documentElement.classList.remove('light', 'dark');
          document.documentElement.classList.add(t);
        }, theme);
        await new Promise(res => setTimeout(res, 200));

        const filename = `${r.prefix}_${theme}_${vp.name}.png`;
        await page.screenshot({ path: path.join(OUT_DIR, filename) });
      }
    }
  }

  // Also capture mobile drawer open state at 390x844 (Dark & Light)
  console.log('Capturing mobile drawer open states...');
  await page.setViewport({ width: 390, height: 844, isMobile: true });
  for (const theme of ['dark', 'light']) {
    await page.goto(`${baseProjUrl}/overview`, { waitUntil: 'networkidle0' });
    await page.evaluate((t) => {
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(t);
    }, theme);
    await new Promise(res => setTimeout(res, 200));

    const menuBtn = await page.$('button[aria-label="Open navigation menu"]');
    if (menuBtn) {
      await menuBtn.click();
      await new Promise(res => setTimeout(res, 300));
      await page.screenshot({ path: path.join(OUT_DIR, `02_overview_mobile_drawer_${theme}_390x844.png`) });
    }
  }

  await browser.close();
  console.log('All responsive screenshots captured successfully.');
}

captureAll().catch(e => {
  console.error('Capture error:', e);
  process.exit(1);
});
