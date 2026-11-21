/* Communication → OTP / SMS settings and the SMS / OTP delivery log.
   Codes themselves are never stored, so they can't be shown here; mobile numbers are masked unless the
   admin's role has logs.pii (see lib/permissions.js). */
import express from "express";
import { pool } from "../../config/db.js";
import { ah, HttpError, bool, paging, maskPhone, normalizePhone, clientIp } from "../../lib/http.js";
import { audit, getSettings } from "../../lib/store.js";
import { requirePerm } from "../../middleware/auth.js";
import { can } from "../../lib/permissions.js";
import { OTP_LIMITS, otpSettings, startOtp } from "../../lib/otp.js";
import { smsProvider } from "../../lib/sms/providers.js";

const router = express.Router();

/* ---------- settings ---------- */
router.get("/communication/otp-settings", requirePerm("sms.settings"), ah(async (req, res) => {
  const s = await getSettings();
  const p = smsProvider();
  const [[last30]] = await pool.query(
    "SELECT COUNT(*) AS total, SUM(status IN ('sent','delivered')) AS sent, SUM(status = 'failed') AS failed FROM sms_logs WHERE created_at >= NOW() - INTERVAL 30 DAY");
  const [[ver]] = await pool.query(
    "SELECT COUNT(*) AS total, SUM(status IN ('verified','used')) AS verified FROM otp_verifications WHERE decoy = 0 AND created_at >= NOW() - INTERVAL 30 DAY");
  res.json({
    ...otpSettings(s), limits: OTP_LIMITS, log_retention_days: Number(s["sms.log_retention_days"] || 0),
    // which provider and whether its key is set: shown, never the key itself (it lives in .env)
    provider: { kind: p.kind, label: p.label, configured: p.configured,
      message: p.kind === "renflair" ? "Renflair sends its own DLT-approved text: \"<code> is your verification code for <app name>\". The app name is set in your Renflair account." : null },
    last30: { sms: Number(last30.total || 0), sent: Number(last30.sent || 0), failed: Number(last30.failed || 0),
      sessions: Number(ver.total || 0), verified: Number(ver.verified || 0) },
  });
}));

router.put("/communication/otp-settings", requirePerm("sms.settings"), ah(async (req, res) => {
  const b = req.body || {}, before = await getSettings(), changed = {};
  const put = async (key, value) => {
    await pool.query("INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [key, value]);
    if ((before[key] ?? "") !== value) changed[key] = [before[key] ?? "", value];
  };
  for (const [k, lim] of Object.entries(OTP_LIMITS)) {
    if (b[k] === undefined) continue;
    const n = Number(b[k]);
    if (!Number.isInteger(n) || n < lim.min || n > lim.max) throw new HttpError(400, `${k.replace(/_/g, " ")} must be a whole number from ${lim.min} to ${lim.max}`, { field: k });
    await put(`otp.${k}`, String(n));
  }
  if (b.enabled !== undefined) await put("otp.enabled", bool(b.enabled) ? "1" : "0");
  if (b.log_retention_days !== undefined) {
    const n = Number(b.log_retention_days);
    if (!Number.isInteger(n) || (n !== 0 && (n < 30 || n > 3650))) throw new HttpError(400, "Keep logs for 30 to 3650 days, or 0 to keep them forever", { field: "log_retention_days" });
    await put("sms.log_retention_days", String(n));
  }
  if (Object.keys(changed).length) await audit(req, "otp.settings", "settings", null, changed);
  res.json({ ok: true });
}));

// One real text to check the provider works (the admin receives a random code that unlocks nothing).
router.post("/communication/sms-test", requirePerm("provider.config"), ah(async (req, res) => {
  const p = normalizePhone(req.body?.mobile);
  if (!p) throw new HttpError(400, "Enter a valid 10-digit mobile number", { field: "mobile" });
  const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM sms_logs WHERE trigger_source = 'test' AND created_at > NOW() - INTERVAL 1 HOUR");
  if (n >= 5) throw new HttpError(429, "Only 5 test messages an hour. Please try again later.");
  const { row, sent } = await startOtp({ purpose: "password_reset", phone: p.e164, ip: clientIp(req), decoy: false });
  // a test session can never verify anything: no account is attached and it is closed straight away
  await pool.query("UPDATE otp_verifications SET status = 'cancelled' WHERE id = ?", [row.id]);
  await pool.query("UPDATE sms_logs SET trigger_source = 'test', triggered_by = ?, purpose = 'test' WHERE otp_id = ?", [req.admin.id, row.id]);
  const [[log]] = await pool.query("SELECT id, status, failure_reason, provider_response FROM sms_logs WHERE otp_id = ? ORDER BY id DESC LIMIT 1", [row.id]);
  await audit(req, "sms.test", "sms", log?.id, { to: maskPhone(p.e164), sent });
  res.json(log);
}));

/* ---------- log ---------- */
const VERIFY_STATUS = { pending: "Pending", verified: "Verified", used: "Verified", expired: "Expired", locked: "Rejected", cancelled: "Replaced" };

function logFilters(q) {
  const where = [], args = [];
  if (["queued", "sent", "delivered", "failed"].includes(q.status)) { where.push("l.status = ?"); args.push(q.status); }
  if (["registration", "password_reset", "test"].includes(q.purpose)) { where.push("l.purpose = ?"); args.push(q.purpose); }
  if (q.verification === "verified") where.push("o.status IN ('verified','used')");
  else if (q.verification === "rejected") where.push("o.status = 'locked'");
  else if (["pending", "expired", "cancelled"].includes(q.verification)) { where.push("o.status = ?"); args.push(q.verification); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.from || "")) { where.push("l.created_at >= ?"); args.push(q.from); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.to || "")) { where.push("l.created_at < DATE_ADD(?, INTERVAL 1 DAY)"); args.push(q.to); }
  if (q.customer) { where.push("l.customer_id = ?"); args.push(Number(q.customer)); }
  if (q.search) {
    const s = String(q.search).trim(), digits = s.replace(/\D/g, "");
    if (/^#?\d{1,9}$/.test(s)) { where.push("(l.id = ? OR l.phone LIKE ?)"); args.push(Number(digits), `%${digits}%`); }
    else if (digits.length >= 4) { where.push("l.phone LIKE ?"); args.push(`%${digits.slice(-10)}%`); }
    else { where.push("(c.name LIKE ? OR p.name LIKE ?)"); args.push(`%${s}%`, `%${s}%`); }
  }
  return { w: where.length ? "WHERE " + where.join(" AND ") : "", args };
}
const COLS = `l.id, l.otp_id, l.customer_id, l.pending_id, l.phone, l.purpose, l.provider, l.status, l.provider_message_id, l.provider_response,
  l.failure_reason, l.otp_expires_at, l.trigger_source, l.created_at, l.sent_at, l.delivered_at,
  o.status AS verification_status, o.attempts, o.total_attempts, o.resends, o.verified_at,
  COALESCE(c.name, p.name) AS person_name, a.name AS triggered_by_name`;
const JOIN = `FROM sms_logs l LEFT JOIN otp_verifications o ON o.id = l.otp_id LEFT JOIN customers c ON c.id = l.customer_id
  LEFT JOIN pending_registrations p ON p.id = l.pending_id LEFT JOIN admins a ON a.id = l.triggered_by`;

const shape = (req) => (r) => ({
  ...r, phone: can(req.admin, "logs.pii") ? r.phone : maskPhone(r.phone),
  verification: r.purpose === "test" ? "Test" : VERIFY_STATUS[r.verification_status] || "—",
});

router.get("/communication/sms-logs", requirePerm("logs.view"), ah(async (req, res) => {
  const { page, limit, offset } = paging(req.query, { defLimit: 25 });
  const { w, args } = logFilters(req.query);
  const [rows] = await pool.query(`SELECT ${COLS} ${JOIN} ${w} ORDER BY l.id DESC LIMIT ? OFFSET ?`, [...args, limit, offset]);
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${JOIN} ${w}`, args);
  const [counts] = await pool.query("SELECT status, COUNT(*) AS n FROM sms_logs GROUP BY status");
  res.json({ rows: rows.map(shape(req)), total, page, limit, statusCounts: Object.fromEntries(counts.map((c) => [c.status, c.n])),
    masked: !can(req.admin, "logs.pii") });
}));

router.get("/communication/sms-logs/export.csv", requirePerm("logs.export"), ah(async (req, res) => {
  const { w, args } = logFilters(req.query);
  const [rows] = await pool.query(`SELECT ${COLS} ${JOIN} ${w} ORDER BY l.id DESC LIMIT 10000`, args);
  const cols = ["id", "created_at", "sent_at", "phone", "person_name", "purpose", "status", "verification", "attempts", "resends", "otp_expires_at",
    "provider", "provider_message_id", "failure_reason"];
  const cell = (v) => { let s = v instanceof Date ? v.toISOString() : String(v ?? ""); if (/^[=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  const out = rows.map(shape(req));
  const csv = [cols.join(","), ...out.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
  await audit(req, "sms.export", "sms", null, { rows: rows.length, filters: req.query });
  res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="sms-otp-${new Date().toISOString().slice(0, 10)}.csv"` });
  res.send("﻿" + csv);
}));

router.get("/communication/sms-logs/:id", requirePerm("logs.view"), ah(async (req, res) => {
  const [[row]] = await pool.query(`SELECT ${COLS} ${JOIN} WHERE l.id = ?`, [req.params.id]);
  if (!row) throw new HttpError(404, "Log entry not found");
  // the other messages of the same verification (first code and resends)
  const [related] = row.otp_id ? await pool.query("SELECT id, status, created_at, failure_reason FROM sms_logs WHERE otp_id = ? ORDER BY id", [row.otp_id]) : [[]];
  res.json({ ...shape(req)(row), related });
}));

export default router;
