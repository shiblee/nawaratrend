/* Public storefront API: catalogue, contact form, customer accounts and orders. */
import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { pool } from "../config/db.js";
import { ah, HttpError, str, num, oneOf, EMAIL, mobile10, password, clientIp, jsonList } from "../lib/http.js";
import { getSettings } from "../lib/store.js";
import { optionalCustomer, requireCustomer, signCustomerToken } from "../middleware/auth.js";

const router = express.Router();
const limit = (windowMin, max, message) =>
  rateLimit({ windowMs: windowMin * 60 * 1000, max, standardHeaders: true, legacyHeaders: false, message: { message } });

/* ---------- Catalogue ---------- */
const publicProduct = (r) => {
  const images = jsonList(r.images);
  return {
    id: r.slug, cat: r.category_slug, name: r.name, desc: r.description || "",
    price: Number(r.price), mrp: Number(r.mrp), rate: Number(r.rating), reviews: r.review_count,
    stock: r.stock, left: r.stock > 0 && r.stock <= r.low_stock_threshold ? r.stock : undefined,
    points: jsonList(r.highlights), sizes: jsonList(r.sizes).length ? jsonList(r.sizes) : undefined,
    img: images[0], images: images.length > 1 ? images : undefined, featured: !!r.is_featured,
  };
};

router.get("/catalog", ah(async (req, res) => {
  const [cats] = await pool.query("SELECT slug, name FROM categories WHERE is_active = 1 ORDER BY sort_order, name");
  const [rows] = await pool.query(
    `SELECT p.*, c.slug AS category_slug FROM products p
     JOIN categories c ON c.id = p.category_id AND c.is_active = 1
     WHERE p.status = 'active' ORDER BY p.sort_order, p.id`
  );
  const s = await getSettings();
  res.set("Cache-Control", "no-store");
  res.json({
    settings: { freeShipping: s.free_shipping_threshold, deliveryFee: s.delivery_fee, codEnabled: s.cod_enabled, phone: s.phone,
      whatsapp: s.whatsapp, whatsappEnabled: s.whatsapp_enabled, whatsappMessage: s.whatsapp_message || "", ga4: s["seo.ga4_id"] || "" },
    categories: cats.map((c) => ({ k: c.slug, n: c.name })),
    products: rows.map(publicProduct),
  });
}));

/* ---------- Contact form ---------- */
router.post("/contact", limit(10, 5, "Too many messages. Please try again in a few minutes."), ah(async (req, res) => {
  const b = req.body || {};
  const topic = oneOf(b.topic, "topic", ["order", "return", "product", "other"]);
  const name = str(b.name, "name", { min: 2, max: 100 });
  const contact = str(b.contact, "contact", { max: 150 });
  if (!EMAIL.test(contact) && !mobile10(contact)) throw new HttpError(400, "Enter a valid mobile number or email", { field: "contact" });
  const orderRef = str(b.order, "order", { optional: true, max: 30, pattern: /^#?[A-Za-z0-9-]+$/ });
  const message = str(b.message, "message", { min: 10, max: 2000 });
  await pool.query("INSERT INTO contact_messages (topic, name, contact, order_ref, message, ip) VALUES (?, ?, ?, ?, ?, ?)",
    [topic, name, contact, orderRef, message, clientIp(req)]);
  res.status(201).json({ ok: true });
}));

/* ---------- Customer accounts ---------- */
const parseContact = (v) => {
  const s = str(v, "contact", { max: 150, msg: "Enter your mobile number or email" });
  if (EMAIL.test(s)) return { email: s.toLowerCase(), phone: null, display: s.toLowerCase() };
  const m = mobile10(s);
  if (m) return { email: null, phone: m, display: m };
  throw new HttpError(400, "Enter a valid mobile number or email", { field: "contact" });
};
const publicCustomer = (c) => ({ id: c.id, name: c.name, contact: c.email || c.phone, email: c.email, phone: c.phone });
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, skipSuccessfulRequests: true, standardHeaders: true, legacyHeaders: false,
  message: { message: "Too many attempts. Please wait a few minutes and try again." } });
// compared against when no account matches, so "no such account" and "wrong password" take the same time
const DUMMY_HASH = bcrypt.hashSync("no-account-placeholder", 12);

router.post("/auth/register", authLimit, ah(async (req, res) => {
  const name = str(req.body?.name, "name", { min: 2, max: 100 });
  const { email, phone } = parseContact(req.body?.contact);
  const pw = password(req.body?.password);
  const [dupe] = await pool.query("SELECT id FROM customers WHERE email = ? OR phone = ?", [email, phone]);
  if (dupe.length) throw new HttpError(409, "An account with this mobile number or email already exists. Please sign in.");
  const [r] = await pool.query("INSERT INTO customers (name, email, phone, password, last_login_at) VALUES (?, ?, ?, ?, NOW())",
    [name, email, phone, await bcrypt.hash(pw, 12)]);
  const customer = { id: r.insertId, name, email, phone };
  res.status(201).json({ token: signCustomerToken(customer), customer: publicCustomer(customer) });
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
  res.json({ token: signCustomerToken(c), customer: publicCustomer(c) });
}));

router.get("/auth/me", requireCustomer, ah(async (req, res) => res.json({ customer: publicCustomer(req.customer) })));

router.get("/orders/mine", requireCustomer, ah(async (req, res) => {
  const [orders] = await pool.query(
    `SELECT id, order_number, status, payment_method, payment_status, total, courier, tracking_number, created_at
     FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50`, [req.customer.id]);
  const ids = orders.map((o) => o.id);
  const [items] = ids.length
    ? await pool.query("SELECT order_id, product_name, product_slug, size, qty, line_total FROM order_items WHERE order_id IN (?)", [ids])
    : [[]];
  res.json({ orders: orders.map(({ id, ...o }) => ({ ...o, total: Number(o.total), items: items.filter((i) => i.order_id === id).map(({ order_id, ...i }) => ({ ...i, line_total: Number(i.line_total) })) })) });
}));

/* ---------- Place an order (guest or signed in) ---------- */
const newOrderNumber = () => "NT" + new Date().toISOString().slice(2, 10).replace(/-/g, "").slice(0, 4) + crypto.randomInt(10000, 99999);

router.post("/orders", limit(60, 20, "Too many orders from this connection. Please try again later."), optionalCustomer, ah(async (req, res) => {
  const b = req.body || {};
  if (!Array.isArray(b.items) || !b.items.length || b.items.length > 30) throw new HttpError(400, "Your cart is empty");
  const items = b.items.map((it, i) => ({
    slug: str(it?.productId, `items[${i + 1}].productId`, { max: 80 }),
    qty: num(it?.qty, `items[${i + 1}].qty`, { int: true, min: 1, max: 10 }),
    size: str(it?.size, `items[${i + 1}].size`, { optional: true, max: 20 }),
  }));
  const a = b.address || {};
  const phone = mobile10(a.phone);
  if (!phone) throw new HttpError(400, "Enter a valid 10-digit mobile number", { field: "phone" });
  const ship = {
    name: str(a.name, "name", { min: 2, max: 100 }), phone,
    email: str(a.email, "email", { optional: true, max: 150, pattern: EMAIL, msg: "Check the email address" }),
    line1: str(a.line1, "line1", { min: 3, max: 150 }), line2: str(a.line2, "line2", { optional: true, max: 150 }),
    city: str(a.city, "city", { min: 2, max: 60 }), state: str(a.state, "state", { min: 2, max: 60 }),
    pin: str(a.pin, "pin", { pattern: /^[1-9]\d{5}$/, msg: "PIN code should be 6 digits" }),
  };
  const payment = oneOf(b.payment, "payment", ["upi", "card", "cod"]);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const settings = await getSettings(conn);
    if (payment === "cod" && !settings.cod_enabled) throw new HttpError(400, "Cash on Delivery isn't available right now");

    // lock the products so two shoppers can't buy the last item at the same time
    const [rows] = await conn.query("SELECT * FROM products WHERE slug IN (?) AND status = 'active' FOR UPDATE", [[...new Set(items.map((i) => i.slug))]]);
    const bySlug = Object.fromEntries(rows.map((r) => [r.slug, r]));
    const need = {};
    const lines = items.map((it) => {
      const p = bySlug[it.slug];
      if (!p) throw new HttpError(409, "One of the products in your cart is no longer available. Please review your cart.");
      const sizes = jsonList(p.sizes);
      if (sizes.length && !sizes.includes(it.size)) throw new HttpError(400, `Please choose a size for ${p.name}`);
      need[p.id] = (need[p.id] || 0) + it.qty;
      const unit = Number(p.price);
      return { p, qty: it.qty, size: sizes.length ? it.size : null, unit, total: unit * it.qty };
    });
    for (const p of rows) {
      if (need[p.id] > p.stock) {
        throw new HttpError(409, p.stock > 0 ? `Only ${p.stock} of ${p.name} left in stock` : `${p.name} is out of stock`);
      }
    }
    // prices always come from the database, never from the browser
    const subtotal = lines.reduce((s, l) => s + l.total, 0);
    const fee = subtotal >= settings.free_shipping_threshold ? 0 : settings.delivery_fee;
    const total = subtotal + fee;

    let orderNumber, orderId;
    for (let attempt = 0; !orderId; attempt++) {
      orderNumber = newOrderNumber();
      try {
        const [r] = await conn.query(
          `INSERT INTO orders (order_number, customer_id, payment_method, subtotal, delivery_fee, total,
             ship_name, ship_phone, ship_email, ship_line1, ship_line2, ship_city, ship_state, ship_pin, ip)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [orderNumber, req.customer?.id ?? null, payment, subtotal, fee, total,
           ship.name, "+91" + ship.phone, ship.email, ship.line1, ship.line2, ship.city, ship.state, ship.pin, clientIp(req)]);
        orderId = r.insertId;
      } catch (err) {
        if (err.code !== "ER_DUP_ENTRY" || attempt > 4) throw err;
      }
    }
    for (const l of lines) {
      await conn.query(
        "INSERT INTO order_items (order_id, product_id, product_name, product_slug, size, unit_price, qty, line_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [orderId, l.p.id, l.p.name, l.p.slug, l.size, l.unit, l.qty, l.total]);
    }
    for (const [pid, qty] of Object.entries(need)) await conn.query("UPDATE products SET stock = stock - ? WHERE id = ?", [qty, pid]);
    await conn.query("INSERT INTO order_status_history (order_id, status, note) VALUES (?, 'pending', 'Order placed')", [orderId]);
    await conn.commit();
    res.status(201).json({ orderId: orderNumber, subtotal, deliveryFee: fee, total, payment });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}));

export default router;
