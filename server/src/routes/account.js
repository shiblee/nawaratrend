/* Customer accounts: sign-up / sign-in, profile and photo, password (change and reset by email),
   sign out everywhere, the customer's own orders with tracking, and public order tracking for guests.
   Every order query is limited to the signed-in customer's own orders. */
import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { pool } from "../config/db.js";
import { ah, HttpError, str, EMAIL, mobile10, password, clientIp, jsonList } from "../lib/http.js";
import { getSettings } from "../lib/store.js";
import { STATUS, PROGRESS, DEFAULT_MESSAGE, PAYMENT_STATUS, PAY_METHOD } from "../lib/orders.js";
import { queueEmail, siteUrl } from "../lib/email/index.js";
import { requireCustomer, signCustomerToken } from "../middleware/auth.js";

const router = express.Router();
const limit = (windowMin, max, message, extra = {}) =>
  rateLimit({ windowMs: windowMin * 60 * 1000, max, standardHeaders: true, legacyHeaders: false, message: { message }, ...extra });
const authLimit = limit(15, 20, "Too many attempts. Please wait a few minutes and try again.", { skipSuccessfulRequests: true });
// compared against when no account matches, so "no such account" and "wrong password" take the same time
const DUMMY_HASH = bcrypt.hashSync("no-account-placeholder", 12);
const RESET_MINUTES = 30;
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

/* ---------- profile photos ----------
   Served from an address that can't be guessed (signed with the server secret), so <img> tags work without sign-in
   but nobody can list other customers' photos. */
const avatarSig = (id) => crypto.createHmac("sha256", process.env.JWT_SECRET).update(`avatar:${id}`).digest("hex").slice(0, 20);
const avatarUrl = (c) => (c.avatar_at ? `/api/store/avatars/${c.id}-${avatarSig(c.id)}.jpg?v=${new Date(c.avatar_at).getTime()}` : null);
export { avatarUrl };

export const publicCustomer = (c) => ({
  id: c.id, name: c.name, contact: c.email || c.phone, email: c.email || null, phone: c.phone || null,
  avatar: avatarUrl(c), since: c.created_at || null,
});

const loadCustomer = async (id) => {
  const [rows] = await pool.query(
    "SELECT c.*, a.updated_at AS avatar_at FROM customers c LEFT JOIN customer_avatars a ON a.customer_id = c.id WHERE c.id = ?", [id]);
  return rows[0];
};

const parseContact = (v) => {
  const s = str(v, "contact", { max: 150, msg: "Enter your mobile number or email" });
  if (EMAIL.test(s)) return { email: s.toLowerCase(), phone: null };
  const m = mobile10(s);
  if (m) return { email: null, phone: m };
  throw new HttpError(400, "Enter a valid mobile number or email", { field: "contact" });
};

const customerName = (c) => (c.name || "").split(" ")[0] || "there";

/* ---------- sign up / sign in ---------- */
router.post("/auth/register", authLimit, ah(async (req, res) => {
  const name = str(req.body?.name, "name", { min: 2, max: 100 });
  const { email, phone } = parseContact(req.body?.contact);
  const pw = password(req.body?.password);
  const [dupe] = await pool.query("SELECT id FROM customers WHERE email = ? OR phone = ?", [email, phone]);
  if (dupe.length) throw new HttpError(409, "An account with this mobile number or email already exists. Please sign in.");
  const [r] = await pool.query("INSERT INTO customers (name, email, phone, password, last_login_at) VALUES (?, ?, ?, ?, NOW())",
    [name, email, phone, await bcrypt.hash(pw, 12)]);
  const c = await loadCustomer(r.insertId);
  // the dedupe key means a customer can only ever get one welcome email
  if (email) await queueEmail({ key: "welcome", to: email, vars: { customer_name: customerName(c), customer_email: email },
    customerId: c.id, trigger: "registration", dedupeKey: `welcome:${c.id}` });
  res.status(201).json({ token: signCustomerToken(c), customer: publicCustomer(c) });
}));

router.post("/auth/login", authLimit, ah(async (req, res) => {
  const { email, phone } = parseContact(req.body?.contact);
  const pw = typeof req.body?.password === "string" ? req.body.password : "";
  const [rows] = await pool.query("SELECT * FROM customers WHERE " + (email ? "email = ?" : "phone = ?"), [email || phone]);
  const c = rows[0];
  const fail = new HttpError(401, "Wrong mobile number/email or password");
  if (!c || !c.password) { await bcrypt.compare(pw, DUMMY_HASH); throw fail; }
  if (!c.is_active) throw new HttpError(403, "This account has been disabled. Please contact us.");
  if (c.locked_until && new Date(c.locked_until) > new Date()) throw new HttpError(429, "Too many wrong passwords. Please try again in 15 minutes.");
  if (!(await bcrypt.compare(pw, c.password))) {
    await pool.query(
      "UPDATE customers SET failed_attempts = failed_attempts + 1, locked_until = IF(failed_attempts >= 5, NOW() + INTERVAL 15 MINUTE, NULL) WHERE id = ?", [c.id]);
    throw fail;
  }
  await pool.query("UPDATE customers SET failed_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE id = ?", [c.id]);
  const fresh = await loadCustomer(c.id);
  res.json({ token: signCustomerToken(fresh), customer: publicCustomer(fresh) });
}));

router.get("/auth/me", requireCustomer, ah(async (req, res) => res.json({ customer: publicCustomer(req.customer) })));

// ends every session, on every device (this one included)
router.post("/auth/logout-everywhere", requireCustomer, ah(async (req, res) => {
  await pool.query("UPDATE customers SET token_version = token_version + 1 WHERE id = ?", [req.customer.id]);
  res.json({ ok: true });
}));

/* ---------- forgotten password ---------- */
const GENERIC_RESET = "If an account matches, we've emailed a link to reset the password. It may take a minute to arrive (check spam too).";

router.post("/auth/forgot", limit(15, 5, "Too many reset requests. Please wait 15 minutes."), ah(async (req, res) => {
  const { email, phone } = parseContact(req.body?.contact);
  const [rows] = await pool.query("SELECT * FROM customers WHERE " + (email ? "email = ?" : "phone = ?"), [email || phone]);
  const c = rows[0];
  // the reply is the same whether or not the account exists, so this can't be used to find out who has an account
  if (!c || !c.is_active || !c.email) {
    return res.json({ ok: true, message: phone && c && !c.email
      ? "This account has no email address, so we can't send a reset link. Please message us on WhatsApp and we'll help."
      : GENERIC_RESET });
  }
  const [[{ recent }]] = await pool.query(
    "SELECT COUNT(*) AS recent FROM password_resets WHERE customer_id = ? AND created_at > NOW() - INTERVAL 1 HOUR", [c.id]);
  if (recent < 3) {
    const token = crypto.randomBytes(32).toString("hex");
    const [r] = await pool.query("INSERT INTO password_resets (customer_id, token_hash, expires_at, ip) VALUES (?, ?, NOW() + INTERVAL ? MINUTE, ?)",
      [c.id, sha256(token), RESET_MINUTES, clientIp(req)]);
    const site = siteUrl(await getSettings());
    await queueEmail({ key: "password_reset", to: c.email, customerId: c.id, trigger: "customer", dedupeKey: `password_reset:${r.insertId}`,
      vars: { customer_name: customerName(c), reset_url: `${site}/reset-password?token=${token}`, reset_expires_minutes: String(RESET_MINUTES) } });
  }
  res.json({ ok: true, message: GENERIC_RESET });
}));

router.post("/auth/reset", limit(15, 10, "Too many attempts. Please wait 15 minutes."), ah(async (req, res) => {
  const token = str(req.body?.token, "token", { max: 100, pattern: /^[a-f0-9]{64}$/, msg: "This reset link isn't valid. Please ask for a new one." });
  const pw = password(req.body?.password);
  const [rows] = await pool.query(
    `SELECT r.id, r.customer_id FROM password_resets r JOIN customers c ON c.id = r.customer_id
     WHERE r.token_hash = ? AND r.used_at IS NULL AND r.expires_at > NOW() AND c.is_active = 1`, [sha256(token)]);
  if (!rows[0]) throw new HttpError(400, "This reset link has expired or was already used. Please ask for a new one.");
  const id = rows[0].customer_id;
  await pool.query("UPDATE customers SET password = ?, token_version = token_version + 1, failed_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE id = ?",
    [await bcrypt.hash(pw, 12), id]);
  // this link and any other open links for the account stop working
  await pool.query("UPDATE password_resets SET used_at = NOW() WHERE customer_id = ? AND used_at IS NULL", [id]);
  const c = await loadCustomer(id);
  await queueEmail({ key: "password_changed", to: c.email, vars: { customer_name: customerName(c) }, customerId: id, trigger: "customer",
    dedupeKey: `password_changed:${id}:${c.token_version}` });
  res.json({ token: signCustomerToken(c), customer: publicCustomer(c) });
}));

/* ---------- profile ---------- */
router.put("/account/profile", requireCustomer, authLimit, ah(async (req, res) => {
  const b = req.body || {};
  const c = await loadCustomer(req.customer.id);
  const name = str(b.name, "name", { min: 2, max: 100 });
  const email = str(b.email, "email", { optional: true, max: 150, pattern: EMAIL, msg: "Check the email address" })?.toLowerCase() || null;
  let phone = null;
  if (b.phone) { phone = mobile10(b.phone); if (!phone) throw new HttpError(400, "Enter a valid 10-digit mobile number", { field: "phone" }); }
  if (!email && !phone) throw new HttpError(400, "Keep at least a mobile number or an email, so you can sign in", { field: "email" });

  // changing how you sign in needs the current password, so someone at an unlocked device can't take the account over
  const contactChanged = email !== (c.email || null) || phone !== (c.phone || null);
  if (contactChanged) {
    const current = typeof b.currentPassword === "string" ? b.currentPassword : "";
    if (!current) throw new HttpError(400, "Enter your current password to change your email or mobile number", { field: "currentPassword" });
    if (!(await bcrypt.compare(current, c.password || DUMMY_HASH))) throw new HttpError(400, "Your current password is wrong", { field: "currentPassword" });
    const [dupe] = await pool.query("SELECT id FROM customers WHERE id <> ? AND ((? IS NOT NULL AND email = ?) OR (? IS NOT NULL AND phone = ?))",
      [c.id, email, email, phone, phone]);
    if (dupe.length) throw new HttpError(409, "Another account already uses this email or mobile number");
  }
  await pool.query("UPDATE customers SET name = ?, email = ?, phone = ? WHERE id = ?", [name, email, phone, c.id]);
  if (email && email !== c.email) {
    await queueEmail({ key: "welcome", to: email, vars: { customer_name: customerName({ name }), customer_email: email }, customerId: c.id,
      trigger: "customer", dedupeKey: `welcome:${c.id}` });   // only if they never had a welcome email before
  }
  res.json({ customer: publicCustomer(await loadCustomer(c.id)) });
}));

router.put("/account/password", requireCustomer, authLimit, ah(async (req, res) => {
  const current = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
  const next = password(req.body?.newPassword, "newPassword");
  const c = await loadCustomer(req.customer.id);
  if (!(await bcrypt.compare(current, c.password || DUMMY_HASH))) throw new HttpError(400, "Your current password is wrong", { field: "currentPassword" });
  if (current === next) throw new HttpError(400, "Choose a password different from the current one", { field: "newPassword" });
  await pool.query("UPDATE customers SET password = ?, token_version = token_version + 1 WHERE id = ?", [await bcrypt.hash(next, 12), c.id]);
  const fresh = await loadCustomer(c.id);
  await queueEmail({ key: "password_changed", to: fresh.email, vars: { customer_name: customerName(fresh) }, customerId: c.id, trigger: "customer",
    dedupeKey: `password_changed:${c.id}:${fresh.token_version}` });
  // other devices are signed out; this one gets a fresh session
  res.json({ token: signCustomerToken(fresh), customer: publicCustomer(fresh) });
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

async function itemsFor(orderIds) {
  if (!orderIds.length) return [];
  const [items] = await pool.query(
    `SELECT oi.order_id, oi.product_name, oi.product_slug, oi.size, oi.unit_price, oi.qty, oi.line_total, p.images, p.status AS product_status
     FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id IN (?) ORDER BY oi.id`, [orderIds]);
  return items.map((i) => ({
    order_id: i.order_id, name: i.product_name, slug: i.product_status === "active" ? i.product_slug : null, size: i.size,
    qty: i.qty, unit_price: Number(i.unit_price), line_total: Number(i.line_total), image: firstImage(i.images),
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
