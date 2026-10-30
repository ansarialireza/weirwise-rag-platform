const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT_DIR = path.resolve(__dirname, '../../artifacts/screenshots/customer_ux');

const VIEWPORTS = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1440x900',  width: 1440, height: 900  },
  { name: '1366x768',  width: 1366, height: 768  },
  { name: '1280x800',  width: 1280, height: 800  },
  { name: '768x1024',  width: 768,  height: 1024 },
  { name: '390x844',   width: 390,  height: 844, isMobile: true },
  { name: '360x800',   width: 360,  height: 800, isMobile: true }
];

async function capture() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log('Logging in...');
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });

  // Use evaluate to click the demo button
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const demo = btns.find(b => b.textContent.includes('1-Click Demo Access'));
    if (demo) demo.click();
  });

  // Wait until we reach overview
  await page.waitForFunction(() => window.location.pathname.includes('/overview'), { timeout: 20000 });
  console.log('Active overview URL:', page.url());

  const currentUrl = page.url();
  // e.g. http://localhost:3000/workspaces/WS/projects/PROJ/overview
  const baseProjUrl = currentUrl.replace('/overview', '');
  const wsMatch = currentUrl.match(/workspaces\/([^/]+)/);
  const wsId = wsMatch ? wsMatch[1] : '';

  const routes = [
    { name: '02_overview', url: `${baseProjUrl}/overview` },
    { name: '03_sources', url: `${baseProjUrl}/sources` },
    { name: '04_assistants', url: `${baseProjUrl}/assistants` },
    { name: '05_playground', url: `${baseProjUrl}/playground` },
    { name: '06_settings', url: `http://localhost:3000/workspaces/${wsId}/settings` }
  ];

  for (const r of routes) {
    console.log(`Capturing: ${r.name} -> ${r.url}`);
    await page.goto(r.url, { waitUntil: 'networkidle0' });
    await new Promise(res => setTimeout(res, 1000));

    // Dark Theme across 7 viewports
    for (const vp of VIEWPORTS) {
      await page.setViewport({ width: vp.width, height: vp.height, isMobile: !!vp.isMobile });
      await page.evaluate(() => {
        document.documentElement.classList.remove('light');
        document.documentElement.classList.add('dark');
      });
      await new Promise(res => setTimeout(res, 200));
      const filename = `${r.name}_dark_${vp.name}.png`;
      await page.screenshot({ path: path.join(OUT_DIR, filename) });
    }

    // Light Theme across 7 viewports
    for (const vp of VIEWPORTS) {
      await page.setViewport({ width: vp.width, height: vp.height, isMobile: !!vp.isMobile });
      await page.evaluate(() => {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      });
      await new Promise(res => setTimeout(res, 200));
      const filename = `${r.name}_light_${vp.name}.png`;
      await page.screenshot({ path: path.join(OUT_DIR, filename) });
    }
  }

  // Assistant studio configuration page capture
  console.log('Navigating to assistant list to find studio config link...');
  await page.goto(`${baseProjUrl}/assistants`, { waitUntil: 'networkidle0' });
  const configureHref = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a'));
    const cfg = links.find(a => a.textContent.includes('Configure'));
    return cfg ? cfg.getAttribute('href') : null;
  });

  if (configureHref) {
    const configUrl = `http://localhost:3000${configureHref}`;
    console.log(`Capturing Assistant Studio: ${configUrl}`);
    await page.goto(configUrl, { waitUntil: 'networkidle0' });
    await new Promise(res => setTimeout(res, 1000));

    for (const theme of ['dark', 'light']) {
      await page.evaluate((t) => {
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(t);
      }, theme);

      for (const vp of VIEWPORTS) {
        await page.setViewport({ width: vp.width, height: vp.height, isMobile: !!vp.isMobile });
        await new Promise(res => setTimeout(res, 200));
        const filename = `07_assistant_studio_${theme}_${vp.name}.png`;
        await page.screenshot({ path: path.join(OUT_DIR, filename) });
      }
    }
  }

  await browser.close();
  console.log('All customer screens captured across dark/light and 7 viewports successfully!');
}

capture().catch(err => {
  console.error('Capture failed:', err);
  process.exit(1);
});
