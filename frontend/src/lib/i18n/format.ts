import { getSpec, type Locale } from "./index";

/**
 * Formatting is locale-derived, never hand-rolled. A `$` prefix glued to a
 * number, or a Latin "1,234" inside a Persian sentence, both read as broken to
 * the person who matters most here: the one who speaks that language.
 *
 * Intl objects are expensive to construct and the same call repeats across
 * renders, so each distinct shape is built once.
 */
type AnyOpts = Intl.NumberFormatOptions | Intl.DateTimeFormatOptions;
const nfCache = new Map<string, Intl.NumberFormat>();
const dfCache = new Map<string, Intl.DateTimeFormat>();

function keyOf(locale: Locale, opts: AnyOpts) {
  return locale + "|" + JSON.stringify(opts);
}

function numberFormat(locale: Locale, opts: Intl.NumberFormatOptions) {
  const k = keyOf(locale, opts);
  let f = nfCache.get(k);
  if (!f) {
    const spec = getSpec(locale);
    // `numberingSystem` is real in V8 and in the ES402 spec but missing from
    // this TypeScript's NumberFormatOptions, so the shape is asserted, not cast away.
    f = new Intl.NumberFormat(spec.bcp47, { numberingSystem: spec.numbering, ...opts } as Intl.NumberFormatOptions & {
      numberingSystem: string;
    });
    nfCache.set(k, f);
  }
  return f;
}

export function formatNumber(value: number, locale: Locale, opts: Intl.NumberFormatOptions = {}) {
  if (!Number.isFinite(value)) return "—";
  return numberFormat(locale, opts).format(value);
}

export function formatCurrency(
  value: number,
  locale: Locale,
  currency = "USD",
  opts: Intl.NumberFormatOptions = {}
) {
  if (!Number.isFinite(value)) return "—";
  return numberFormat(locale, { style: "currency", currency, ...opts }).format(value);
}

/** Compact is for dashboard counters; it keeps a large figure on one line. */
export function formatCompact(value: number, locale: Locale) {
  return formatNumber(value, locale, { notation: "compact", maximumFractionDigits: 1 });
}

export function formatDate(
  value: string | number | Date,
  locale: Locale,
  opts: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" }
) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const spec = getSpec(locale);
  const k = keyOf(locale, opts);
  let f = dfCache.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat(spec.bcp47, {
      numberingSystem: spec.numbering,
      calendar: spec.calendar,
      ...opts,
    } as Intl.DateTimeFormatOptions & { numberingSystem: string; calendar: string });
    dfCache.set(k, f);
  }
  return f.format(date);
}

export function formatDateTime(value: string | number | Date, locale: Locale) {
  return formatDate(value, locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Relative times stay relative — "3 days ago" localizes, "3 d" does not read.
 * Intl.RelativeTimeFormat has no units in `en` other than English, so the table
 * is deliberately small and mirrors what the screens actually show.
 */
export function formatRelative(value: string | number | Date, locale: Locale) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const spec = getSpec(locale);
  const rtf = new Intl.RelativeTimeFormat(spec.bcp47, { numeric: "always" });
  const seconds = (date.getTime() - Date.now()) / 1000;
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(Math.round(seconds), "second");
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 2592000) return rtf.format(Math.round(seconds / 86400), "day");
  return formatDate(date, locale);
}

/** Units are Latin abbreviations in every locale we ship; only the number moves. */
export function formatBytes(bytes: number, locale: Locale) {
  if (!Number.isFinite(bytes) || bytes <= 0) return formatNumber(0, locale) + " B";
  const units = ["B", "kB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return (
    formatNumber(value, locale, { maximumFractionDigits: exponent === 0 ? 0 : 1 }) + " " + units[exponent]
  );
}

/**
 * Isolate an embedding so a Latin product name, URL or figure inside RTL copy
 * cannot steal the surrounding punctuation. Marks are zero-width and invisible.
 */
export function isolate(value: string) {
  return `\u2066${value}\u2069`;
}
