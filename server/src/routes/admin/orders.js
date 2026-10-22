/* Orders and customers. All admins can view and update orders. */
import express from "express";
import { pool } from "../../config/db.js";
import { ah, HttpError, str, oneOf, bool, paging } from "../../lib/http.js";
import { audit } from "../../lib/store.js";

const router = express.Router();

// Which status each status may move to. Cancelling or returning puts the items back in stock.
export const NEXT = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["packed", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["delivered", "returned"],
  delivered: ["returned"],
  cancelled: [],
  returned: [],
};
const RESTOCK = ["cancelled", "returned"];
const money = (o) => ({ ...o, subtotal: Number(o.subtotal), delivery_fee: Number(o.delivery_fee), total: Number(o.total) });

function orderFilters(q) {
  const where = [], args = [];
  if (NEXT[q.status]) { where.push("o.status = ?"); args.push(q.status); }
  if (["pending", "paid", "failed", "refunded"].includes(q.payment_status)) { where.push("o.payment_status = ?"); args.push(q.payment_status); }
  if (["upi", "card", "cod"].includes(q.payment_method)) { where.push("o.payment_method = ?"); args.push(q.payment_method); }
  if (q.search) {
    const s = `%${String(q.search).trim()}%`;
    where.push("(o.order_number LIKE ? OR o.ship_name LIKE ? OR o.ship_phone LIKE ? OR o.ship_email LIKE ? OR o.ship_pin LIKE ?)");
    args.push(s, s, s, s, s);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.from || "")) { where.push("o.created_at >= ?"); args.push(q.from); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.to || "")) { where.push("o.created_at < DATE_ADD(?, INTERVAL 1 DAY)"); args.push(q.to); }
  if (q.customer) { where.push("o.customer_id = ?"); args.push(Number(q.customer)); }
  return { w: where.length ? "WHERE " + where.join(" AND ") : "", args };
}

router.get("/orders", ah(async (req, res) => {
  const { page, limit, offset } = paging(req.query);
  const { w, args } = orderFilters(req.query);
  const [rows] = await pool.query(
    `SELECT o.id, o.order_number, o.status, o.payment_method, o.payment_status, o.total, o.ship_name, o.ship_phone, o.ship_city,
            o.ship_state, o.customer_id, o.created_at, (SELECT SUM(qty) FROM order_items WHERE order_id = o.id) AS item_count
     FROM orders o ${w} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`, [...args, limit, offset]);
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM orders o ${w}`, args);
  const [counts] = await pool.query("SELECT status, COUNT(*) AS n FROM orders GROUP BY status");
  res.json({ rows: rows.map((r) => ({ ...r, total: Number(r.total), item_count: Number(r.item_count || 0) })), total, page, limit,
    statusCounts: Object.fromEntries(counts.map((c) => [c.status, c.n])) });
}));

// Spreadsheet download of the filtered orders (opens in Excel / Google Sheets)
router.get("/orders/export.csv", ah(async (req, res) => {
  const { w, args } = orderFilters(req.query);
  const [rows] = await pool.query(
    `SELECT o.order_number, o.created_at, o.status, o.payment_method, o.payment_status, o.subtotal, o.delivery_fee, o.total,
            o.ship_name, o.ship_phone, o.ship_email, o.ship_line1, o.ship_line2, o.ship_city, o.ship_state, o.ship_pin, o.courier, o.tracking_number,
            (SELECT GROUP_CONCAT(CONCAT(qty, ' x ', product_name, IF(size IS NULL, '', CONCAT(' (', size, ')'))) SEPARATOR '; ') FROM order_items WHERE order_id = o.id) AS items
     FROM orders o ${w} ORDER BY o.created_at DESC LIMIT 10000`, args);
  const cols = ["order_number", "created_at", "status", "payment_method", "payment_status", "items", "subtotal", "delivery_fee", "total",
    "ship_name", "ship_phone", "ship_email", "ship_line1", "ship_line2", "ship_city", "ship_state", "ship_pin", "courier", "tracking_number"];
  // quote every cell, and stop spreadsheet formulas from running (cells starting with = + - @)
  const cell = (v) => { let s = v instanceof Date ? v.toISOString() : String(v ?? ""); if (/^[=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
  await audit(req, "orders.export", "order", null, { rows: rows.length, filters: req.query });
  res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"` });
  res.send("﻿" + csv);
}));

router.get("/orders/:id", ah(async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM orders WHERE id = ?", [req.params.id]);
  const o = rows[0];
  if (!o) throw new HttpError(404, "Order not found");
  const [items] = await pool.query(
    "SELECT oi.*, p.stock AS current_stock, p.status AS product_status FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?", [o.id]);
  const [history] = await pool.query(
    "SELECT h.status, h.note, h.created_at, a.name AS admin_name FROM order_status_history h LEFT JOIN admins a ON a.id = h.admin_id WHERE h.order_id = ? ORDER BY h.created_at, h.id", [o.id]);
  let customer = null;
  if (o.customer_id) {
    const [c] = await pool.query(
      `SELECT c.id, c.name, c.email, c.phone, c.created_at, COUNT(o2.id) AS orders, COALESCE(SUM(IF(o2.status NOT IN ('cancelled','returned'), o2.total, 0)),0) AS spent
       FROM customers c LEFT JOIN orders o2 ON o2.customer_id = c.id WHERE c.id = ? GROUP BY c.id`, [o.customer_id]);
    if (c[0]) customer = { ...c[0], spent: Number(c[0].spent) };
  }
  res.json({ ...money(o), items: items.map((i) => ({ ...i, unit_price: Number(i.unit_price), line_total: Number(i.line_total) })),
    history, customer, nextStatuses: NEXT[o.status] });
}));

router.patch("/orders/:id", ah(async (req, res) => {
  const b = req.body || {};
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query("SELECT * FROM orders WHERE id = ? FOR UPDATE", [req.params.id]);
    const o = rows[0];
    if (!o) throw new HttpError(404, "Order not found");
    const set = {}, changes = {};

    if (b.status && b.status !== o.status) {
      if (!NEXT[o.status].includes(b.status)) throw new HttpError(400, `An order that is ${o.status} can't be marked ${b.status}`);
      set.status = b.status; changes.status = [o.status, b.status];
      const note = str(b.note, "note", { optional: true, max: 255 });
      await conn.query("INSERT INTO order_status_history (order_id, status, note, admin_id) VALUES (?, ?, ?, ?)", [o.id, b.status, note, req.admin.id]);
      if (RESTOCK.includes(b.status)) {
        const [items] = await conn.query("SELECT product_id, qty FROM order_items WHERE order_id = ? AND product_id IS NOT NULL", [o.id]);
        for (const it of items) await conn.query("UPDATE products SET stock = stock + ? WHERE id = ?", [it.qty, it.product_id]);
      }
      // cash on delivery is collected when the parcel is delivered
      if (b.status === "delivered" && o.payment_method === "cod" && o.payment_status === "pending" && b.payment_status === undefined) set.payment_status = "paid";
    }
    if (b.payment_status !== undefined && b.payment_status !== o.payment_status) {
      set.payment_status = oneOf(b.payment_status, "payment status", ["pending", "paid", "failed", "refunded"]);
      changes.payment_status = [o.payment_status, set.payment_status];
    }
    for (const [k, max] of [["courier", 60], ["tracking_number", 80], ["admin_notes", 2000]]) {
      if (b[k] !== undefined) { const v = str(b[k], k, { optional: true, max }); if ((v || null) !== (o[k] || null)) { set[k] = v; changes[k] = [o[k], v]; } }
    }
    if (Object.keys(set).length) await conn.query("UPDATE orders SET ? WHERE id = ?", [set, o.id]);
    await conn.commit();
    if (Object.keys(changes).length) await audit(req, "order.update", "order", o.order_number, changes);
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}));

/* ---------- Customers ---------- */
router.get("/customers", ah(async (req, res) => {
  const { page, limit, offset } = paging(req.query);
  const where = [], args = [];
  if (req.query.search) { const s = `%${req.query.search}%`; where.push("(c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)"); args.push(s, s, s); }
  if (req.query.active === "0" || req.query.active === "1") { where.push("c.is_active = ?"); args.push(Number(req.query.active)); }
  const w = where.length ? "WHERE " + where.join(" AND ") : "";
  const sorts = { newest: "c.created_at DESC", spent: "spent DESC", orders: "orders DESC", name: "c.name" };
  const [rows] = await pool.query(
    `SELECT c.id, c.name, c.email, c.phone, c.is_active, c.created_at, c.last_login_at,
       COUNT(o.id) AS orders, COALESCE(SUM(IF(o.status NOT IN ('cancelled','returned'), o.total, 0)),0) AS spent, MAX(o.created_at) AS last_order_at
     FROM customers c LEFT JOIN orders o ON o.customer_id = c.id ${w} GROUP BY c.id ORDER BY ${sorts[req.query.sort] || sorts.newest} LIMIT ? OFFSET ?`,
    [...args, limit, offset]);
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM customers c ${w}`, args);
  res.json({ rows: rows.map((r) => ({ ...r, is_active: !!r.is_active, spent: Number(r.spent) })), total, page, limit });
}));

router.get("/customers/:id", ah(async (req, res) => {
  const [rows] = await pool.query("SELECT id, name, email, phone, is_active, notes, created_at, last_login_at, locked_until FROM customers WHERE id = ?", [req.params.id]);
  if (!rows[0]) throw new HttpError(404, "Customer not found");
  const [orders] = await pool.query(
    "SELECT id, order_number, status, payment_method, payment_status, total, created_at FROM orders WHERE customer_id = ? ORDER BY created_at DESC", [req.params.id]);
  const valid = orders.filter((o) => !["cancelled", "returned"].includes(o.status));
  const spent = valid.reduce((s, o) => s + Number(o.total), 0);
  const [addresses] = await pool.query(
    `SELECT ship_line1, ship_line2, ship_city, ship_state, ship_pin, MAX(created_at) AS last_used FROM orders WHERE customer_id = ?
     GROUP BY ship_line1, ship_line2, ship_city, ship_state, ship_pin ORDER BY last_used DESC LIMIT 5`, [req.params.id]);
  res.json({ ...rows[0], is_active: !!rows[0].is_active, orders: orders.map(money),
    stats: { orders: orders.length, spent, average: valid.length ? Math.round(spent / valid.length) : 0 }, addresses });
}));

router.patch("/customers/:id", ah(async (req, res) => {
  const set = {};
  if (req.body?.is_active !== undefined) set.is_active = bool(req.body.is_active) ? 1 : 0;
  if (req.body?.notes !== undefined) set.notes = str(req.body.notes, "notes", { optional: true, max: 2000 });
  if (!Object.keys(set).length) throw new HttpError(400, "Nothing to update");
  const [r] = await pool.query("UPDATE customers SET ? WHERE id = ?", [set, req.params.id]);
  if (!r.affectedRows) throw new HttpError(404, "Customer not found");
  await audit(req, set.is_active === 0 ? "customer.disable" : set.is_active === 1 ? "customer.enable" : "customer.update", "customer", req.params.id, set);
  res.json({ ok: true });
}));

export default router;
