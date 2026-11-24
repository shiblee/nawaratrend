/* Sign-in checks. Admins use a bearer token (8 hours); customers use an HttpOnly session cookie, so the
   two can never be mixed up and a customer session can never open the admin API. Admin tokens are re-checked against the database on every
   request, so deactivating an admin or changing their password ends their sessions immediately. */
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { pool } from "../config/db.js";
import { HttpError, clientIp } from "../lib/http.js";
import { can } from "../lib/permissions.js";

const SECRET = () => process.env.JWT_SECRET;

export const signAdminToken = (admin) =>
  jwt.sign({ sub: admin.id, role: admin.role, tv: admin.token_version }, SECRET(), { audience: "admin", expiresIn: "8h" });

const bearer = (req) => {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
};

export async function requireAdmin(req, res, next) {
  try {
    const token = bearer(req);
    if (!token) throw new HttpError(401, "Please sign in");
    let payload;
    try { payload = jwt.verify(token, SECRET(), { audience: "admin" }); }
    catch { throw new HttpError(401, "Your session has expired. Please sign in again."); }
    const [rows] = await pool.query(
      "SELECT id, name, email, role, is_active, token_version, must_change_password FROM admins WHERE id = ?", [payload.sub]
    );
    const admin = rows[0];
    if (!admin || !admin.is_active || admin.token_version !== payload.tv) {
      throw new HttpError(401, "Your session has ended. Please sign in again.");
    }
    req.admin = admin;
    next();
  } catch (err) { next(err); }
}

/** Use after requireAdmin: only these roles may continue. */
export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.admin?.role) ? next() : next(new HttpError(403, "You don't have permission to do this"));

/** Use after requireAdmin: the admin's role must have this permission (see lib/permissions.js). */
export const requirePerm = (perm) => (req, res, next) =>
  can(req.admin, perm) ? next() : next(new HttpError(403, "You don't have permission to do this"));

/* ---------- customer sessions (HttpOnly cookie) ----------
   The cookie holds a random token; the database keeps only its hash (customer_sessions), so signing out
   revokes it everywhere. "Remember me" keeps the cookie for 30 days; otherwise it lasts until the browser
   closes (and at most 12 hours on the server). */
export const SESSION_COOKIE = "nt_sid";
export const CSRF_COOKIE = "nt_csrf";
const REMEMBER_DAYS = 30, SHORT_HOURS = 12;
const secure = () => process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "1";
const hash = (t) => crypto.createHash("sha256").update(t).digest("hex");

export function readCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) { try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* bad cookie */ } }
  }
  return out;
}

function setCookie(res, name, value, { httpOnly = true, maxAgeSec = null } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "SameSite=Lax"];
  if (httpOnly) parts.push("HttpOnly");
  if (secure()) parts.push("Secure");
  if (maxAgeSec !== null) parts.push(`Max-Age=${maxAgeSec}`);
  res.append("Set-Cookie", parts.join("; "));
}

/** Signs the customer in on this browser. */
/** method: how they got in (password, code, google, signup, reset, renewed), shown in the admin's sign-in history. */
export async function startCustomerSession(req, res, customerId, { remember = false, method = null } = {}) {
  const token = crypto.randomBytes(32).toString("base64url");
  await pool.query(
    `INSERT INTO customer_sessions (customer_id, token_hash, remember, method, ip, user_agent, last_seen_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW() + INTERVAL ${remember ? `${REMEMBER_DAYS} DAY` : `${SHORT_HOURS} HOUR`})`,
    [customerId, hash(token), remember ? 1 : 0, method, clientIp(req), String(req.get("user-agent") || "").slice(0, 255)]);
  await pool.query("UPDATE customers SET last_login_at = NOW(), last_login_ip = ? WHERE id = ?", [clientIp(req), customerId]);
  setCookie(res, SESSION_COOKIE, token, { maxAgeSec: remember ? REMEMBER_DAYS * 86400 : null });
}

/** Signs this browser out (the session can't be used again, even from a copied cookie). */
export async function endCustomerSession(req, res, reason = "logout") {
  const token = readCookies(req)[SESSION_COOKIE];
  if (token) await pool.query("UPDATE customer_sessions SET revoked_at = NOW(), revoke_reason = ? WHERE token_hash = ? AND revoked_at IS NULL", [reason, hash(token)]);
  setCookie(res, SESSION_COOKIE, "", { maxAgeSec: 0 });
}

/** Ends every session of a customer (password reset, "sign out everywhere", account suspended). */
export async function revokeCustomerSessions(customerId, reason, conn = pool) {
  await conn.query("UPDATE customer_sessions SET revoked_at = NOW(), revoke_reason = ? WHERE customer_id = ? AND revoked_at IS NULL", [reason, customerId]);
}

/** Sets req.customer if this browser has a valid session; guests continue without one. */
export async function optionalCustomer(req, res, next) {
  try {
    const token = readCookies(req)[SESSION_COOKIE];
    if (token && token.length < 100) {
      const [rows] = await pool.query(
        `SELECT c.id, c.name, c.email, c.phone, c.phone_verified_at, c.email_verified_at, c.is_active, c.created_at, a.updated_at AS avatar_at,
           s.id AS session_id, s.last_seen_at
         FROM customer_sessions s JOIN customers c ON c.id = s.customer_id LEFT JOIN customer_avatars a ON a.customer_id = c.id
         WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > NOW()`, [hash(token)]);
      const r = rows[0];
      if (r?.is_active) {
        req.customer = r;
        if (!r.last_seen_at || Date.now() - new Date(r.last_seen_at).getTime() > 5 * 60000) {
          pool.query("UPDATE customer_sessions SET last_seen_at = NOW() WHERE id = ?", [r.session_id]).catch(() => {});
        }
      }
    }
    next();
  } catch (err) { next(err); }
}

export function requireCustomer(req, res, next) {
  optionalCustomer(req, res, (err) => {
    if (err) return next(err);
    if (!req.customer) return next(new HttpError(401, "Please sign in"));
    next();
  });
}

/* ---------- CSRF (double-submit cookie) ----------
   The storefront reads the nt_csrf cookie and sends it back in an X-CSRF-Token header on every change.
   Another website can make the browser send our cookies, but it can't read them to fill in the header. */
export function ensureCsrfCookie(req, res) {
  let t = readCookies(req)[CSRF_COOKIE];
  if (!t || !/^[A-Za-z0-9_-]{32,64}$/.test(t)) { t = crypto.randomBytes(24).toString("base64url"); setCookie(res, CSRF_COOKIE, t, { httpOnly: false }); }
  return t;
}

export function csrfProtect(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const cookie = readCookies(req)[CSRF_COOKIE] || "";
  const header = String(req.get("x-csrf-token") || "");
  if (!cookie || cookie.length !== header.length || !crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(header))) {
    return next(new HttpError(403, "Your session needs refreshing. Please reload the page and try again.", { code: "csrf" }));
  }
  next();
}
