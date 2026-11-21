/* Mobile OTP verification: one "verification session" per sign-up or password reset.

   - Codes come from crypto.randomInt and only an HMAC of (session, code) is stored; the code itself is never
     written to the database, the logs, or any API reply.
   - A resend replaces the code, so the previous one stops working immediately.
   - Each code allows otp.max_attempts wrong guesses; then the session locks and a new one is needed.
     Resends are limited (otp.max_resends) and spaced out (otp.resend_seconds).
   - Sends are also capped per mobile number and per IP address per hour.
   - Verification runs inside the caller's transaction with the session row locked (SELECT … FOR UPDATE),
     so two simultaneous submissions can't both succeed. */
import crypto from "crypto";
import { pool } from "../config/db.js";
import { HttpError } from "./http.js";
import { getSettings } from "./store.js";
import { smsProvider, scrub } from "./sms/providers.js";

/* Limits the admin can change, each kept inside a safe range. */
export const OTP_LIMITS = {
  length: { min: 4, max: 8, def: 6 },
  expiry_minutes: { min: 2, max: 15, def: 5 },
  resend_seconds: { min: 30, max: 300, def: 60 },
  max_attempts: { min: 3, max: 10, def: 5 },
  max_resends: { min: 1, max: 5, def: 3 },
  phone_hourly_limit: { min: 3, max: 20, def: 5 },
  ip_hourly_limit: { min: 5, max: 100, def: 20 },
  pending_hours: { min: 1, max: 72, def: 24 },
};

const clamp = (v, { min, max, def }) => { const n = Number(v); return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : def; };

export function otpSettings(s) {
  const out = { enabled: s["otp.enabled"] !== "0" };
  for (const [k, lim] of Object.entries(OTP_LIMITS)) out[k] = clamp(s[`otp.${k}`], lim);
  return out;
}

const secret = () => process.env.OTP_SECRET || process.env.JWT_SECRET;
const hashCode = (publicId, code) => crypto.createHmac("sha256", secret()).update(`otp:${publicId}:${code}`).digest("hex");
export const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const newCode = (len) => String(crypto.randomInt(0, 10 ** len)).padStart(len, "0");
const sameHash = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** What the browser is told about a session (never the code). */
export function sessionInfo(row, cfg) {
  const sentAt = row.last_sent_at ? new Date(row.last_sent_at).getTime() : 0;
  const waitMs = row.last_send_ok ? Math.max(0, sentAt + cfg.resend_seconds * 1000 - Date.now()) : 0;
  return {
    session: row.public_id,
    mobile: maskForCustomer(row.phone),
    length: cfg.length,
    expiresIn: Math.max(0, Math.round((new Date(row.code_expires_at).getTime() - Date.now()) / 1000)),
    resendIn: Math.ceil(waitMs / 1000),
    resendsLeft: Math.max(0, cfg.max_resends - row.resends),
    attemptsLeft: Math.max(0, cfg.max_attempts - row.attempts),
  };
}
// the customer typed this number themselves, so most of it can be shown: +91 98765 XXX10
const maskForCustomer = (p) => { const d = String(p).slice(-10); return `+91 ${d.slice(0, 5)} XXX${d.slice(8)}`; };

async function checkSendLimits(phone, ip, cfg, conn = pool) {
  // counted from the sessions (not the SMS log) so a number with no account hits the limit exactly like one with an account
  const [[{ byPhone }]] = await conn.query(
    "SELECT COUNT(*) + COALESCE(SUM(resends), 0) AS byPhone FROM otp_verifications WHERE phone = ? AND created_at > NOW() - INTERVAL 1 HOUR", [phone]);
  if (byPhone >= cfg.phone_hourly_limit) throw new HttpError(429, "Too many codes were sent to this number. Please try again in an hour.", { code: "otp_rate_limited" });
  if (ip) {
    const [[{ byIp }]] = await conn.query(
      "SELECT COUNT(*) AS byIp FROM otp_verifications WHERE ip = ? AND created_at > NOW() - INTERVAL 1 HOUR", [ip]);
    if (byIp >= cfg.ip_hourly_limit) throw new HttpError(429, "Too many verification requests from this connection. Please try again later.", { code: "otp_rate_limited" });
  }
}

/** Sends the code by SMS and records it in sms_logs. Returns true if the provider accepted it. */
async function deliver(row, code, { trigger = "customer", adminId = null } = {}) {
  const provider = smsProvider();
  const [log] = await pool.query(
    `INSERT INTO sms_logs (otp_id, customer_id, pending_id, phone, purpose, provider, status, otp_expires_at, trigger_source, triggered_by, ip)
     VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?)`,
    [row.id, row.customer_id, row.pending_id, row.phone, row.purpose, provider.kind, row.code_expires_at, trigger, adminId, row.ip]);
  const national = String(row.phone).replace(/^\+91/, "");
  let r;
  try { r = await provider.send({ e164: row.phone, national, code }); }
  catch (err) { r = { ok: false, error: scrub(err.message) }; }
  await pool.query(
    `UPDATE sms_logs SET status = ?, provider_message_id = ?, provider_response = ?, failure_reason = ?, sent_at = ${r.ok ? "NOW()" : "NULL"} WHERE id = ?`,
    [r.ok ? "sent" : "failed", r.messageId || null, scrub(r.response) || null, r.ok ? null : scrub(r.error) || "Not sent", log.insertId]);
  await pool.query("UPDATE otp_verifications SET last_sent_at = NOW(), last_send_ok = ? WHERE id = ?", [r.ok ? 1 : 0, row.id]);
  if (!r.ok) console.error(`SMS #${log.insertId} to ${row.phone.slice(0, 5)}… failed:`, scrub(r.error));
  return r.ok;
}

/**
 * Starts a verification session and texts the first code.
 * decoy: a password-reset request for a number with no account. It behaves the same from the outside
 *        (same reply, same timings) but nothing is sent and no code can ever match.
 * Returns { row, sent, cfg }.
 */
export async function startOtp({ purpose, phone, customerId = null, pendingId = null, ip = null, decoy = false }) {
  const cfg = otpSettings(await getSettings());
  if (!cfg.enabled) throw new HttpError(503, "Mobile verification is unavailable right now. Please try again later.", { code: "otp_disabled" });
  await checkSendLimits(phone, ip, cfg);
  const publicId = crypto.randomBytes(16).toString("hex");
  const code = newCode(cfg.length);
  // a newer request for the same number and purpose replaces any older one
  await pool.query("UPDATE otp_verifications SET status = 'cancelled' WHERE phone = ? AND purpose = ? AND status = 'pending'", [phone, purpose]);
  const [ins] = await pool.query(
    `INSERT INTO otp_verifications (public_id, purpose, phone, customer_id, pending_id, code_hash, code_expires_at, decoy, ip, last_sent_at, last_send_ok)
     VALUES (?, ?, ?, ?, ?, ?, NOW() + INTERVAL ? MINUTE, ?, ?, NOW(), 1)`,
    [publicId, purpose, phone, customerId, pendingId, decoy ? sha256(crypto.randomBytes(32)) : hashCode(publicId, code), cfg.expiry_minutes, decoy ? 1 : 0, ip]);
  const [[row]] = await pool.query("SELECT * FROM otp_verifications WHERE id = ?", [ins.insertId]);
  const sent = decoy ? true : await deliver(row, code);
  const [[fresh]] = await pool.query("SELECT * FROM otp_verifications WHERE id = ?", [row.id]);
  return { row: fresh, sent, cfg };
}

/** Sends a new code for an open session (the old one stops working). */
export async function resendOtp(publicId, { purpose, ip = null }) {
  const cfg = otpSettings(await getSettings());
  if (!cfg.enabled) throw new HttpError(503, "Mobile verification is unavailable right now. Please try again later.", { code: "otp_disabled" });
  const [[row]] = await pool.query("SELECT * FROM otp_verifications WHERE public_id = ? AND purpose = ?", [String(publicId || ""), purpose]);
  if (!row || row.status !== "pending") throw new HttpError(410, "This verification has ended. Please start again.", { code: "otp_session_closed" });
  if (row.resends >= cfg.max_resends) throw new HttpError(429, "You've reached the limit for new codes. Please start again in a little while.", { code: "otp_resend_limit" });
  const waitMs = row.last_send_ok ? new Date(row.last_sent_at).getTime() + cfg.resend_seconds * 1000 - Date.now() : 0;
  if (waitMs > 1000) throw new HttpError(429, `Please wait ${Math.ceil(waitMs / 1000)} seconds before asking for a new code.`, { code: "otp_cooldown", resendIn: Math.ceil(waitMs / 1000) });
  if (!row.decoy) await checkSendLimits(row.phone, ip, cfg);
  const code = newCode(cfg.length);
  // conditional on the old resend count, so two resend clicks at once only send one code
  const [upd] = await pool.query(
    `UPDATE otp_verifications SET code_hash = ?, code_expires_at = NOW() + INTERVAL ? MINUTE, attempts = 0, resends = resends + 1, last_sent_at = NOW(), last_send_ok = 1
     WHERE id = ? AND resends = ? AND status = 'pending'`,
    [row.decoy ? sha256(crypto.randomBytes(32)) : hashCode(row.public_id, code), cfg.expiry_minutes, row.id, row.resends]);
  if (!upd.affectedRows) throw new HttpError(429, "A new code is already on its way.", { code: "otp_cooldown" });
  const [[fresh]] = await pool.query("SELECT * FROM otp_verifications WHERE id = ?", [row.id]);
  const sent = row.decoy ? true : await deliver(fresh, code);
  const [[after]] = await pool.query("SELECT * FROM otp_verifications WHERE id = ?", [row.id]);
  return { row: after, sent, cfg };
}

/**
 * Checks a code inside the caller's transaction. On success the session is marked verified and returned.
 * Wrong, expired or locked → throws (after recording the attempt, which the caller must commit).
 * Use with: conn.beginTransaction(); verifyOtp(conn, …); …; conn.commit().
 */
export async function verifyOtp(conn, publicId, code, { purpose }) {
  const cfg = otpSettings(await getSettings(conn));
  const c = String(code ?? "").replace(/\s/g, "");
  if (!/^\d{4,8}$/.test(c)) throw new HttpError(400, `Enter the ${cfg.length}-digit code we sent you.`, { field: "otp", code: "otp_format" });
  const [[row]] = await conn.query("SELECT * FROM otp_verifications WHERE public_id = ? AND purpose = ? FOR UPDATE", [String(publicId || ""), purpose]);
  if (!row || ["cancelled", "used", "verified"].includes(row.status)) throw new HttpError(410, "This verification has ended. Please start again.", { code: "otp_session_closed" });
  if (row.status === "locked") throw new HttpError(429, "Too many wrong codes. Please start again to get a new code.", { code: "otp_locked" });
  if (new Date(row.code_expires_at) <= new Date()) {
    throw new HttpError(400, "This code has expired. Tap \"Resend code\" to get a new one.", { field: "otp", code: "otp_expired", canResend: row.resends < cfg.max_resends });
  }
  const ok = !row.decoy && sameHash(row.code_hash, hashCode(row.public_id, c));
  if (!ok) {
    const attempts = row.attempts + 1, locked = attempts >= cfg.max_attempts;
    await conn.query("UPDATE otp_verifications SET attempts = ?, total_attempts = total_attempts + 1, status = ? WHERE id = ?",
      [attempts, locked ? "locked" : "pending", row.id]);
    throw locked
      ? new HttpError(429, "Too many wrong codes. Please start again to get a new code.", { code: "otp_locked", commit: true })
      : new HttpError(400, `That code isn't right. ${cfg.max_attempts - attempts} ${cfg.max_attempts - attempts === 1 ? "try" : "tries"} left.`,
        { field: "otp", code: "otp_wrong", attemptsLeft: cfg.max_attempts - attempts, commit: true });
  }
  await conn.query("UPDATE otp_verifications SET status = 'verified', verified_at = NOW(), total_attempts = total_attempts + 1 WHERE id = ?", [row.id]);
  return { ...row, status: "verified" };
}

/** Runs fn(conn) in a transaction. A thrown HttpError marked `commit` still saves the work (e.g. a wrong-code count). */
export async function inTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (err) {
    if (err instanceof HttpError && err.details?.commit) { await conn.commit(); delete err.details.commit; }
    else await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}
