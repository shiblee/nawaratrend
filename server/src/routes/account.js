/* Customer accounts: sign-up with mobile OTP, sign-in with mobile + password, profile and photo, password
   (change, and reset by mobile OTP),
   sign out everywhere, the customer's own orders with tracking, and public order tracking for guests.
   Every order query is limited to the signed-in customer's own orders. */
import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { pool } from "../config/db.js";
import { ah, HttpError, str, EMAIL, mobile10, password, clientIp, jsonList, normalizePhone, nationalPhone } from "../lib/http.js";
import { getSettings } from "../lib/store.js";
import { STATUS, PROGRESS, DEFAULT_MESSAGE, PAYMENT_STATUS, PAY_METHOD } from "../lib/orders.js";
import { queueEmail, customerVars } from "../lib/email/index.js";
import { startOtp, resendOtp, verifyOtp, otpSettings, sessionInfo, inTransaction, sha256 } from "../lib/otp.js";
import { requireCustomer, startCustomerSession, endCustomerSession, revokeCustomerSessions, ensureCsrfCookie } from "../middleware/auth.js";

const router = express.Router();
const limit = (windowMin, max, message, extra = {}) =>
  rateLimit({ windowMs: windowMin * 60 * 1000, max, standardHeaders: true, legacyHeaders: false, message: { message }, ...extra });
const authLimit = limit(15, 20, "Too many attempts. Please wait a few minutes and try again.", { skipSuccessfulRequests: true });
// compared against when no account matches, so "no such account" and "wrong password" take the same time
const DUMMY_HASH = bcrypt.hashSync("no-account-placeholder", 12);

/* ---------- profile photos ----------
   Served from an address that can't be guessed (signed with the server secret), so <img> tags work without sign-in
   but nobody can list other customers' photos. */
const avatarSig = (id) => crypto.createHmac("sha256", process.env.JWT_SECRET).update(`avatar:${id}`).digest("hex").slice(0, 20);
const avatarUrl = (c) => (c.avatar_at ? `/api/store/avatars/${c.id}-${avatarSig(c.id)}.jpg?v=${new Date(c.avatar_at).getTime()}` : null);
export { avatarUrl };

export const publicCustomer = (c) => ({
  id: c.id, name: c.name, contact: nationalPhone(c.phone) || c.email, email: c.email || null, phone: nationalPhone(c.phone),
  phoneVerified: !!c.phone_verified_at, emailVerified: !!c.email_verified_at, avatar: avatarUrl(c), since: c.created_at || null,
});

const loadCustomer = async (id, conn = pool) => {
  const [rows] = await conn.query(
    "SELECT c.*, a.updated_at AS avatar_at FROM customers c LEFT JOIN customer_avatars a ON a.customer_id = c.id WHERE c.id = ?", [id]);
  return rows[0];
};

const parseMobile = (v, field = "mobile") => {
  const p = normalizePhone(v);
  if (!p) throw new HttpError(400, "Enter a valid 10-digit Indian mobile number", { field });
  return p;
};
const confirmMatches = (pw, again, field = "confirmPassword") => {
  if (typeof again !== "string" || again !== pw) throw new HttpError(400, "The two passwords don't match", { field });
};
const remembered = (v) => v === true || v === 1 || v === "1" || v === "true";

/* ---------- sign up (mobile OTP) ----------
   1. POST /auth/register        details checked, a pending sign-up is saved, a code is texted
   2. POST /auth/register/verify the code is checked; only now is the customer account created (in one transaction)
   POST /auth/otp/resend         a new code for the same sign-up (or password reset)                          */
router.get("/auth/csrf", (req, res) => { res.set("Cache-Control", "no-store"); res.json({ csrf: ensureCsrfCookie(req, res) }); });

router.post("/auth/register", authLimit, ah(async (req, res) => {
  const b = req.body || {};
  const name = str(b.name, "name", { min: 2, max: 100, msg: "Enter your full name (2 to 100 characters)" });
  const phone = parseMobile(b.mobile);
  const email = str(b.email, "email", { optional: true, max: 150, pattern: EMAIL, msg: "Check the email address, for example name@gmail.com" })?.toLowerCase() || null;
  const pw = password(b.password);
  if (b.confirmPassword !== undefined) confirmMatches(pw, b.confirmPassword);   // the sign-up form no longer asks twice
  if (!remembered(b.acceptTerms)) throw new HttpError(400, "Please accept the Terms and Privacy Policy to create an account", { field: "acceptTerms" });

  const [taken] = await pool.query("SELECT id FROM customers WHERE phone = ?", [phone.e164]);
  if (taken.length) throw new HttpError(409, "An account with this mobile number already exists. Please sign in instead.", { field: "mobile", code: "mobile_taken" });
  if (email) {
    const [e] = await pool.query("SELECT id FROM customers WHERE email = ?", [email]);
    if (e.length) throw new HttpError(409, "This email address is already used by another account. Use a different one, or leave it empty.", { field: "email", code: "email_taken" });
  }
  const cfg = otpSettings(await getSettings());
  if (!cfg.enabled) throw new HttpError(503, "New accounts can't be created right now because mobile verification is unavailable. Please try again later.", { code: "otp_disabled" });

  // an earlier unfinished sign-up for this number is replaced (only whoever holds the phone can finish either)
  await pool.query("UPDATE pending_registrations SET status = 'cancelled', password_hash = NULL WHERE phone = ? AND status = 'pending'", [phone.e164]);
  const [ins] = await pool.query(
    "INSERT INTO pending_registrations (name, phone, email, password_hash, ip, expires_at) VALUES (?, ?, ?, ?, ?, NOW() + INTERVAL ? HOUR)",
    [name, phone.e164, email, await bcrypt.hash(pw, 12), clientIp(req), cfg.pending_hours]);
  const { row, sent } = await startOtp({ purpose: "registration", phone: phone.e164, pendingId: ins.insertId, ip: clientIp(req) });
  res.status(201).json({ ...sessionInfo(row, cfg), sent,
    message: sent ? `We've sent a ${cfg.length}-digit code to your mobile.` : "We couldn't send the code just now. Please tap \"Resend code\" in a moment." });
}));

router.post("/auth/register/verify", authLimit, ah(async (req, res) => {
  const out = await inTransaction(async (conn) => {
    const otp = await verifyOtp(conn, req.body?.session, req.body?.otp, { purpose: "registration" });
    const [[p]] = await conn.query("SELECT * FROM pending_registrations WHERE id = ? FOR UPDATE", [otp.pending_id]);
    if (!p || p.status !== "pending" || new Date(p.expires_at) <= new Date() || !p.password_hash) {
      throw new HttpError(410, "This sign-up has expired. Please fill in the form again.", { code: "registration_expired" });
    }
    let id;
    try {
      const [r] = await conn.query(
        "INSERT INTO customers (name, email, phone, phone_verified_at, password) VALUES (?, ?, ?, NOW(), ?)", [p.name, p.email, p.phone, p.password_hash]);
      id = r.insertId;
    } catch (err) {
      // someone else finished signing up with this number (or email) a moment earlier: never overwrite their account
      if (err.code === "ER_DUP_ENTRY") {
        const emailClash = /email/i.test(err.message);
        throw new HttpError(409, emailClash ? "This email address is already used by another account. Please sign up again without it, or with a different one."
          : "An account with this mobile number already exists. Please sign in instead.", { code: emailClash ? "email_taken" : "mobile_taken" });
      }
      throw err;
    }
    await conn.query("UPDATE pending_registrations SET status = 'completed', customer_id = ?, completed_at = NOW(), password_hash = NULL WHERE id = ?", [id, p.id]);
    await conn.query("UPDATE otp_verifications SET status = 'used', customer_id = ? WHERE id = ?", [id, otp.id]);
    await conn.query("UPDATE sms_logs SET customer_id = ? WHERE otp_id = ?", [id, otp.id]);
    return id;
  });
  const c = await loadCustomer(out);
  // the account is active whatever happens to the email: queueEmail never throws and sends in the background
  if (c.email) await queueEmail({ key: "registration_confirmation", to: c.email, vars: customerVars(c), customerId: c.id, trigger: "registration",
    dedupeKey: `registration_confirmation:${c.id}` });
  await startCustomerSession(req, res, c.id, { remember: remembered(req.body?.remember) });
  res.status(201).json({ customer: publicCustomer(c) });
}));

const OTP_PURPOSES = { registration: "registration", reset: "password_reset", password_reset: "password_reset" };
router.post("/auth/otp/resend", limit(15, 15, "Too many requests. Please wait a few minutes."), ah(async (req, res) => {
  const purpose = OTP_PURPOSES[req.body?.purpose] || "registration";
  if (purpose === "registration") {
    const [[p]] = await pool.query(
      "SELECT p.status, p.expires_at FROM otp_verifications o JOIN pending_registrations p ON p.id = o.pending_id WHERE o.public_id = ?", [String(req.body?.session || "")]);
    if (p && (p.status !== "pending" || new Date(p.expires_at) <= new Date())) throw new HttpError(410, "This sign-up has expired. Please fill in the form again.", { code: "registration_expired" });
  }
  const { row, sent, cfg } = await resendOtp(req.body?.session, { purpose, ip: clientIp(req) });
  res.json({ ...sessionInfo(row, cfg), sent,
    message: sent ? "We've sent you a new code. The previous code no longer works." : "We couldn't send the code just now. Please try again in a moment." });
}));

/* ---------- sign in / out ---------- */
router.post("/auth/login", authLimit, ah(async (req, res) => {
  const phone = parseMobile(req.body?.mobile);
  const pw = typeof req.body?.password === "string" ? req.body.password : "";
  const [rows] = await pool.query("SELECT * FROM customers WHERE phone = ?", [phone.e164]);
  const c = rows[0];
  const fail = new HttpError(401, "Wrong mobile number or password");
  if (!c || !c.password) { await bcrypt.compare(pw, DUMMY_HASH); throw fail; }
  if (c.locked_until && new Date(c.locked_until) > new Date()) throw new HttpError(429, "Too many wrong passwords. Please try again in 15 minutes, or reset your password.");
  if (!(await bcrypt.compare(pw, c.password))) {
    await pool.query(
      "UPDATE customers SET failed_attempts = failed_attempts + 1, locked_until = IF(failed_attempts >= 5, NOW() + INTERVAL 15 MINUTE, NULL) WHERE id = ?", [c.id]);
    throw fail;
  }
  // only someone who knows the password learns that the account is suspended
  if (!c.is_active) throw new HttpError(403, "This account has been suspended. Please contact us for help.", { code: "suspended" });
  await pool.query("UPDATE customers SET failed_attempts = 0, locked_until = NULL WHERE id = ?", [c.id]);
  await startCustomerSession(req, res, c.id, { remember: remembered(req.body?.remember) });
  res.json({ customer: publicCustomer(await loadCustomer(c.id)) });
}));

router.get("/auth/me", requireCustomer, ah(async (req, res) => { res.set("Cache-Control", "no-store"); res.json({ customer: publicCustomer(req.customer) }); }));

router.post("/auth/logout", ah(async (req, res) => {
  await endCustomerSession(req, res, "logout");
  res.json({ ok: true });
}));

// ends every session, on every device (this one included)
router.post("/auth/logout-everywhere", requireCustomer, ah(async (req, res) => {
  await revokeCustomerSessions(req.customer.id, "logout_everywhere");
  await endCustomerSession(req, res, "logout_everywhere");
  res.json({ ok: true });
}));

/* ---------- forgotten password (mobile OTP) ----------
   1. POST /auth/forgot         { mobile }              → a code is texted if the number has an account
   2. POST /auth/forgot/verify  { session, otp }        → a short-lived reset token
   3. POST /auth/forgot/reset   { session, resetToken, password, confirmPassword }
   Step 1 answers the same way whether or not the number has an account. */
const RESET_TOKEN_MINUTES = 10;
const GENERIC_FORGOT = "If an account uses this number, we've sent it a verification code.";

router.post("/auth/forgot", limit(15, 5, "Too many reset requests. Please wait 15 minutes."), ah(async (req, res) => {
  const phone = parseMobile(req.body?.mobile);
  const [rows] = await pool.query("SELECT id, is_active FROM customers WHERE phone = ?", [phone.e164]);
  const c = rows[0]?.is_active ? rows[0] : null;
  const { row, cfg } = await startOtp({ purpose: "password_reset", phone: phone.e164, customerId: c?.id || null, ip: clientIp(req), decoy: !c });
  res.json({ ...sessionInfo(row, cfg), message: GENERIC_FORGOT });
}));

router.post("/auth/forgot/verify", limit(15, 20, "Too many attempts. Please wait 15 minutes."), ah(async (req, res) => {
  const token = crypto.randomBytes(32).toString("hex");
  await inTransaction(async (conn) => {
    const otp = await verifyOtp(conn, req.body?.session, req.body?.otp, { purpose: "password_reset" });
    await conn.query("UPDATE otp_verifications SET reset_token_hash = ?, reset_expires_at = NOW() + INTERVAL ? MINUTE WHERE id = ?",
      [sha256(token), RESET_TOKEN_MINUTES, otp.id]);
  });
  res.json({ resetToken: token, expiresIn: RESET_TOKEN_MINUTES * 60 });
}));

router.post("/auth/forgot/reset", limit(15, 10, "Too many attempts. Please wait 15 minutes."), ah(async (req, res) => {
  const pw = password(req.body?.password);
  confirmMatches(pw, req.body?.confirmPassword);
  const token = String(req.body?.resetToken || "");
  const id = await inTransaction(async (conn) => {
    const [[o]] = await conn.query("SELECT * FROM otp_verifications WHERE public_id = ? AND purpose = 'password_reset' FOR UPDATE", [String(req.body?.session || "")]);
    const valid = o && o.status === "verified" && o.customer_id && o.reset_token_hash && /^[a-f0-9]{64}$/.test(token)
      && crypto.timingSafeEqual(Buffer.from(o.reset_token_hash), Buffer.from(sha256(token))) && new Date(o.reset_expires_at) > new Date();
    if (!valid) throw new HttpError(410, "This reset has expired. Please start again.", { code: "reset_expired" });
    const [[c]] = await conn.query("SELECT id, is_active FROM customers WHERE id = ? FOR UPDATE", [o.customer_id]);
    if (!c?.is_active) throw new HttpError(410, "This reset has expired. Please start again.", { code: "reset_expired" });
    await conn.query(
      `UPDATE customers SET password = ?, token_version = token_version + 1, failed_attempts = 0, locked_until = NULL,
         phone_verified_at = COALESCE(phone_verified_at, NOW()) WHERE id = ?`, [await bcrypt.hash(pw, 12), c.id]);
    await conn.query("UPDATE otp_verifications SET status = 'used', reset_token_hash = NULL WHERE id = ?", [o.id]);
    await revokeCustomerSessions(c.id, "password_reset", conn);
    return c.id;
  });
  const c = await loadCustomer(id);
  await queueEmail({ key: "password_changed", to: c.email, vars: customerVars(c), customerId: id, trigger: "customer",
    dedupeKey: `password_changed:${id}:${c.token_version}` });
  await startCustomerSession(req, res, id, { remember: false });
  res.json({ customer: publicCustomer(c) });
}));

/* ---------- profile ----------
   The mobile number is the sign-in and can't be changed here (it would need verifying again); the email can,
   with the current password. */
router.put("/account/profile", requireCustomer, authLimit, ah(async (req, res) => {
  const b = req.body || {};
  const c = await loadCustomer(req.customer.id);
  const name = str(b.name, "name", { min: 2, max: 100 });
  const email = str(b.email, "email", { optional: true, max: 150, pattern: EMAIL, msg: "Check the email address" })?.toLowerCase() || null;
  const emailChanged = email !== (c.email || null);
  if (emailChanged) {
    const current = typeof b.currentPassword === "string" ? b.currentPassword : "";
    if (!current) throw new HttpError(400, "Enter your current password to change your email", { field: "currentPassword" });
    if (!(await bcrypt.compare(current, c.password || DUMMY_HASH))) throw new HttpError(400, "Your current password is wrong", { field: "currentPassword" });
    if (email) {
      const [dupe] = await pool.query("SELECT id FROM customers WHERE id <> ? AND email = ?", [c.id, email]);
      if (dupe.length) throw new HttpError(409, "Another account already uses this email", { field: "email" });
    }
  }
  await pool.query(`UPDATE customers SET name = ?, email = ?${emailChanged ? ", email_verified_at = NULL" : ""} WHERE id = ?`, [name, email, c.id]);
  if (email && emailChanged) {
    const fresh = await loadCustomer(c.id);
    await queueEmail({ key: "welcome", to: email, vars: customerVars(fresh), customerId: c.id,
      trigger: "customer", dedupeKey: `welcome:${c.id}` });   // only if they never had a welcome email before
  }
  res.json({ customer: publicCustomer(await loadCustomer(c.id)) });
}));

router.put("/account/password", requireCustomer, authLimit, ah(async (req, res) => {
  const current = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
  const next = password(req.body?.newPassword, "newPassword");
  if (req.body?.confirmPassword !== undefined) confirmMatches(next, req.body.confirmPassword);
  const c = await loadCustomer(req.customer.id);
  if (!(await bcrypt.compare(current, c.password || DUMMY_HASH))) throw new HttpError(400, "Your current password is wrong", { field: "currentPassword" });
  if (current === next) throw new HttpError(400, "Choose a password different from the current one", { field: "newPassword" });
  await pool.query("UPDATE customers SET password = ?, token_version = token_version + 1 WHERE id = ?", [await bcrypt.hash(next, 12), c.id]);
  // other devices are signed out; this one gets a fresh session
  await revokeCustomerSessions(c.id, "password_change");
  await startCustomerSession(req, res, c.id, { remember: false });
  const fresh = await loadCustomer(c.id);
  await queueEmail({ key: "password_changed", to: fresh.email, vars: customerVars(fresh), customerId: c.id, trigger: "customer",
    dedupeKey: `password_changed:${c.id}:${fresh.token_version}` });
  res.json({ customer: publicCustomer(fresh) });
}));

/* ---------- profile photo ---------- */
const MAX_PHOTO = 600 * 1024;
const MAGIC = { jpeg: [0xff, 0xd8, 0xff], png: [0x89, 0x50, 0x4e, 0x47], webp: [0x52, 0x49, 0x46, 0x46] };

/** Width and height from the image header, or null if the file isn't a real JPEG / PNG / WebP. */
function imageSize(buf, type) {
  if (!MAGIC[type].every((b, i) => buf[i] === b)) return null;
  if (type === "png") return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (type === "webp") {
    if (buf.toString("ascii", 8, 12) !== "WEBP") return null;
    const kind = buf.toString("ascii", 12, 16);
    if (kind === "VP8X") return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
    if (kind === "VP8 ") return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (kind === "VP8L") { const b = buf.readUInt32LE(21); return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff) }; }
    return null;
  }
  // JPEG: walk the segments to the frame header
  for (let i = 2; i < buf.length - 9;) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

router.put("/account/avatar", requireCustomer, limit(15, 20, "Too many photo uploads. Please wait a few minutes."), ah(async (req, res) => {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body?.image || ""));
  if (!m) throw new HttpError(400, "Please choose a JPG, PNG or WebP photo");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > MAX_PHOTO) throw new HttpError(413, "That photo is too large. Please choose one under 5 MB.");
  const size = imageSize(buf, m[1]);
  if (!size) throw new HttpError(400, "That file doesn't look like a photo. Please choose a JPG, PNG or WebP image.");
  if (size.w < 64 || size.h < 64 || size.w > 1024 || size.h > 1024) throw new HttpError(400, "The photo should be between 64 and 1024 pixels on each side");
  await pool.query("INSERT INTO customer_avatars (customer_id, mime, data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE mime = VALUES(mime), data = VALUES(data), updated_at = NOW()",
    [req.customer.id, `image/${m[1]}`, buf]);
  res.json({ customer: publicCustomer(await loadCustomer(req.customer.id)) });
}));

router.delete("/account/avatar", requireCustomer, ah(async (req, res) => {
  await pool.query("DELETE FROM customer_avatars WHERE customer_id = ?", [req.customer.id]);
  res.json({ customer: publicCustomer(await loadCustomer(req.customer.id)) });
}));

router.get("/avatars/:file", ah(async (req, res) => {
  const m = /^(\d+)-([a-f0-9]{20})\.jpg$/.exec(req.params.file);
  if (!m || !crypto.timingSafeEqual(Buffer.from(m[2]), Buffer.from(avatarSig(m[1])))) throw new HttpError(404, "Not found");
  const [[a]] = await pool.query("SELECT mime, data FROM customer_avatars WHERE customer_id = ?", [m[1]]);
  if (!a) throw new HttpError(404, "Not found");
  res.set({ "Content-Type": a.mime, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'",
    "Cross-Origin-Resource-Policy": "same-site" });   // our own site only (same-site also covers local development ports)
  res.send(a.data);
}));

/* ---------- orders ---------- */
const FILTERS = {
  active: "o.status NOT IN ('delivered','cancelled','returned')",
  delivered: "o.status IN ('delivered','return_requested')",
  closed: "o.status IN ('cancelled','returned')",
};
const firstImage = (v) => jsonList(v)[0] || null;
/** The photo of the colour ordered, or the product's main photo. */
const itemImage = (i) => jsonList(i.colors).find((c) => c.name === i.color)?.image || firstImage(i.images);

async function itemsFor(orderIds) {
  if (!orderIds.length) return [];
  const [items] = await pool.query(
    `SELECT oi.order_id, oi.product_name, oi.product_slug, oi.size, oi.color, oi.unit_price, oi.qty, oi.line_total, p.images, p.colors, p.status AS product_status
     FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id IN (?) ORDER BY oi.id`, [orderIds]);
  return items.map((i) => ({
    order_id: i.order_id, name: i.product_name, slug: i.product_status === "active" ? i.product_slug : null, size: i.size, color: i.color,
    qty: i.qty, unit_price: Number(i.unit_price), line_total: Number(i.line_total), image: itemImage(i),
  }));
}

/** What a customer sees of one order: everything except the team's private notes and who on the team did what. */
async function orderForCustomer(o, { guest = false } = {}) {
  const [history] = await pool.query("SELECT status, note, created_at FROM order_status_history WHERE order_id = ? ORDER BY created_at, id", [o.id]);
  const items = (await itemsFor([o.id])).map(({ order_id, ...i }) => i);
  const exception = !PROGRESS.includes(o.status) ? o.status : null;
  // furthest step reached on the normal journey (exceptions keep the step they were at)
  const reached = Math.max(0, ...history.map((h) => PROGRESS.indexOf(h.status)), PROGRESS.indexOf(o.status));
  return {
    order_number: o.order_number, created_at: o.created_at, status: o.status, status_label: STATUS[o.status] || o.status,
    payment_method: o.payment_method, payment_method_label: PAY_METHOD[o.payment_method], payment_status: o.payment_status,
    payment_status_label: PAYMENT_STATUS[o.payment_status], subtotal: Number(o.subtotal), delivery_fee: Number(o.delivery_fee), total: Number(o.total),
    courier: o.courier, tracking_number: o.tracking_number, tracking_url: o.tracking_url, expected_delivery: o.expected_delivery,
    address: guest
      ? { name: o.ship_name, city: o.ship_city, state: o.ship_state, pin: o.ship_pin }
      : { name: o.ship_name, phone: o.ship_phone, line1: o.ship_line1, line2: o.ship_line2, city: o.ship_city, state: o.ship_state, pin: o.ship_pin },
    items,
    progress: { steps: PROGRESS.map((k) => ({ key: k, label: STATUS[k] })), reached, exception, exception_label: exception ? STATUS[exception] : null },
    timeline: history.map((h) => ({ status: h.status, label: STATUS[h.status] || h.status, message: h.note || DEFAULT_MESSAGE[h.status] || "", at: h.created_at })).reverse(),
  };
}

router.get("/orders/mine", requireCustomer, ah(async (req, res) => {
  const where = ["o.customer_id = ?"], args = [req.customer.id];
  if (FILTERS[req.query.status]) where.push(FILTERS[req.query.status]);
  const q = String(req.query.q || "").replace(/^#/, "").trim();
  if (q) { where.push("(o.order_number LIKE ? OR EXISTS (SELECT 1 FROM order_items s WHERE s.order_id = o.id AND s.product_name LIKE ?))"); args.push(`%${q}%`, `%${q}%`); }
  const page = Math.max(1, parseInt(req.query.page, 10) || 1), size = 10;
  const w = where.join(" AND ");
  const [orders] = await pool.query(
    `SELECT o.id, o.order_number, o.status, o.payment_method, o.payment_status, o.total, o.courier, o.tracking_number, o.expected_delivery, o.created_at
     FROM orders o WHERE ${w} ORDER BY o.created_at DESC, o.id DESC LIMIT ? OFFSET ?`, [...args, size, (page - 1) * size]);
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM orders o WHERE ${w}`, args);
  const [counts] = await pool.query(
    `SELECT COUNT(*) AS all_, SUM(${FILTERS.active}) AS active, SUM(${FILTERS.delivered}) AS delivered, SUM(${FILTERS.closed}) AS closed
     FROM orders o WHERE o.customer_id = ?`, [req.customer.id]);
  const items = await itemsFor(orders.map((o) => o.id));
  res.set("Cache-Control", "no-store");
  res.json({
    orders: orders.map(({ id, ...o }) => ({ ...o, total: Number(o.total), status_label: STATUS[o.status], payment_method_label: PAY_METHOD[o.payment_method],
      payment_status_label: PAYMENT_STATUS[o.payment_status], items: items.filter((i) => i.order_id === id).map(({ order_id, ...i }) => i) })),
    total, page, pages: Math.max(1, Math.ceil(total / size)),
    counts: { all: Number(counts[0].all_ || 0), active: Number(counts[0].active || 0), delivered: Number(counts[0].delivered || 0), closed: Number(counts[0].closed || 0) },
  });
}));

router.get("/orders/mine/:number", requireCustomer, ah(async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM orders WHERE order_number = ? AND customer_id = ?", [String(req.params.number).replace(/^#/, ""), req.customer.id]);
  if (!rows[0]) throw new HttpError(404, "We couldn't find that order in your account");
  res.set("Cache-Control", "no-store");
  res.json({ order: await orderForCustomer(rows[0]) });
}));

// Guests (and anyone signed out) can follow an order with its number and the mobile number used at checkout.
router.post("/orders/track", limit(15, 15, "Too many tries. Please wait 15 minutes and try again."), ah(async (req, res) => {
  const number = str(req.body?.order, "order", { max: 30, pattern: /^#?[A-Za-z0-9-]+$/, msg: "Enter your order number" }).replace(/^#/, "").toUpperCase();
  const phone = mobile10(req.body?.phone);
  if (!phone) throw new HttpError(400, "Enter the 10-digit mobile number used for the order", { field: "phone" });
  const [rows] = await pool.query("SELECT * FROM orders WHERE order_number = ?", [number]);
  const o = rows[0];
  if (!o || mobile10(o.ship_phone) !== phone) throw new HttpError(404, "We couldn't find an order with that number and mobile number. Please check both.");
  res.set("Cache-Control", "no-store");
  res.json({ order: await orderForCustomer(o, { guest: true }), signInToSeeMore: !!o.customer_id });
}));

export default router;
