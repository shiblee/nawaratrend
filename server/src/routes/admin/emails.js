/* Emails: templates, the log of every email sent, and sender settings. Owners and managers only
   (the log holds customers' email addresses). Staff still see an order's emails on the order page. */
import express from "express";
import { pool } from "../../config/db.js";
import { ah, HttpError, str, bool, paging, EMAIL } from "../../lib/http.js";
import { audit, getSettings } from "../../lib/store.js";
import { requireRole } from "../../middleware/auth.js";
import { TEMPLATES, VAR_HELP, validate, itemsTable } from "../../lib/email/templates.js";
import { getTemplate, render, queueEmail, processQueue, emailSettings, siteUrl, EMAIL_STATUS } from "../../lib/email/index.js";
import { getTransport } from "../../lib/email/transport.js";

const router = express.Router();
router.use("/emails", requireRole("owner", "manager"));

/* ---------- templates ---------- */
const money = (v) => "₹" + Number(v).toLocaleString("en-IN");
async function sampleVars() {
  const site = siteUrl(await getSettings());
  const items = [{ product_name: "Wireless Bluetooth Earbuds", qty: 1, line_total: 1299 }, { product_name: "Men's Cotton Slim-Fit Shirt", size: "L", qty: 2, line_total: 1398 }];
  return {
    customer_name: "Priya", customer_email: "priya@example.com", customer_phone: "9876543210",
    reset_url: `${site}/reset-password?token=sample`, reset_expires_minutes: "30",
    order_number: "NT26101234", order_date: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
    order_status: "Shipped", order_total: money(2697), order_subtotal: money(2697), delivery_fee: "Free", payment_method: "UPI", payment_status: "Paid",
    order_items: itemsTable(items, money), shipping_address: "Priya Sharma, 12 MG Road, Lucknow, Uttar Pradesh 226001, +91 98765 43210",
    tracking_number: "DLV123456789", courier_name: "Delhivery", tracking_url: "https://www.delhivery.com/track/package/DLV123456789",
    estimated_delivery_date: new Date(Date.now() + 3 * 864e5).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
    status_message: "Packed with care. Your parcel left our Lucknow warehouse this morning.",
    order_details_url: `${site}/account/orders/NT26101234`,
  };
}
const templateKey = (k) => { if (!TEMPLATES[k]) throw new HttpError(404, "No such email template"); return k; };
const formTemplate = (b) => ({
  subject: str(b.subject, "subject", { max: 255 }) || "",
  html: typeof b.html === "string" ? b.html.slice(0, 100000) : "",
  text: typeof b.text === "string" ? b.text.slice(0, 50000) : "",
});

router.get("/emails/templates", ah(async (req, res) => {
  const list = [];
  for (const key of Object.keys(TEMPLATES)) {
    const t = await getTemplate(key);
    list.push({ key, name: t.name, category: t.category, description: t.description, enabled: t.enabled, essential: t.essential,
      customised: t.customised, version: t.version, updated_at: t.updated_at, updated_by_name: t.updated_by_name, subject: t.subject });
  }
  const [stats] = await pool.query(
    "SELECT template_key, COUNT(*) AS total, SUM(status='sent') AS sent, SUM(status='failed') AS failed, MAX(created_at) AS last_at FROM email_logs GROUP BY template_key");
  const byKey = Object.fromEntries(stats.map((r) => [r.template_key, { total: r.total, sent: Number(r.sent), failed: Number(r.failed), last_at: r.last_at }]));
  res.json(list.map((t) => ({ ...t, stats: byKey[t.key] || { total: 0, sent: 0, failed: 0, last_at: null } })));
}));

router.get("/emails/templates/:key", ah(async (req, res) => {
  const key = templateKey(req.params.key);
  const t = await getTemplate(key);
  const def = TEMPLATES[key];
  res.json({ ...t, placeholders: t.allowed.map((v) => ({ name: v, help: VAR_HELP[v] || "" })), defaults: { subject: def.subject, html: def.html, text: def.text } });
}));

router.post("/emails/templates/:key/preview", ah(async (req, res) => {
  const key = templateKey(req.params.key);
  const form = formTemplate(req.body || {});
  const errors = validate(key, form);
  const out = await render(key, await sampleVars(), { template: { ...form, version: 0, enabled: true } });
  res.json({ subject: out.subject, html: out.html, text: out.text, errors });
}));

router.put("/emails/templates/:key", ah(async (req, res) => {
  const key = templateKey(req.params.key);
  const form = formTemplate(req.body || {});
  const errors = validate(key, form);
  if (errors.length) throw new HttpError(400, errors[0], { errors });
  const before = await getTemplate(key);
  const enabled = TEMPLATES[key].essential ? true : req.body?.enabled === undefined ? before.enabled : bool(req.body.enabled);
  await pool.query(
    `INSERT INTO email_templates (\`key\`, subject, html, text, enabled, version, updated_by) VALUES (?, ?, ?, ?, ?, 1, ?)
     ON DUPLICATE KEY UPDATE subject = VALUES(subject), html = VALUES(html), text = VALUES(text), enabled = VALUES(enabled), version = version + 1, updated_by = VALUES(updated_by)`,
    [key, form.subject, form.html, form.text, enabled ? 1 : 0, req.admin.id]);
  const changed = ["subject", "html", "text"].filter((k) => (before[k] || "") !== form[k]);
  await audit(req, "email_template.update", "email_template", key, { name: TEMPLATES[key].name, changed, ...(enabled !== before.enabled ? { enabled: [before.enabled, enabled] } : {}) });
  res.json(await getTemplate(key));
}));

router.patch("/emails/templates/:key", ah(async (req, res) => {
  const key = templateKey(req.params.key);
  if (TEMPLATES[key].essential) throw new HttpError(400, "This email can't be turned off: customers need it to get back into their account");
  const enabled = bool(req.body?.enabled);
  const t = await getTemplate(key);
  await pool.query(
    `INSERT INTO email_templates (\`key\`, subject, html, text, enabled, version, updated_by) VALUES (?, ?, ?, ?, ?, 1, ?)
     ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), updated_by = VALUES(updated_by)`,
    [key, t.subject, t.html, t.text, enabled ? 1 : 0, req.admin.id]);
  await audit(req, enabled ? "email_template.enable" : "email_template.disable", "email_template", key, { name: TEMPLATES[key].name });
  res.json({ ok: true });
}));

// back to the built-in wording (on/off stays as it is)
router.post("/emails/templates/:key/reset", ah(async (req, res) => {
  const key = templateKey(req.params.key);
  const def = TEMPLATES[key];
  const t = await getTemplate(key);
  await pool.query(
    `INSERT INTO email_templates (\`key\`, subject, html, text, enabled, version, updated_by) VALUES (?, ?, ?, ?, ?, 1, ?)
     ON DUPLICATE KEY UPDATE subject = VALUES(subject), html = VALUES(html), text = VALUES(text), version = version + 1, updated_by = VALUES(updated_by)`,
    [key, def.subject, def.html, def.text, t.enabled ? 1 : 0, req.admin.id]);
  await audit(req, "email_template.reset", "email_template", key, { name: def.name });
  res.json(await getTemplate(key));
}));

// Test emails only go to the team's own addresses (or the store's support address), so this can't be used to email strangers.
router.post("/emails/templates/:key/test", ah(async (req, res) => {
  const key = templateKey(req.params.key);
  const to = (str(req.body?.to, "to", { optional: true, max: 150, pattern: EMAIL, msg: "Enter a valid email" }) || req.admin.email).toLowerCase();
  const es = emailSettings(await getSettings());
  const [team] = await pool.query("SELECT email FROM admins WHERE is_active = 1");
  const allowed = new Set([...team.map((a) => a.email.toLowerCase()), es.support_email, es.reply_to, es.from_address].filter(Boolean).map((e) => e.toLowerCase()));
  if (!allowed.has(to)) throw new HttpError(400, "Test emails can only go to an admin team member's email or the store's support address");
  const form = req.body?.html ? formTemplate(req.body) : await getTemplate(key);
  const errors = validate(key, form);
  if (errors.length) throw new HttpError(400, errors[0], { errors });
  const vars = await sampleVars();
  // render with the form's (possibly unsaved) wording
  const out = await render(key, vars, { template: { ...form, version: 0, enabled: true } });
  const [ins] = await pool.query(
    `INSERT INTO email_logs (template_key, template_version, category, recipient, subject, html, text, status, trigger_source, triggered_by)
     VALUES (?, 0, 'test', ?, ?, ?, ?, 'queued', 'test', ?)`, [key, to, `[Test] ${out.subject}`.slice(0, 255), out.html, out.text, req.admin.id]);
  await audit(req, "email.test", "email", ins.insertId, { name: TEMPLATES[key].name, to });
  await processQueue();
  const [[row]] = await pool.query("SELECT id, status, last_error, provider_response FROM email_logs WHERE id = ?", [ins.insertId]);
  res.json(row);
}));

/* ---------- log ---------- */
function logFilters(q) {
  const where = [], args = [];
  if (EMAIL_STATUS.includes(q.status)) { where.push("e.status = ?"); args.push(q.status); }
  if (TEMPLATES[q.template]) { where.push("e.template_key = ?"); args.push(q.template); }
  if (["account", "order", "test"].includes(q.category)) { where.push("e.category = ?"); args.push(q.category); }
  if (["registration", "order", "admin", "system", "test", "retry", "customer"].includes(q.trigger)) { where.push("e.trigger_source = ?"); args.push(q.trigger); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.from || "")) { where.push("e.created_at >= ?"); args.push(q.from); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.to || "")) { where.push("e.created_at < DATE_ADD(?, INTERVAL 1 DAY)"); args.push(q.to); }
  if (q.customer) { where.push("e.customer_id = ?"); args.push(Number(q.customer)); }
  if (q.order) { where.push("e.order_id = ?"); args.push(Number(q.order)); }
  if (q.search) {
    const s = String(q.search).trim().replace(/^#/, "");
    if (/^\d+$/.test(s)) { where.push("(e.id = ? OR e.recipient LIKE ? OR e.order_number LIKE ?)"); args.push(Number(s), `%${s}%`, `%${s}%`); }
    else { where.push("(e.recipient LIKE ? OR e.subject LIKE ? OR e.order_number LIKE ? OR c.name LIKE ?)"); args.push(...Array(4).fill(`%${s}%`)); }
  }
  return { w: where.length ? "WHERE " + where.join(" AND ") : "", args };
}
const LIST_COLS = `e.id, e.template_key, e.category, e.recipient, e.customer_id, c.name AS customer_name, e.order_id, e.order_number, e.subject,
  e.status, e.attempts, e.max_attempts, e.next_attempt_at, e.last_error, e.trigger_source, e.created_at, e.sent_at, a.name AS triggered_by_name`;
const LIST_JOIN = "FROM email_logs e LEFT JOIN customers c ON c.id = e.customer_id LEFT JOIN admins a ON a.id = e.triggered_by";

router.get("/emails/logs", ah(async (req, res) => {
  const { page, limit, offset } = paging(req.query, { defLimit: 25 });
  const { w, args } = logFilters(req.query);
  const [rows] = await pool.query(`SELECT ${LIST_COLS} ${LIST_JOIN} ${w} ORDER BY e.id DESC LIMIT ? OFFSET ?`, [...args, limit, offset]);
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${LIST_JOIN} ${w}`, args);
  const [counts] = await pool.query("SELECT status, COUNT(*) AS n FROM email_logs GROUP BY status");
  res.json({ rows: rows.map((r) => ({ ...r, name: TEMPLATES[r.template_key]?.name || r.template_key })), total, page, limit,
    statusCounts: Object.fromEntries(counts.map((c) => [c.status, c.n])) });
}));

router.get("/emails/logs/export.csv", ah(async (req, res) => {
  const { w, args } = logFilters(req.query);
  const [rows] = await pool.query(`SELECT ${LIST_COLS}, e.provider_message_id ${LIST_JOIN} ${w} ORDER BY e.id DESC LIMIT 10000`, args);
  const cols = ["id", "created_at", "sent_at", "status", "name", "recipient", "customer_name", "order_number", "subject", "trigger_source", "triggered_by_name", "attempts", "last_error", "provider_message_id"];
  const cell = (v) => { let s = v instanceof Date ? v.toISOString() : String(v ?? ""); if (/^[=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => cell(c === "name" ? TEMPLATES[r.template_key]?.name || r.template_key : r[c])).join(","))].join("\r\n");
  await audit(req, "emails.export", "email", null, { rows: rows.length, filters: req.query });
  res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="emails-${new Date().toISOString().slice(0, 10)}.csv"` });
  res.send("﻿" + csv);
}));

router.get("/emails/logs/:id", ah(async (req, res) => {
  const [[row]] = await pool.query(`SELECT ${LIST_COLS}, e.template_version, e.html, e.text, e.provider_message_id, e.provider_response, e.dedupe_key
    ${LIST_JOIN} WHERE e.id = ?`, [req.params.id]);
  if (!row) throw new HttpError(404, "Email not found");
  const [attempts] = await pool.query("SELECT attempt, status, response, created_at FROM email_attempts WHERE email_id = ? ORDER BY id", [row.id]);
  res.json({ ...row, name: TEMPLATES[row.template_key]?.name || row.template_key, attempts_log: attempts });
}));

// Failed or skipped: try that same email once more. Already sent: send a fresh copy (recorded as a new email).
router.post("/emails/logs/:id/retry", ah(async (req, res) => {
  const [[e]] = await pool.query("SELECT * FROM email_logs WHERE id = ?", [req.params.id]);
  if (!e) throw new HttpError(404, "Email not found");
  if (e.status === "queued" || e.status === "sending") throw new HttpError(409, "This email is already waiting to be sent");
  let id = e.id;
  if (e.status === "sent") {
    const [ins] = await pool.query(
      `INSERT INTO email_logs (template_key, template_version, category, recipient, customer_id, order_id, order_number, subject, html, text, status, trigger_source, triggered_by)
       SELECT template_key, template_version, category, recipient, customer_id, order_id, order_number, subject, html, text, 'queued', 'retry', ? FROM email_logs WHERE id = ?`,
      [req.admin.id, e.id]);
    id = ins.insertId;
  } else {
    await pool.query("UPDATE email_logs SET status = 'queued', max_attempts = attempts + 1, next_attempt_at = NULL, last_error = NULL WHERE id = ?", [e.id]);
  }
  await audit(req, e.status === "sent" ? "email.resend" : "email.retry", "email", e.id, { to: e.recipient, subject: e.subject, ...(id !== e.id ? { new_id: id } : {}) });
  await processQueue();
  const [[row]] = await pool.query("SELECT id, status, last_error FROM email_logs WHERE id = ?", [id]);
  res.json(row);
}));

/* ---------- settings ---------- */
const SETTING_RULES = {
  "email.enabled": (v) => (bool(v) ? "1" : "0"),
  "email.from_name": (v) => str(v, "sender name", { min: 2, max: 60 }),
  "email.from_address": (v) => str(v, "sender email", { max: 150, pattern: EMAIL, msg: "Enter a valid sender email" }),
  "email.reply_to": (v) => str(v, "reply-to email", { optional: true, max: 150, pattern: EMAIL, msg: "Enter a valid reply-to email" }) || "",
  "email.support_email": (v) => str(v, "support email", { optional: true, max: 150, pattern: EMAIL, msg: "Enter a valid support email" }) || "",
};

router.get("/emails/settings", ah(async (req, res) => {
  const s = await getSettings();
  const [[last30]] = await pool.query(
    "SELECT COUNT(*) AS total, SUM(status='sent') AS sent, SUM(status='failed') AS failed, SUM(status='queued') AS queued FROM email_logs WHERE created_at >= NOW() - INTERVAL 30 DAY");
  const kind = getTransport().kind;
  res.json({
    ...emailSettings(s),
    // how mail leaves the server is set in .env (with any passwords), so it's shown but not editable here
    transport: { kind, label: { sendmail: "This server's mail system", smtp: `SMTP (${process.env.SMTP_HOST || "not set"})`, log: "Not sending: development mode" }[kind] || kind },
    last30: { total: Number(last30.total || 0), sent: Number(last30.sent || 0), failed: Number(last30.failed || 0), queued: Number(last30.queued || 0) },
  });
}));

router.put("/emails/settings", ah(async (req, res) => {
  const b = req.body || {}, changed = {};
  const before = await getSettings();
  for (const [key, rule] of Object.entries(SETTING_RULES)) {
    const field = key.slice(6);   // "email.from_name" -> "from_name"
    if (b[field] === undefined) continue;
    const value = rule(b[field]);
    await pool.query("INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [key, value]);
    if ((before[key] ?? "") !== value) changed[field] = [before[key] ?? "", value];
  }
  if (Object.keys(changed).length) await audit(req, "email.settings", "settings", null, changed);
  res.json({ ok: true });
}));

export default router;
