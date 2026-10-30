const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const VIEWPORTS = [
  { name: '360x800', width: 360, height: 800 },
  { name: '375x812', width: 375, height: 812 },
  { name: '390x844', width: 390, height: 844 },
  { name: '414x896', width: 414, height: 896 },
  { name: '430x932', width: 430, height: 932 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '1440x900', width: 1440, height: 900 }
];

async function scan() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // 1. Login
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
    { name: 'homepage', url: 'http://localhost:3000/' },
    { name: 'login', url: 'http://localhost:3000/login' },
    { name: 'register', url: 'http://localhost:3000/register' },
    { name: 'overview', url: `${baseProjUrl}/overview` },
    { name: 'sources', url: `${baseProjUrl}/sources` },
    { name: 'assistants', url: `${baseProjUrl}/assistants` },
    { name: 'assistant_studio', url: asstConfigHref ? `http://localhost:3000${asstConfigHref}` : `${baseProjUrl}/assistants` },
    { name: 'playground', url: `${baseProjUrl}/playground` },
    { name: 'settings', url: `http://localhost:3000/workspaces/${wsId}/settings` }
  ];

  console.log('=== STRICT PAGE OVERFLOW AUDIT ===');
  const violations = [];

  for (const r of routes) {
    for (const vp of VIEWPORTS) {
      await page.setViewport({ width: vp.width, height: vp.height, isMobile: vp.width <= 768 });
      await page.goto(r.url, { waitUntil: 'networkidle0' }).catch(() => {});
      await new Promise(res => setTimeout(res, 300));

      const overflowData = await page.evaluate(() => {
        const docScroll = document.documentElement.scrollWidth;
        const bodyScroll = document.body.scrollWidth;
        const winInner = window.innerWidth;
        const docOverflow = docScroll > winInner;
        const bodyOverflow = bodyScroll > winInner;

        // Find elements causing horizontal scroll on body or document
        let uncontained = [];
        if (docOverflow || bodyOverflow) {
          const all = document.querySelectorAll('*');
          for (const el of all) {
            // Skip elements inside intentional horizontal scroll containers
            let inScrollContainer = false;
            let p = el.parentElement;
            while (p && p !== document.body) {
              const overflowX = window.getComputedStyle(p).overflowX;
              if (overflowX === 'auto' || overflowX === 'scroll') {
                inScrollContainer = true;
                break;
              }
              p = p.parentElement;
            }
            if (inScrollContainer) continue;

            const rect = el.getBoundingClientRect();
            if (rect.right > winInner + 1) {
              const tag = el.tagName.toLowerCase();
              const cls = (el.className && typeof el.className === 'string') ? el.className.slice(0, 50) : '';
              uncontained.push({ tag, cls, right: Math.round(rect.right), width: Math.round(rect.width) });
              if (uncontained.length >= 3) break;
            }
          }
        }
        return { docScroll, bodyScroll, winInner, docOverflow, bodyOverflow, uncontained };
      });

      if (overflowData.docOverflow || overflowData.bodyOverflow) {
        console.log(`[PAGE OVERFLOW] Route: ${r.name} @ ${vp.name} | docScroll: ${overflowData.docScroll}, bodyScroll: ${overflowData.bodyScroll} vs winInner: ${overflowData.winInner}`);
        if (overflowData.uncontained.length > 0) {
          console.log('  Offending uncontained:', JSON.stringify(overflowData.uncontained));
        }
        violations.push({ route: r.name, viewport: vp.name, ...overflowData });
      }
    }
  }

  console.log(`\nAudit complete. Unwanted page overflow count: ${violations.length}`);
  await browser.close();
  return violations.length;
}

scan().catch(e => {
  console.error('Audit error:', e);
  process.exit(1);
});
