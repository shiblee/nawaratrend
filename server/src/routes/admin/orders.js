/* Orders and customers. All admins can view orders and move them along; refunds are for owners and managers.
   Every change is written to the activity log, status changes to the order's timeline, and the customer
   is emailed (when the matching email template is on) after the change is saved. */
import express from "express";
import { pool } from "../../config/db.js";
import { ah, HttpError, str, oneOf, bool, paging, URL_RE } from "../../lib/http.js";
import { audit } from "../../lib/store.js";
import { NEXT, RESTOCK, NOT_SALE, STATUS_KEYS, PAYMENT_KEYS, STATUS_EMAIL, PAYMENT_EMAIL } from "../../lib/orders.js";
import { queueOrderEmail, getTemplate } from "../../lib/email/index.js";
import { avatarUrl } from "../account.js";

const router = express.Router();
export { NEXT };
const SALE_SQL = NOT_SALE.map((s) => `'${s}'`).join(",");
const money = (o) => ({ ...o, subtotal: Number(o.subtotal), delivery_fee: Number(o.delivery_fee), total: Number(o.total) });

function orderFilters(q) {
  const where = [], args = [];
  if (NEXT[q.status]) { where.push("o.status = ?"); args.push(q.status); }
  if (PAYMENT_KEYS.includes(q.payment_status)) { where.push("o.payment_status = ?"); args.push(q.payment_status); }
  if (["upi", "card", "cod"].includes(q.payment_method)) { where.push("o.payment_method = ?"); args.push(q.payment_method); }
  if (q.search) {
    const s = `%${String(q.search).trim()}%`;
    where.push("(o.order_number LIKE ? OR o.ship_name LIKE ? OR o.ship_phone LIKE ? OR o.ship_email LIKE ? OR o.ship_pin LIKE ? OR o.tracking_number LIKE ?)");
    args.push(s, s, s, s, s, s);
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
            o.ship_name, o.ship_phone, o.ship_email, o.ship_line1, o.ship_line2, o.ship_city, o.ship_state, o.ship_pin, o.courier, o.tracking_number, o.expected_delivery,
            (SELECT GROUP_CONCAT(CONCAT(qty, ' x ', product_name, IF(size IS NULL, '', CONCAT(' (', size, ')'))) SEPARATOR '; ') FROM order_items WHERE order_id = o.id) AS items
     FROM orders o ${w} ORDER BY o.created_at DESC LIMIT 10000`, args);
  const cols = ["order_number", "created_at", "status", "payment_method", "payment_status", "items", "subtotal", "delivery_fee", "total",
    "ship_name", "ship_phone", "ship_email", "ship_line1", "ship_line2", "ship_city", "ship_state", "ship_pin", "courier", "tracking_number", "expected_delivery"];
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
    `SELECT h.id, h.from_status, h.status, h.note, h.internal_note, h.actor, h.created_at, a.name AS admin_name
     FROM order_status_history h LEFT JOIN admins a ON a.id = h.admin_id WHERE h.order_id = ? ORDER BY h.created_at, h.id`, [o.id]);
  // every recorded change to this order (status, payment, tracking, notes…), newest first
  const [changes] = await pool.query(
    `SELECT l.id, l.action, l.details, l.ip, l.created_at, a.name AS admin_name FROM audit_logs l LEFT JOIN admins a ON a.id = l.admin_id
     WHERE l.entity = 'order' AND l.entity_id = ? ORDER BY l.created_at DESC, l.id DESC LIMIT 200`, [o.order_number]);
  const [emails] = await pool.query(
    `SELECT id, template_key, recipient, subject, status, attempts, last_error, trigger_source, created_at, sent_at
     FROM email_logs WHERE order_id = ? ORDER BY id DESC LIMIT 100`, [o.id]);
  let customer = null;
  if (o.customer_id) {
    const [c] = await pool.query(
      `SELECT c.id, c.name, c.email, c.phone, c.created_at, av.updated_at AS avatar_at, COUNT(o2.id) AS orders,
         COALESCE(SUM(IF(o2.status NOT IN (${SALE_SQL}), o2.total, 0)),0) AS spent
       FROM customers c LEFT JOIN orders o2 ON o2.customer_id = c.id LEFT JOIN customer_avatars av ON av.customer_id = c.id WHERE c.id = ? GROUP BY c.id`, [o.customer_id]);
    if (c[0]) customer = { ...c[0], spent: Number(c[0].spent), avatar: avatarUrl(c[0]) };
  }
  // which emails would go out for each possible next step, so the panel can say "the customer will be emailed"
  const emailFor = {};
  for (const st of [...NEXT[o.status]]) {
    const key = STATUS_EMAIL[st];
    emailFor[st] = key ? (await getTemplate(key)).enabled : false;
  }
  res.json({ ...money(o), items: items.map((i) => ({ ...i, unit_price: Number(i.unit_price), line_total: Number(i.line_total) })),
    history, changes, emails, customer, nextStatuses: NEXT[o.status], emailFor, emailTo: o.ship_email || customer?.email || null });
}));

// Moves an order on, and/or edits payment, courier, tracking and notes. Body:
//   status, note (the customer sees it), internal_note (team only), notify (email the customer, default true),
//   payment_status, courier, tracking_number, tracking_url, expected_delivery (YYYY-MM-DD), admin_notes
router.patch("/orders/:id", ah(async (req, res) => {
  const b = req.body || {};
  const notify = b.notify === undefined ? true : bool(b.notify);
  const emails = [];
  let order;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // the row lock means two people updating the same order at once can't both apply the same move
    const [rows] = await conn.query("SELECT * FROM orders WHERE id = ? FOR UPDATE", [req.params.id]);
    const o = order = rows[0];
    if (!o) throw new HttpError(404, "Order not found");
    const set = {}, changes = {};

    // tracking details first, so a "shipped" email already contains them
    for (const [k, max, pattern, msg] of [["courier", 60], ["tracking_number", 80], ["tracking_url", 255, URL_RE, "The tracking link must start with https://"], ["admin_notes", 2000]]) {
      if (b[k] !== undefined) { const v = str(b[k], k, { optional: true, max, pattern, msg }); if ((v || null) !== (o[k] || null)) { set[k] = v; changes[k] = [o[k], v]; } }
    }
    if (b.expected_delivery !== undefined) {
      const v = str(b.expected_delivery, "expected delivery", { optional: true, max: 10, pattern: /^\d{4}-\d{2}-\d{2}$/, msg: "Pick a date for the expected delivery" });
      const old = o.expected_delivery ? new Date(o.expected_delivery).toISOString().slice(0, 10) : null;
      if ((v || null) !== old) { set.expected_delivery = v; changes.expected_delivery = [old, v]; }
    }

    let historyId = null;
    if (b.status && b.status !== o.status) {
      oneOf(b.status, "status", STATUS_KEYS);
      if (!NEXT[o.status].includes(b.status)) throw new HttpError(400, `An order that is "${o.status}" can't be marked "${b.status}"`);
      const note = str(b.note, "message for the customer", { optional: true, max: 500 });
      const internal = str(b.internal_note, "internal note", { optional: true, max: 1000 });
      set.status = b.status; changes.status = [o.status, b.status];
      const [h] = await conn.query(
        "INSERT INTO order_status_history (order_id, from_status, status, note, internal_note, admin_id, actor) VALUES (?, ?, ?, ?, ?, ?, 'admin')",
        [o.id, o.status, b.status, note, internal, req.admin.id]);
      historyId = h.insertId;
      if (note) changes.message = note;
      if (internal) changes.internal_note = internal;
      if (RESTOCK.includes(b.status)) {
        const [items] = await conn.query("SELECT product_id, qty FROM order_items WHERE order_id = ? AND product_id IS NOT NULL", [o.id]);
        for (const it of items) await conn.query("UPDATE products SET stock = stock + ? WHERE id = ?", [it.qty, it.product_id]);
        changes.restocked = true;
      }
      if (notify && STATUS_EMAIL[b.status]) emails.push({ key: STATUS_EMAIL[b.status], dedupeKey: `status:${historyId}`, statusMessage: note });
      // cash on delivery is collected when the parcel is delivered
      if (b.status === "delivered" && o.payment_method === "cod" && o.payment_status === "pending" && b.payment_status === undefined) {
        set.payment_status = "paid"; changes.payment_status = ["pending", "paid"];
      }
    } else if (b.note || b.internal_note) {
      throw new HttpError(400, "Messages and internal notes are saved with a status change");
    }

    if (b.payment_status !== undefined && b.payment_status !== o.payment_status) {
      const next = oneOf(b.payment_status, "payment status", PAYMENT_KEYS);
      // refunds move money, so only owners and managers can record them
      if ((["refund_pending", "refunded"].includes(next) || o.payment_status === "refunded") && !["owner", "manager"].includes(req.admin.role)) {
        throw new HttpError(403, "Only owners and managers can record refunds");
      }
      set.payment_status = next; changes.payment_status = [o.payment_status, next];
      const key = PAYMENT_EMAIL[next];
      if (notify && key && !(next === "paid" && o.payment_method === "cod")) emails.push({ key, dedupeKey: `${key}:${o.id}` });
    }

    if (Object.keys(set).length) await conn.query("UPDATE orders SET ? WHERE id = ?", [set, o.id]);
    await conn.commit();
    if (Object.keys(changes).length) await audit(req, "order.update", "order", o.order_number, changes);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  // emails go out after the change is saved; a mail problem can't undo the update
  const emailed = [];
  for (const e of emails) {
    if (await queueOrderEmail(order.id, e.key, { trigger: "admin", adminId: req.admin.id, dedupeKey: e.dedupeKey, statusMessage: e.statusMessage })) emailed.push(e.key);
  }
  res.json({ ok: true, emailed });
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
       COUNT(o.id) AS orders, COALESCE(SUM(IF(o.status NOT IN (${SALE_SQL}), o.total, 0)),0) AS spent, MAX(o.created_at) AS last_order_at
     FROM customers c LEFT JOIN orders o ON o.customer_id = c.id ${w} GROUP BY c.id ORDER BY ${sorts[req.query.sort] || sorts.newest} LIMIT ? OFFSET ?`,
    [...args, limit, offset]);
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM customers c ${w}`, args);
  res.json({ rows: rows.map((r) => ({ ...r, is_active: !!r.is_active, spent: Number(r.spent) })), total, page, limit });
}));

router.get("/customers/:id", ah(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT c.id, c.name, c.email, c.phone, c.is_active, c.notes, c.created_at, c.last_login_at, c.locked_until, a.updated_at AS avatar_at
     FROM customers c LEFT JOIN customer_avatars a ON a.customer_id = c.id WHERE c.id = ?`, [req.params.id]);
  if (!rows[0]) throw new HttpError(404, "Customer not found");
  const [emails] = await pool.query(
    "SELECT id, template_key, recipient, subject, status, order_number, created_at FROM email_logs WHERE customer_id = ? ORDER BY id DESC LIMIT 50", [req.params.id]);
  const [orders] = await pool.query(
    "SELECT id, order_number, status, payment_method, payment_status, total, created_at FROM orders WHERE customer_id = ? ORDER BY created_at DESC", [req.params.id]);
  const valid = orders.filter((o) => !NOT_SALE.includes(o.status));
  const spent = valid.reduce((s, o) => s + Number(o.total), 0);
  const [addresses] = await pool.query(
    `SELECT ship_line1, ship_line2, ship_city, ship_state, ship_pin, MAX(created_at) AS last_used FROM orders WHERE customer_id = ?
     GROUP BY ship_line1, ship_line2, ship_city, ship_state, ship_pin ORDER BY last_used DESC LIMIT 5`, [req.params.id]);
  const { avatar_at, ...c } = rows[0];
  res.json({ ...c, avatar: avatarUrl(rows[0]), emails, is_active: !!c.is_active, orders: orders.map(money),
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
