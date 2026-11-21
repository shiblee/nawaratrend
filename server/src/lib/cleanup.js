/* Housekeeping, every hour: abandoned sign-ups and unused codes expire, and old records are removed
   according to the retention settings (Communication → OTP / SMS, and Emails → Settings). */
import { pool } from "../config/db.js";
import { getSettings } from "./store.js";

export async function runCleanup() {
  const s = await getSettings();
  // a sign-up nobody finished: forget the password hash at once, the rest after 30 days
  await pool.query("UPDATE pending_registrations SET status = 'expired', password_hash = NULL WHERE status = 'pending' AND expires_at <= NOW()");
  await pool.query("UPDATE pending_registrations SET password_hash = NULL WHERE status <> 'pending' AND password_hash IS NOT NULL");
  await pool.query("UPDATE otp_verifications SET status = 'expired' WHERE status = 'pending' AND code_expires_at <= NOW() - INTERVAL 1 HOUR");
  await pool.query("UPDATE otp_verifications SET reset_token_hash = NULL WHERE reset_token_hash IS NOT NULL AND reset_expires_at <= NOW()");
  await pool.query("DELETE FROM pending_registrations WHERE status <> 'pending' AND created_at < NOW() - INTERVAL 30 DAY");
  await pool.query("DELETE FROM customer_sessions WHERE expires_at < NOW() - INTERVAL 90 DAY");

  const smsDays = Number(s["sms.log_retention_days"]) || 0;   // 0 = keep forever
  if (smsDays > 0) {
    await pool.query("DELETE FROM sms_logs WHERE created_at < NOW() - INTERVAL ? DAY", [smsDays]);
    await pool.query("DELETE FROM otp_verifications WHERE created_at < NOW() - INTERVAL ? DAY", [smsDays]);
  }
  const emailDays = Number(s["email.log_retention_days"]) || 0;
  if (emailDays > 0) await pool.query("DELETE FROM email_logs WHERE created_at < NOW() - INTERVAL ? DAY AND status NOT IN ('queued','sending')", [emailDays]);
}

export function startCleanup() {
  const run = () => runCleanup().catch((err) => console.error("cleanup:", err.message));
  setTimeout(run, 30 * 1000).unref();
  setInterval(run, 60 * 60 * 1000).unref();
}
