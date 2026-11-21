/* Small helpers shared by all routes: error handling, input checks, pagination. */

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Wraps an async route so thrown errors reach the error handler instead of crashing the request. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const clientIp = (req) => (req.ip || "").replace(/^::ffff:/, "").slice(0, 64);

/* ---------- input checks: each returns the cleaned value or throws a 400 ---------- */
const bad = (field, msg) => { throw new HttpError(400, msg, { field }); };

export function str(v, field, { min = 0, max = 255, optional = false, pattern, msg } = {}) {
  if (v === undefined || v === null || v === "") {
    if (optional) return null;
    bad(field, msg || `${field} is required`);
  }
  if (typeof v !== "string" && typeof v !== "number") bad(field, `${field} must be text`);
  const s = String(v).trim();
  if (!s && !optional) bad(field, msg || `${field} is required`);
  if (s.length < min) bad(field, msg || `${field} must be at least ${min} characters`);
  if (s.length > max) bad(field, `${field} must be at most ${max} characters`);
  if (pattern && s && !pattern.test(s)) bad(field, msg || `${field} is not valid`);
  return s || null;
}

export function num(v, field, { min = -Infinity, max = Infinity, int = false, optional = false } = {}) {
  if (v === undefined || v === null || v === "") {
    if (optional) return null;
    bad(field, `${field} is required`);
  }
  const n = Number(v);
  if (!Number.isFinite(n)) bad(field, `${field} must be a number`);
  if (int && !Number.isInteger(n)) bad(field, `${field} must be a whole number`);
  if (n < min || n > max) bad(field, `${field} must be between ${min} and ${max}`);
  return n;
}

export function oneOf(v, field, allowed, { optional = false } = {}) {
  if ((v === undefined || v === null || v === "") && optional) return null;
  if (!allowed.includes(v)) bad(field, `${field} must be one of: ${allowed.join(", ")}`);
  return v;
}

export function strList(v, field, { maxItems = 10, maxLen = 200, pattern } = {}) {
  if (v === undefined || v === null || v === "") return [];
  if (!Array.isArray(v)) bad(field, `${field} must be a list`);
  if (v.length > maxItems) bad(field, `${field} can have at most ${maxItems} items`);
  return v.map((x, i) => str(x, `${field}[${i + 1}]`, { max: maxLen, pattern })).filter(Boolean);
}

export const bool = (v) => v === true || v === 1 || v === "1" || v === "true";

export const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
export const URL_RE = /^https?:\/\/[^\s"'<>]+$/i;

/** Indian mobile → 10 digits, or null if it isn't one. Accepts +91 / 91 / 0 prefixes and spaces. */
export function mobile10(v) {
  let d = String(v || "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

/* Phone numbers are stored in international (E.164) form, e.g. +919876543210, so other countries can be added
   later by extending COUNTRIES. Phase 1 accepts Indian mobiles only. */
const COUNTRIES = { IN: { code: "91", national: (d) => mobile10(d) } };

/** A mobile number → { e164: "+919876543210", national: "9876543210" }, or null if it isn't valid. */
export function normalizePhone(v, country = "IN") {
  const c = COUNTRIES[country];
  const national = c && c.national(v);
  return national ? { e164: `+${c.code}${national}`, national } : null;
}

/** The national part of a stored number ("+919876543210" → "9876543210"). */
export const nationalPhone = (e164) => (e164 ? String(e164).replace(/^\+91/, "") : null);

/** "+919876543210" → "+91 98XXXXXX10" (for people who don't need to see the full number). */
export const maskPhone = (p) => {
  const d = String(p || "").replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `+91 ${d.slice(0, 2)}XXXXXX${d.slice(8)}` : p ? "XXXX" : "";
};

/** Strong-enough password: 8+ characters with a letter and a number. */
export function password(v, field = "password") {
  const s = typeof v === "string" ? v : "";
  if (s.length < 8 || s.length > 128 || !/[a-z]/i.test(s) || !/\d/.test(s)) {
    bad(field, "Password must be at least 8 characters and include a letter and a number");
  }
  return s;
}

export function paging(q, { maxLimit = 100, defLimit = 20 } = {}) {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(q.limit, 10) || defLimit));
  return { page, limit, offset: (page - 1) * limit };
}

export const slugify = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);

/** JSON column → array (mysql2 already parses JSON, but older rows may be strings). */
export const jsonList = (v) => {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") { try { const a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch { return []; } }
  return [];
};
