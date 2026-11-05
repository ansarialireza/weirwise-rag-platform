/**
 * Derives every Weirwise brand asset from the official master mark.
 *
 * Path data is copied verbatim from public/weirwise-mark.svg; this script only
 * changes presentation (colour ramp, tile, crop), so the artwork cannot drift.
 * Re-run after any change to the master.
 *
 *   node scripts/brand/build-official-mark.mjs <path-to-delivered-svg>
 *
 * Outputs land in frontend/public, frontend/src and var/brand-assets (gitignored
 * staging for the private weirwise-brand repository — publish with
 * scripts/brand/sync-brand-repo.mjs).
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(REPO, "frontend/package.json"));
const sharp = require("sharp");

const PUBLIC = path.join(REPO, "frontend/public");
const APP = path.join(REPO, "frontend/src/app");
const OUT = path.join(REPO, "var/brand-assets");
const MASTER = path.join(PUBLIC, "weirwise-mark.svg");
mkdirSync(OUT, { recursive: true });

const INK = "#0B0E0D";
// Both must equal the --background triplets in frontend/src/app/globals.css.
const PAPER = "#F7F6F3";
const ACCENT_OFFICIAL = "#25C4D8";
const SILVER = ["#F6F6F7", "#CFD0D3", "#85868B"];
const GRAPHITE = ["#3A4441", "#1D2624", INK];

/* ---------------------------------------------------------------- geometry */

const delivered = process.argv[2];
if (delivered) copyFileSync(delivered, MASTER);

const masterSource = readFileSync(MASTER, "utf8");
const defsBlock = masterSource.match(/<defs>[\s\S]*?<\/defs>/)[0];
const pathBlocks = [...masterSource.matchAll(/<path fill="([^"]+)" fill-rule="evenodd" d="([^"]+)"\/>/g)]
  .map(([, fill, d]) => ({ fill, d }));
if (pathBlocks.length !== 8) throw new Error(`expected 8 paths, found ${pathBlocks.length}`);
const GRADIENT_COUNT = (defsBlock.match(/<linearGradient /g) || []).length;
const ACCENT_ID = pathBlocks.findIndex((p) => !p.fill.startsWith("url("));
if (GRADIENT_COUNT !== 7 || ACCENT_ID !== 7) {
  throw new Error(`unexpected master structure: ${GRADIENT_COUNT} gradients, accent at ${ACCENT_ID}`);
}

function bboxOf(d) {
  const nums = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    minX = Math.min(minX, nums[i]);
    maxX = Math.max(maxX, nums[i]);
    minY = Math.min(minY, nums[i + 1]);
    maxY = Math.max(maxY, nums[i + 1]);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

const BBOX = pathBlocks.reduce((acc, p) => {
  const b = bboxOf(p.d);
  return {
    minX: Math.min(acc.minX, b.minX),
    minY: Math.min(acc.minY, b.minY),
    maxX: Math.max(acc.maxX, b.maxX),
    maxY: Math.max(acc.maxY, b.maxY),
  };
}, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
BBOX.w = BBOX.maxX - BBOX.minX;
BBOX.h = BBOX.maxY - BBOX.minY;

/* ------------------------------------------------------------------ colour */

const toRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (rgb) => "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
function toHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r ? ((g - b) / d + (g < b ? 6 : 0)) / 6 :
    max === g ? ((b - r) / d + 2) / 6 :
    ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}
function toRgbHsl([h, s, l]) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  return [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6].map((v) => (v + m) * 255);
}
const luminance = (hex) => {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** Official cyan hue and saturation, darkened only as far as paper contrast needs. */
function accentOn(bg, target) {
  const [h, s] = toHsl(toRgb(ACCENT_OFFICIAL));
  for (let l = 0.5; l > 0.05; l -= 0.005) {
    const hex = toHex(toRgbHsl([h, s, l]));
    if (contrast(hex, bg) >= target) return hex;
  }
  return INK;
}
const ACCENT_ON_PAPER = accentOn(PAPER, 3.05);

/* ---------------------------------------------------------------- assembly */

const repaintDefs = (prefix, stops) =>
  defsBlock
    .replace(/<defs>|<\/defs>/g, "")
    .replaceAll('id="g', `id="${prefix}g`)
    .replaceAll('url(#g', `url(#${prefix}g`)
    .replaceAll("#f6f6f7", stops[0])
    .replaceAll("#cfd0d3", stops[1])
    .replaceAll("#85868b", stops[2]);

const repaintPaths = (prefix, stops, accent, mono) =>
  pathBlocks
    .map((p, i) => {
      const fill = mono ? mono : i === ACCENT_ID ? accent : `url(#${prefix}g${i})`;
      return `<path fill="${fill}" fill-rule="evenodd" d="${p.d}"/>`;
    })
    .join("");

/** Standalone mark: master viewBox, master geometry, recoloured only. */
function markSvg({ stops = SILVER, accent = ACCENT_OFFICIAL, mono = null, prefix, title }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 840 540" role="img" aria-labelledby="t">` +
    `<title id="t">${title}</title>` +
    (mono ? "" : `<defs>${repaintDefs(prefix, stops)}</defs>`) +
    repaintPaths(prefix, stops, accent, mono) +
    `</svg>\n`;
}

/**
 * Stencil for CSS `mask-*`: same geometry, but with intrinsic width/height so
 * Chromium resolves the image size, and a single opaque fill so the alpha
 * channel is the whole silhouette.
 */
function maskSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 840 540" width="840" height="540" aria-hidden="true">` +
    repaintPaths("mk", SILVER, ACCENT_OFFICIAL, "#000") +
    `</svg>\n`;
}

/** Square tile for app icons, favicons and launcher contexts. */
function tileSvg({ stops = SILVER, accent = ACCENT_OFFICIAL, mono = null, background = INK, size = 512, fill = 0.8, prefix, title }) {
  const scale = (size * fill) / BBOX.w;
  const x = (size - BBOX.w * scale) / 2 - BBOX.minX * scale;
  const y = (size - BBOX.h * scale) / 2 - BBOX.minY * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-labelledby="t">` +
    `<title id="t">${title}</title>` +
    (background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : "") +
    (mono ? "" : `<defs>${repaintDefs(prefix, stops)}</defs>`) +
    `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(5)})">` +
    repaintPaths(prefix, stops, accent, mono) +
    `</g></svg>\n`;
}

/* ---------------------------------------------------------------- lockups */

// The wordmark outline is its own asset so re-runs never read back a lockup.
const WORDMARK = path.join(PUBLIC, "weirwise-wordmark.svg");
const wordmarkPath = existsSync(WORDMARK)
  ? readFileSync(WORDMARK, "utf8").match(/<path d="([^"]+)" fill=/)[1]
  : (() => {
      const lockup = readFileSync(path.join(PUBLIC, "weirwise-horizontal.svg"), "utf8");
      const m = lockup.match(/<path transform="translate\(77,0\)" d="([^"]+)" fill="#F4F3EF"\/>/);
      if (!m) throw new Error("wordmark outline not found in weirwise-horizontal.svg");
      return m[1];
    })();
const WORD = bboxOf(wordmarkPath);

const wordmarkSvg = (fill, label) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${WORD.minX.toFixed(1)} ${WORD.minY.toFixed(1)} ${WORD.w.toFixed(1)} ${WORD.h.toFixed(1)}" role="img" aria-labelledby="t">` +
  `<title id="t">Weirwise (${label})</title>` +
  `<path d="${wordmarkPath}" fill="${fill}" fill-rule="evenodd"/>` +
  `</svg>\n`;
writeFileSync(path.join(PUBLIC, "weirwise-wordmark.svg"), wordmarkSvg(PAPER, "on dark"));
writeFileSync(path.join(PUBLIC, "weirwise-wordmark-light.svg"), wordmarkSvg(INK, "on light"));
writeFileSync(path.join(OUT, "weirwise-wordmark.svg"), wordmarkSvg(PAPER, "on dark"));
writeFileSync(path.join(OUT, "weirwise-wordmark-light.svg"), wordmarkSvg(INK, "on light"));

function lockupSvg({ stops, accent, prefix, textFill }) {
  const height = 96;
  const markH = 56;
  const markScale = markH / BBOX.h;
  const markW = BBOX.w * markScale;
  const gap = 20;
  const textScale = 0.58;
  const textW = WORD.w * textScale;
  const textH = WORD.h * textScale;
  const pad = 6;
  const width = Math.round(pad + markW + gap + textW + pad);
  const mx = pad - BBOX.minX * markScale;
  const my = (height - markH) / 2 - BBOX.minY * markScale;
  const tx = pad + markW + gap - WORD.minX * textScale;
  const ty = (height - textH) / 2 - WORD.minY * textScale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="t">` +
    `<title id="t">Weirwise</title>` +
    `<defs>${repaintDefs(prefix, stops)}</defs>` +
    `<g transform="translate(${mx.toFixed(2)} ${my.toFixed(2)}) scale(${markScale.toFixed(5)})">` +
    repaintPaths(prefix, stops, accent, null) +
    `</g>` +
    `<path transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${textScale.toFixed(4)})" fill="${textFill}" fill-rule="evenodd" d="${wordmarkPath}"/>` +
    `</svg>\n`;
}

/* ------------------------------------------------------- react geometry */

const gradients = [...defsBlock.matchAll(/<linearGradient id="g(\d)"[^>]*x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)">/g)]
  .map(([, i, x1, y1, x2, y2]) => ({ i: Number(i), x1: Number(x1), y1: Number(y1), x2: Number(x2), y2: Number(y2) }));
if (gradients.length !== 7) throw new Error(`parsed ${gradients.length} gradients`);

const reactModule =
  `// GENERATED by scripts/brand/build-official-mark.mjs from public/weirwise-mark.svg.\n` +
  `// Official mark geometry — edit the master SVG and re-run, never this file.\n` +
  `export const WW_MARK_VIEWBOX = "0 0 840 540";\n\n` +
  `export const WW_MARK_GRADIENTS = ${JSON.stringify(gradients, null, 2).replaceAll("\n", "\n")};\n\n` +
  `export const WW_MARK_PATHS = ${JSON.stringify(
    pathBlocks.map((p, i) => ({ d: p.d, accent: i === ACCENT_ID })),
    null,
    2
  )};\n`;
writeFileSync(path.join(REPO, "frontend/src/components/ui/weirwise-mark-paths.ts"), reactModule);

/* ------------------------------------------------------------------- emit */

const TILE = {
  app: { stops: SILVER, accent: ACCENT_OFFICIAL, background: INK, fill: 0.8, prefix: "a" },
  // Maskable tiles must keep every ink pixel inside the 66dp-of-108dp safe
  // circle, because launchers may crop harder than the inscribed circle. The
  // mark is 1.6:1, so its feather tips are the constraint: fill 0.62 left 3.4%
  // of them outside; 0.52 puts the farthest pixel at 0.586 x half.
  maskable: { stops: SILVER, accent: ACCENT_OFFICIAL, background: INK, fill: 0.52, prefix: "k" },
  monochrome: { mono: PAPER, background: null, fill: 0.52, prefix: "o" },
  favicon: { mono: PAPER, background: INK, fill: 0.94, prefix: "f" },
};

const svgFiles = {
  "weirwise-mark-ink.svg": markSvg({ stops: GRAPHITE, accent: ACCENT_ON_PAPER, prefix: "i", title: "Weirwise mark (light surfaces)" }),
  "weirwise-mark-mono-ink.svg": markSvg({ mono: INK, prefix: "mi", title: "Weirwise mark" }),
  "weirwise-mark-mono-paper.svg": markSvg({ mono: PAPER, prefix: "mp", title: "Weirwise mark" }),
  "weirwise-mark-mask.svg": maskSvg(),
  "weirwise-app-icon.svg": tileSvg({ ...TILE.app, title: "Weirwise app icon" }),
  "weirwise-app-icon-maskable.svg": tileSvg({ ...TILE.maskable, title: "Weirwise app icon (maskable)" }),
  "weirwise-app-icon-monochrome.svg": tileSvg({ ...TILE.monochrome, title: "Weirwise app icon (monochrome)" }),
  "favicon.svg": tileSvg({ ...TILE.favicon, title: "Weirwise" }),
  "weirwise-horizontal.svg": lockupSvg({ stops: SILVER, accent: ACCENT_OFFICIAL, prefix: "lh", textFill: PAPER }),
  "weirwise-horizontal-light.svg": lockupSvg({ stops: GRAPHITE, accent: ACCENT_ON_PAPER, prefix: "ll", textFill: INK }),
};

for (const [name, content] of Object.entries(svgFiles)) {
  const target = name === "favicon.svg" ? [path.join(PUBLIC, name), path.join(OUT, name)] : [path.join(PUBLIC, name), path.join(OUT, name)];
  for (const file of target) writeFileSync(file, content);
}
writeFileSync(path.join(APP, "icon.svg"), svgFiles["favicon.svg"]);

const rasterTargets = {
  "icon-512.png": [TILE.app, 512],
  "icon-192.png": [TILE.app, 192],
  "icon-512-maskable.png": [TILE.maskable, 512],
  "icon-512-monochrome.png": [TILE.monochrome, 512],
  "apple-touch-icon.png": [TILE.favicon, 180],
  "favicon-48.png": [TILE.favicon, 48],
  "favicon-32.png": [TILE.favicon, 32],
  "favicon-16.png": [TILE.favicon, 16],
};

const rasterBuffers = {};
for (const [name, [tile, size]] of Object.entries(rasterTargets)) {
  const buf = await sharp(Buffer.from(tileSvg({ ...tile, size: 1024, title: "Weirwise" })), { density: 384 })
    .resize(size, size)
    .png()
    .toBuffer();
  rasterBuffers[name] = buf;
  writeFileSync(path.join(PUBLIC, name), buf);
  writeFileSync(path.join(OUT, name), buf);
}

/* ------------------------------------------------------------------- .ico */

function icoFrom(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + 16 * entries.length;
  entries.forEach(([size, buf], i) => {
    const p = i * 16;
    dir[p] = size >= 256 ? 0 : size;
    dir[p + 1] = size >= 256 ? 0 : size;
    dir.writeUInt16LE(1, p + 2);
    dir.writeUInt16LE(32, p + 4);
    dir.writeUInt32LE(buf.length, p + 8);
    dir.writeUInt32LE(offset, p + 12);
    offset += buf.length;
  });
  return Buffer.concat([header, dir, ...entries.map(([, buf]) => buf)]);
}

const icoEntries = [];
for (const size of [16, 24, 32, 48]) {
  icoEntries.push([size, rasterBuffers[`favicon-${size}.png`] || (await sharp(Buffer.from(tileSvg({ ...TILE.favicon, size: 1024, title: "Weirwise" })), { density: 384 }).resize(size, size).png().toBuffer())]);
}
writeFileSync(path.join(PUBLIC, "favicon.ico"), icoFrom(icoEntries));
writeFileSync(path.join(OUT, "favicon.ico"), icoFrom(icoEntries));

console.log(JSON.stringify({
  bbox: BBOX,
  aspect: +(BBOX.w / BBOX.h).toFixed(3),
  accentOnPaper: ACCENT_ON_PAPER,
  accentContrastOnPaper: +contrast(ACCENT_ON_PAPER, PAPER).toFixed(2),
  graphiteContrastOnPaper: +contrast(GRAPHITE[1], PAPER).toFixed(2),
  masterBytes: readFileSync(MASTER, "utf8").length,
  geometryBytes: readFileSync(path.join(PUBLIC, "weirwise-mark-ink.svg"), "utf8").length,
  written: [...Object.keys(svgFiles), ...Object.keys(rasterTargets), "favicon.ico", "src/app/icon.svg"],
}, null, 2));
