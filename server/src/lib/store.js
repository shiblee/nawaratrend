/* Store settings and the admin activity log. */
import { pool } from "../config/db.js";
import { clientIp } from "./http.js";

/** Every setting as { key: value }, with numbers ready to use for free_shipping_threshold / delivery_fee. */
export async function getSettings(conn = pool) {
  const [rows] = await conn.query("SELECT `key`, value FROM settings");
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  s.free_shipping_threshold = Number(s.free_shipping_threshold ?? 999);
  s.delivery_fee = Number(s.delivery_fee ?? 49);
  s.cod_enabled = s.cod_enabled !== "0";
  s.whatsapp_enabled = s.whatsapp_enabled !== "0";
  return s;
}

/** Records what an admin did. Never throws: a logging problem must not break the action itself. */
export async function audit(req, action, entity = null, entityId = null, details = null) {
  try {
    await pool.query(
      "INSERT INTO audit_logs (admin_id, action, entity, entity_id, details, ip) VALUES (?, ?, ?, ?, ?, ?)",
      [req.admin?.id ?? null, action, entity, entityId == null ? null : String(entityId), details ? JSON.stringify(details) : null, clientIp(req)]
    );
  } catch (err) {
    console.error("audit log failed:", err.message);
  }
}
