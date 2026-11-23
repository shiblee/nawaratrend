/* Public storefront API: catalogue, contact form and placing orders. Customer accounts are in account.js. */
import express from "express";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { pool } from "../config/db.js";
import { ah, HttpError, str, num, oneOf, EMAIL, mobile10, clientIp, jsonList } from "../lib/http.js";
import { getSettings, audit } from "../lib/store.js";
import { queueOrderEmail } from "../lib/email/index.js";
import { optionalCustomer } from "../middleware/auth.js";

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
    colors: jsonList(r.colors).length ? jsonList(r.colors) : undefined,
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
      whatsapp: s.whatsapp, whatsappEnabled: s.whatsapp_enabled, whatsappMessage: s.whatsapp_message || "", ga4: s["seo.ga4_id"] || "",
      banner: s.home_banner_image ? { image: s.home_banner_image, mobile: s.home_banner_mobile || "", link: s.home_banner_link || "", alt: s.home_banner_alt || "" } : null },
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

/* ---------- Place an order (guest or signed in) ---------- */
const newOrderNumber = () => "NT" + new Date().toISOString().slice(2, 10).replace(/-/g, "").slice(0, 4) + crypto.randomInt(10000, 99999);

router.post("/orders", limit(60, 20, "Too many orders from this connection. Please try again later."), optionalCustomer, ah(async (req, res) => {
  const b = req.body || {};
  if (!Array.isArray(b.items) || !b.items.length || b.items.length > 30) throw new HttpError(400, "Your cart is empty");
  const items = b.items.map((it, i) => ({
    slug: str(it?.productId, `items[${i + 1}].productId`, { max: 80 }),
    qty: num(it?.qty, `items[${i + 1}].qty`, { int: true, min: 1, max: 10 }),
    size: str(it?.size, `items[${i + 1}].size`, { optional: true, max: 20 }),
    color: str(it?.color, `items[${i + 1}].color`, { optional: true, max: 40 }),
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
      const colors = jsonList(p.colors).map((c) => c.name);
      if (colors.length && !colors.includes(it.color)) {
        throw new HttpError(400, it.color ? `${p.name} isn't available in ${it.color} any more. Please choose another colour.` : `Please choose a colour for ${p.name}`);
      }
      need[p.id] = (need[p.id] || 0) + it.qty;
      const unit = Number(p.price);
      return { p, qty: it.qty, size: sizes.length ? it.size : null, color: colors.length ? it.color : null, unit, total: unit * it.qty };
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
        "INSERT INTO order_items (order_id, product_id, product_name, product_slug, size, color, unit_price, qty, line_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [orderId, l.p.id, l.p.name, l.p.slug, l.size, l.color, l.unit, l.qty, l.total]);
    }
    for (const [pid, qty] of Object.entries(need)) await conn.query("UPDATE products SET stock = stock - ? WHERE id = ?", [qty, pid]);
    await conn.query("INSERT INTO order_status_history (order_id, status, note, actor) VALUES (?, 'pending', NULL, ?)",
      [orderId, req.customer ? "customer" : "guest"]);
    await conn.commit();
    res.status(201).json({ orderId: orderNumber, subtotal, deliveryFee: fee, total, payment });
    // after the order is safely saved: the record of who placed it, and the confirmation email (neither can affect the order)
    await audit(req, "order.create", "order", orderNumber, { by: req.customer ? `customer #${req.customer.id}` : "guest checkout", total, payment });
    await queueOrderEmail(orderId, "order_placed", { trigger: "order", dedupeKey: `order_placed:${orderId}` });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}));

export default router;
