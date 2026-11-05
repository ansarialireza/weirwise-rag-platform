/**
 * Publishes the generated brand assets to the private weirwise-brand repository
 * and verifies that the two copies stay byte-identical.
 *
 *   node scripts/brand/sync-brand-repo.mjs            # copy + verify
 *   node scripts/brand/sync-brand-repo.mjs --check    # verify only, exits 1 on drift
 *
 * Run scripts/brand/build-official-mark.mjs first; this script only moves files
 * and refreshes the checksum table in identity/brand-assets.md.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PUB = path.join(REPO, "frontend/public");
const STAGE = path.join(REPO, "var/brand-assets");

const BRAND_ARG = process.argv.slice(2).find((a) => !a.startsWith("--"));
const BRAND = path.resolve(REPO, BRAND_ARG ?? "../weirwise-brand");
const CHECK_ONLY = process.argv.includes("--check");

const MAP = {
  "assets/master": [["weirwise-mark.svg", PUB]],
  "assets/mark": [
    ["weirwise-mark-ink.svg", STAGE],
    ["weirwise-mark-mono-ink.svg", STAGE],
    ["weirwise-mark-mono-paper.svg", STAGE],
    ["weirwise-mark-mask.svg", STAGE],
  ],
  "assets/wordmark": [
    ["weirwise-wordmark.svg", STAGE],
    ["weirwise-wordmark-light.svg", STAGE],
  ],
  "assets/lockup": [
    ["weirwise-horizontal.svg", STAGE],
    ["weirwise-horizontal-light.svg", STAGE],
  ],
  "assets/icon": [
    ["weirwise-app-icon.svg", STAGE],
    ["weirwise-app-icon-maskable.svg", STAGE],
    ["weirwise-app-icon-monochrome.svg", STAGE],
    ["favicon.svg", STAGE],
    ["favicon.ico", STAGE],
  ],
  "assets/png": [
    ["icon-512.png", STAGE],
    ["icon-512-maskable.png", STAGE],
    ["icon-512-monochrome.png", STAGE],
    ["icon-192.png", STAGE],
    ["apple-touch-icon.png", STAGE],
    ["favicon-48.png", STAGE],
    ["favicon-32.png", STAGE],
    ["favicon-16.png", STAGE],
    ["weirwise-og.png", PUB],
  ],
};

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

if (!existsSync(path.join(BRAND, "identity"))) {
  console.error(`brand repository not found at ${BRAND}`);
  process.exit(1);
}

let drift = 0;
const rows = [];

for (const [dir, files] of Object.entries(MAP)) {
  for (const [name, source] of files) {
    const from = path.join(source, name);
    const to = path.join(BRAND, dir, name);
    if (!existsSync(from)) {
      console.error(`MISSING source ${path.relative(REPO, from)}`);
      drift++;
      continue;
    }
    const bytes = readFileSync(from);
    if (!CHECK_ONLY) {
      mkdirSync(path.dirname(to), { recursive: true });
      writeFileSync(to, bytes);
    }
    if (!existsSync(to)) {
      console.error(`MISSING target ${path.relative(BRAND, to)}`);
      drift++;
      continue;
    }
    const same = sha256(readFileSync(to)) === sha256(bytes);
    if (!same) drift++;
    rows.push(`${same ? "same" : "DRIFT"}  ${dir}/${name}  ${sha256(bytes).slice(0, 16)}`);
  }
}

console.log(rows.join("\n"));

/* The checksum table in the brand registry is generated here so it cannot drift
 * from the bytes it claims to describe. palette.svg is hand-authored, so its
 * row is measured rather than published. */
const REGISTRY = path.join(BRAND, "identity/brand-assets.md");
const extra = ["palette.svg"].filter((n) => existsSync(path.join(BRAND, "assets", n)));
const tableRows = [
  ...Object.entries(MAP).flatMap(([dir, files]) =>
    files.map(([name]) => {
      const to = path.join(BRAND, dir, name);
      return existsSync(to) ? [`\`${dir}/${name}\``, sha256(readFileSync(to)).slice(0, 16)] : null;
    }).filter(Boolean)
  ),
  ...extra.map((n) => [`\`assets/${n}\``, sha256(readFileSync(path.join(BRAND, "assets", n))).slice(0, 16)]),
];

if (existsSync(REGISTRY)) {
  const md = readFileSync(REGISTRY, "utf8");
  const eol = md.includes("\r\n") ? "\r\n" : "\n";
  const body = tableRows.map(([f, h]) => `| ${f} | \`${h}\` |`).join(eol);
  const next = md.replace(
    /(\| File \| SHA-256 \(first 16 hex\) \|\r?\n\| :--- \| :--- \|\r?\n)((?:\|[^\r\n]*\|\r?\n)+)/,
    (_m, head) => head + body + eol
  );
  if (next !== md) {
    if (CHECK_ONLY) {
      console.error("DRIFT  identity/brand-assets.md checksum table is stale");
      drift++;
    } else {
      writeFileSync(REGISTRY, next);
      console.log(`rewrote checksum table (${tableRows.length} rows)`);
    }
  }
} else {
  console.error(`MISSING registry ${path.relative(BRAND, REGISTRY)}`);
  drift++;
}

console.log(`\n${CHECK_ONLY ? "checked" : "published"} ${rows.length} assets, ${drift} drifted`);
process.exit(drift ? 1 : 0);
