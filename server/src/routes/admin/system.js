/* Dashboard, contact messages, admin team, activity log and store settings. */
import express from "express";
import bcrypt from "bcryptjs";
import { pool } from "../../config/db.js";
import { ah, HttpError, str, num, oneOf, bool, paging, EMAIL, password } from "../../lib/http.js";
import { audit, getSettings } from "../../lib/store.js";
import { requireRole } from "../../middleware/auth.js";

const router = express.Router();
const SALE = "status NOT IN ('cancelled','returned')";   // orders that count as sales

/* ---------- Dashboard ---------- */
router.get("/dashboard", ah(async (req, res) => {
  const q = async (sql, args = []) => (await pool.query(sql, args))[0];
  const period = async (from, to) => (await q(
    `SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue FROM orders WHERE ${SALE} AND created_at >= ${from} AND created_at < ${to}`))[0];

  const [today, last7, last30, prev30] = await Promise.all([
    period("CURDATE()", "CURDATE() + INTERVAL 1 DAY"),
    period("CURDATE() - INTERVAL 6 DAY", "CURDATE() + INTERVAL 1 DAY"),
    period("CURDATE() - INTERVAL 29 DAY", "CURDATE() + INTERVAL 1 DAY"),
    period("CURDATE() - INTERVAL 59 DAY", "CURDATE() - INTERVAL 29 DAY"),
  ]);
  const [[cust]] = [await q(`SELECT COUNT(*) AS total, SUM(created_at >= CURDATE() - INTERVAL 29 DAY) AS new30 FROM customers`)];
  const [[prod]] = [await q(`SELECT SUM(status='active') AS active, SUM(status='active' AND stock = 0) AS out_of_stock,
                               SUM(status='active' AND stock > 0 AND stock <= low_stock_threshold) AS low_stock FROM products`)];
  const [[msgs]] = [await q("SELECT SUM(status='new') AS unread, COUNT(*) AS total FROM contact_messages")];
  const statusRows = await q("SELECT status, COUNT(*) AS n FROM orders GROUP BY status");
  const payRows = await q(`SELECT payment_method AS method, COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue FROM orders
                           WHERE ${SALE} AND created_at >= CURDATE() - INTERVAL 29 DAY GROUP BY payment_method`);
  const daily = await q(`SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS day, COUNT(*) AS orders, SUM(total) AS revenue FROM orders
                         WHERE ${SALE} AND created_at >= CURDATE() - INTERVAL 29 DAY GROUP BY day`);
  // fill in days without orders so the chart has all 30 days
  const byDay = Object.fromEntries(daily.map((d) => [d.day, d]));
  const salesByDay = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    salesByDay.push({ day: key, orders: byDay[key]?.orders || 0, revenue: Number(byDay[key]?.revenue || 0) });
  }
  const topProducts = await q(
    `SELECT oi.product_id, oi.product_name AS name, SUM(oi.qty) AS units, SUM(oi.line_total) AS revenue FROM order_items oi
     JOIN orders o ON o.id = oi.order_id WHERE o.${SALE} AND o.created_at >= CURDATE() - INTERVAL 29 DAY
     GROUP BY oi.product_id, oi.product_name ORDER BY units DESC LIMIT 5`);
  const topCategories = await q(
    `SELECT COALESCE(c.name, 'Uncategorised') AS name, SUM(oi.line_total) AS revenue FROM order_items oi JOIN orders o ON o.id = oi.order_id
     LEFT JOIN products p ON p.id = oi.product_id LEFT JOIN categories c ON c.id = p.category_id
     WHERE o.${SALE} AND o.created_at >= CURDATE() - INTERVAL 29 DAY GROUP BY c.name ORDER BY revenue DESC LIMIT 6`);
  const recentOrders = await q("SELECT id, order_number, ship_name, total, status, payment_method, created_at FROM orders ORDER BY created_at DESC LIMIT 8");
  const lowStock = await q(`SELECT id, name, stock, low_stock_threshold FROM products WHERE status='active' AND stock <= low_stock_threshold ORDER BY stock LIMIT 8`);
  const activity = await q(`SELECT l.action, l.entity, l.entity_id, l.details, l.created_at, a.name AS admin_name FROM audit_logs l
                            LEFT JOIN admins a ON a.id = l.admin_id ORDER BY l.created_at DESC, l.id DESC LIMIT 8`);
  const N = (v) => Number(v || 0);
  const kpi = (p) => ({ orders: N(p.orders), revenue: N(p.revenue) });
  res.json({
    today: kpi(today), last7: kpi(last7), last30: kpi(last30), prev30: kpi(prev30),
    averageOrder: N(last30.orders) ? Math.round(N(last30.revenue) / N(last30.orders)) : 0,
    customers: { total: N(cust.total), new30: N(cust.new30) },
    products: { active: N(prod.active), lowStock: N(prod.low_stock), outOfStock: N(prod.out_of_stock) },
    messages: { unread: N(msgs.unread), total: N(msgs.total) },
    statusCounts: Object.fromEntries(statusRows.map((r) => [r.status, r.n])),
    payments: payRows.map((r) => ({ method: r.method, orders: r.orders, revenue: N(r.revenue) })),
    salesByDay,
    topProducts: topProducts.map((r) => ({ ...r, units: N(r.units), revenue: N(r.revenue) })),
    topCategories: topCategories.map((r) => ({ ...r, revenue: N(r.revenue) })),
    recentOrders: recentOrders.map((r) => ({ ...r, total: N(r.total) })),
    lowStock, activity,
  });
}));

/* ---------- Contact messages ---------- */
router.get("/messages", ah(async (req, res) => {
  const { page, limit, offset } = paging(req.query);
  const where = [], args = [];
  if (["new", "read", "replied", "closed"].includes(req.query.status)) { where.push("status = ?"); args.push(req.query.status); }
  if (req.query.search) { const s = `%${req.query.search}%`; where.push("(name LIKE ? OR contact LIKE ? OR message LIKE ? OR order_ref LIKE ?)"); args.push(s, s, s, s); }
  const w = where.length ? "WHERE " + where.join(" AND ") : "";
  const [rows] = await pool.query(`SELECT * FROM contact_messages ${w} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...args, limit, offset]);
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM contact_messages ${w}`, args);
  const [counts] = await pool.query("SELECT status, COUNT(*) AS n FROM contact_messages GROUP BY status");
  res.json({ rows, total, page, limit, statusCounts: Object.fromEntries(counts.map((c) => [c.status, c.n])) });
}));

router.patch("/messages/:id", ah(async (req, res) => {
  const status = oneOf(req.body?.status, "status", ["new", "read", "replied", "closed"]);
  const [r] = await pool.query("UPDATE contact_messages SET status = ? WHERE id = ?", [status, req.params.id]);
  if (!r.affectedRows) throw new HttpError(404, "Message not found");
  await audit(req, "message.status", "message", req.params.id, { status });
  res.json({ ok: true });
}));

router.delete("/messages/:id", requireRole("owner", "manager"), ah(async (req, res) => {
  const [r] = await pool.query("DELETE FROM contact_messages WHERE id = ?", [req.params.id]);
  if (!r.affectedRows) throw new HttpError(404, "Message not found");
  await audit(req, "message.delete", "message", req.params.id);
  res.json({ ok: true });
}));

/* ---------- Team (owners only) ---------- */
const owners = requireRole("owner");
const teamRow = ({ password: _p, token_version, ...a }) => ({ ...a, is_active: !!a.is_active, must_change_password: !!a.must_change_password });

router.get("/team", owners, ah(async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM admins ORDER BY FIELD(role,'owner','manager','staff'), name");
  res.json(rows.map(teamRow));
}));

router.post("/team", owners, ah(async (req, res) => {
  const b = req.body || {};
  const name = str(b.name, "name", { min: 2, max: 100 });
  const email = str(b.email, "email", { max: 150, pattern: EMAIL, msg: "Enter a valid email" }).toLowerCase();
  const role = oneOf(b.role, "role", ["owner", "manager", "staff"]);
  const pw = password(b.password, "temporary password");
  const [d] = await pool.query("SELECT id FROM admins WHERE email = ?", [email]);
  if (d.length) throw new HttpError(409, "An admin with this email already exists");
  // new members must choose their own password at first sign-in
  const [r] = await pool.query("INSERT INTO admins (name, email, password, role, must_change_password) VALUES (?, ?, ?, ?, 1)", [name, email, await bcrypt.hash(pw, 12), role]);
  await audit(req, "team.add", "admin", r.insertId, { name, email, role });
  res.status(201).json({ id: r.insertId });
}));

router.patch("/team/:id", owners, ah(async (req, res) => {
  const id = Number(req.params.id), b = req.body || {};
  const [rows] = await pool.query("SELECT * FROM admins WHERE id = ?", [id]);
  const target = rows[0];
  if (!target) throw new HttpError(404, "Admin not found");
  const set = {};
  if (b.role !== undefined) set.role = oneOf(b.role, "role", ["owner", "manager", "staff"]);
  if (b.is_active !== undefined) set.is_active = bool(b.is_active) ? 1 : 0;
  if (b.password) { set.password = await bcrypt.hash(password(b.password, "temporary password"), 12); set.must_change_password = 1; }
  if (b.unlock) { set.failed_attempts = 0; set.locked_until = null; }
  if (!Object.keys(set).length) throw new HttpError(400, "Nothing to update");
  if (id === req.admin.id && (set.is_active === 0 || (set.role && set.role !== "owner"))) {
    throw new HttpError(400, "You can't disable your own account or remove your own owner role");
  }
  if (target.role === "owner" && ((set.role && set.role !== "owner") || set.is_active === 0)) {
    const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM admins WHERE role = 'owner' AND is_active = 1 AND id <> ?", [id]);
    if (n === 0) throw new HttpError(400, "There must always be at least one active owner");
  }
  // role, status or password changes sign the person out everywhere
  if (set.role || set.is_active !== undefined || set.password) set.token_version = target.token_version + 1;
  await pool.query("UPDATE admins SET ? WHERE id = ?", [set, id]);
  const { password: _p, token_version: _t, ...logged } = set;
  await audit(req, "team.update", "admin", id, { name: target.name, ...logged, passwordReset: !!set.password });
  res.json({ ok: true });
}));

/* ---------- Activity log (owners and managers) ---------- */
router.get("/audit", requireRole("owner", "manager"), ah(async (req, res) => {
  const { page, limit, offset } = paging(req.query, { defLimit: 30 });
  const where = [], args = [];
  if (req.query.admin) { where.push("l.admin_id = ?"); args.push(Number(req.query.admin)); }
  if (req.query.entity) { where.push("l.entity = ?"); args.push(String(req.query.entity)); }
  if (req.query.action) { where.push("l.action LIKE ?"); args.push(`${req.query.action}%`); }
  const w = where.length ? "WHERE " + where.join(" AND ") : "";
  const [rows] = await pool.query(
    `SELECT l.*, a.name AS admin_name, a.email AS admin_email FROM audit_logs l LEFT JOIN admins a ON a.id = l.admin_id ${w}
     ORDER BY l.created_at DESC, l.id DESC LIMIT ? OFFSET ?`, [...args, limit, offset]);
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM audit_logs l ${w}`, args);
  res.json({ rows, total, page, limit });
}));

/* ---------- Settings ---------- */
const SETTING_RULES = {
  store_name: (v) => str(v, "store name", { min: 2, max: 60 }),
  free_shipping_threshold: (v) => String(num(v, "free delivery from", { int: true, min: 0, max: 1000000 })),
  delivery_fee: (v) => String(num(v, "delivery charge", { int: true, min: 0, max: 10000 })),
  phone: (v) => str(v, "phone", { max: 30 }),
  whatsapp: (v) => str(v, "WhatsApp", { max: 30 }),
  address: (v) => str(v, "address", { max: 300 }),
  cod_enabled: (v) => (bool(v) ? "1" : "0"),
  whatsapp_enabled: (v) => (bool(v) ? "1" : "0"),
  whatsapp_message: (v) => str(v, "WhatsApp greeting", { optional: true, max: 300 }) || "",
};

router.get("/settings", ah(async (req, res) => {
  const s = await getSettings();
  // the SEO keys have their own page
  res.json(Object.fromEntries(Object.entries(s).filter(([k]) => !k.startsWith("seo."))));
}));

router.put("/settings", requireRole("owner", "manager"), ah(async (req, res) => {
  const b = req.body || {}, changed = {};
  const before = await getSettings();
  for (const [key, rule] of Object.entries(SETTING_RULES)) {
    if (b[key] === undefined) continue;
    const value = rule(b[key]);
    await pool.query("INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [key, value]);
    if (String(before[key] === true ? "1" : before[key] === false ? "0" : before[key]) !== value) changed[key] = [before[key], value];
  }
  if (Object.keys(changed).length) await audit(req, "settings.update", "settings", null, changed);
  res.json({ ok: true });
}));

export default router;
