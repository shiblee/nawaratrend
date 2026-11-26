/* Public storefront API: catalogue, contact form and placing orders. Customer accounts are in account.js. */
import express from "express";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { pool } from "../config/db.js";
import { ah, HttpError, str, num, oneOf, EMAIL, mobile10, clientIp, jsonList } from "../lib/http.js";
import { getSettings, audit } from "../lib/store.js";
import { assignProductCodes, productCode } from "../lib/codes.js";
import { queueOrderEmail } from "../lib/email/index.js";
import { optionalCustomer } from "../middleware/auth.js";

const router = express.Router();
const limit = (windowMin, max, message) =>
  rateLimit({ windowMs: windowMin * 60 * 1000, max, standardHeaders: true, legacyHeaders: false, message: { message } });

/* ---------- Catalogue ---------- */
/** Sizes with their own price, as { "6 ml": { price, mrp, image } }; undefined when every size costs the same. */
const sizePrices = (r) => {
  const sizes = jsonList(r.sizes), list = jsonList(r.size_prices).filter((x) => sizes.includes(x?.size) && Number(x.price) > 0);
  if (!list.length) return undefined;
  return Object.fromEntries(list.map((x) => [x.size, { price: Number(x.price), mrp: Math.max(Number(x.mrp) || 0, Number(x.price)), ...(x.image ? { image: x.image } : {}) }]));
};
const publicProduct = (r) => {
  const images = jsonList(r.images);
  return {
    id: r.slug, code: productCode(r.code_no), cat: r.category_slug, name: r.name, desc: r.description || "",
    price: Number(r.price), mrp: Number(r.mrp), rate: Number(r.rating), reviews: r.review_count,
    stock: r.stock, left: r.stock > 0 && r.stock <= r.low_stock_threshold ? r.stock : undefined,
    points: jsonList(r.highlights), sizes: jsonList(r.sizes).length ? jsonList(r.sizes) : undefined,
    colors: jsonList(r.colors).length ? jsonList(r.colors) : undefined,
    sizePrices: sizePrices(r),
    img: images[0], images: images.length > 1 ? images : undefined, featured: !!r.is_featured,
    // for the home page's mixed order: how well it sells (0 to 1, rounded so no sales figures leak) and whether it's new
    pop: r.pop || undefined, isNew: r.is_new ? true : undefined,
  };
};

/** Units sold per product over the last 60 days (cancelled and returned orders don't count), scaled 0 to 1 and rounded. */
async function popularity() {
  const [rows] = await pool.query(
    `SELECT oi.product_id AS id, SUM(oi.qty) AS units FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.created_at >= NOW() - INTERVAL 60 DAY AND o.status NOT IN ('cancelled','returned') AND oi.product_id IS NOT NULL
     GROUP BY oi.product_id`);
  const top = Math.max(0, ...rows.map((r) => Number(r.units)));
  return new Map(rows.map((r) => [r.id, top ? Math.round((Number(r.units) / top) * 10) / 10 : 0]));
}

router.get("/catalog", ah(async (req, res) => {
  const [cats] = await pool.query("SELECT slug, name FROM categories WHERE is_active = 1 ORDER BY sort_order, name");
  const load = async () => (await pool.query(
    `SELECT p.*, c.slug AS category_slug, p.created_at >= NOW() - INTERVAL 21 DAY AS is_new FROM products p
     JOIN categories c ON c.id = p.category_id AND c.is_active = 1
     WHERE p.status = 'active' ORDER BY p.sort_order, p.id`
  ))[0];
  let rows = await load();
  if (rows.some((r) => !r.code_no) && await assignProductCodes()) rows = await load();   // added straight into the database
  const pop = await popularity();
  rows.forEach((r) => { r.pop = pop.get(r.id) || 0; });
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

/* ---------- Product views (signed-in customers only) ----------
   The product page reports each visit, so the team can see which products a customer keeps coming back to.
   Guests aren't tracked, and the browser skips this when the customer has turned analytics cookies off. */
router.post("/products/:slug/view", limit(10, 120, "Too many requests."), optionalCustomer, ah(async (req, res) => {
  if (!req.customer) return res.status(204).end();
  const [[p]] = await pool.query("SELECT id FROM products WHERE slug = ? AND status = 'active'", [String(req.params.slug).slice(0, 80)]);
  if (!p) return res.status(204).end();
  // a reload or quick back-and-forth within 10 minutes is the same visit
  await pool.query(
    `INSERT INTO customer_product_views (customer_id, product_id) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE views = views + IF(last_viewed_at < NOW() - INTERVAL 10 MINUTE, 1, 0), last_viewed_at = NOW()`,
    [req.customer.id, p.id]);
  res.status(204).end();
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
      const unit = sizePrices(p)?.[it.size]?.price ?? Number(p.price);   // a size with its own price
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
