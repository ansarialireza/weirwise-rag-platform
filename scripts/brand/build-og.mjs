import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PUB = path.join(REPO, "frontend/public");
const OUT = path.join(REPO, "var/brand-assets/og.html");

function inlineSvg(file, extraAttrs = "") {
  const raw = readFileSync(`${PUB}/${file}`, "utf8")
    .replace(/<metadata>[\s\S]*?<\/metadata>/, "")
    .replace(/<title[^>]*>[\s\S]*?<\/title>/, "");
  const vb = raw.match(/viewBox="([^"]+)"/)[1];
  const [, , w, h] = vb.split(/[\s,]+/).map(Number);
  return {
    ratio: w / h,
    svg: raw.replace(/<svg [^>]*>/, `<svg viewBox="${vb}" width="100%" height="100%" ${extraAttrs}>`),
  };
}

const mark = inlineSvg("weirwise-mark.svg");
const word = inlineSvg("weirwise-wordmark.svg", 'preserveAspectRatio="xMinYMid meet"');

const MARK_W = 300;
const WORD_W = 310;
const markH = Math.round(MARK_W / mark.ratio);
const wordH = Math.round(WORD_W / word.ratio);

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;width:1200px;height:630px;overflow:hidden}
  body{background:#0B0E0D;color:#F4F3EF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;position:relative}
  .grid{position:absolute;inset:0;background-image:radial-gradient(rgba(244,243,239,.055) 1px,transparent 1px);background-size:26px 26px}
  .wrap{position:absolute;inset:0;padding:76px 96px 72px;display:flex;flex-direction:column;justify-content:space-between;box-sizing:border-box}
  .top{display:flex;align-items:center;gap:38px}
  .mark{width:${MARK_W}px;height:${markH}px;flex:none}
  .word{width:${WORD_W}px;height:${wordH}px}
  .rule{width:104px;height:2px;background:#25C4D8;margin:0 0 30px}
  h1{margin:0;font-size:58px;line-height:1.06;font-weight:700;letter-spacing:-.035em;max-width:940px}
  h1 em{font-style:normal;color:#8F9B96}
  .sub{margin:20px 0 0;font-size:23px;line-height:1.5;color:#B4B0A5;max-width:840px}
  .foot{display:flex;align-items:baseline;justify-content:space-between;font-size:17px;letter-spacing:.16em;text-transform:uppercase;color:#85868B}
  .foot b{color:#25C4D8;font-weight:600}
</style></head><body>
  <div class="grid"></div>
  <div class="wrap">
    <div class="top">
      <div class="mark">${mark.svg}</div>
      <div class="word">${word.svg}</div>
    </div>
    <div>
      <div class="rule"></div>
      <h1>Intelligent flow control<br><em>for business knowledge.</em></h1>
      <p class="sub">Documents, pages and notes routed through one controlled flow — assistants that answer from your business, with the source beside every claim.</p>
    </div>
    <div class="foot"><span>Weirwise &nbsp;·&nbsp; retrieval you can cite</span><span><b>weirwise.com</b></span></div>
  </div>
</body></html>`;

writeFileSync(OUT, html);
console.log("wrote", OUT, html.length, "bytes", { markH, wordH });
