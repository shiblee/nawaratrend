/* The one place that sends email. Callers queue an email and carry on; a background worker sends it,
   retries failures (after 2, 10 and 30 minutes) and records every attempt in email_logs / email_attempts.
   An email problem never undoes or fails the action that triggered it (an order, a sign-up…).
   Duplicates are prevented with a dedupe key, e.g. one "order shipped" email per status change. */
import { pool } from "../../config/db.js";
import { getSettings } from "../store.js";
import { STATUS, PAYMENT_STATUS, PAY_METHOD } from "../orders.js";
import { TEMPLATES, fill, layout, htmlToText, itemsTable } from "./templates.js";
import { getTransport, safeError } from "./transport.js";

const RETRY_MINUTES = [2, 10, 30];
const MAX_ATTEMPTS = RETRY_MINUTES.length + 1;
export const EMAIL_STATUS = ["queued", "sending", "sent", "delivered", "failed", "bounced", "skipped"];

const money = (v) => "₹" + Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const longDate = (v) => new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

export const siteUrl = (s) => String(process.env.SITE_URL || s?.["seo.site_url"] || "http://localhost:3000").replace(/\/+$/, "");

/** Email settings (admin panel → Emails → Settings). Secrets are never here: see transport.js. */
export function emailSettings(s) {
  const site = siteUrl(s);
  const domain = site.replace(/^https?:\/\//, "").replace(/[:/].*$/, "").replace(/^www\./, "");
  return {
    enabled: s["email.enabled"] !== "0",
    from_name: s["email.from_name"] || s.store_name || "NawaraTrend",
    from_address: s["email.from_address"] || `info@${domain}`,
    reply_to: s["email.reply_to"] || "",
    company_name: s["email.company_name"] || "Nawara Trend",
    support_email: s["email.support_email"] || s["email.reply_to"] || s["email.from_address"] || `info@${domain}`,
  };
}

/** A template as it is now: the admin's edited version if there is one, otherwise the default. */
export async function getTemplate(key, conn = pool) {
  const def = TEMPLATES[key];
  if (!def) throw new Error(`Unknown email template: ${key}`);
  const [rows] = await conn.query(
    "SELECT t.*, a.name AS updated_by_name FROM email_templates t LEFT JOIN admins a ON a.id = t.updated_by WHERE t.`key` = ?", [key]);
  const r = rows[0];
  return {
    key, name: def.name, category: def.category, description: def.description, essential: !!def.essential, allowed: def.allowed,
    subject: r?.subject ?? def.subject, html: r?.html ?? def.html, text: r?.text ?? def.text,
    enabled: def.essential ? true : r ? !!r.enabled : !def.disabledByDefault,
    customised: !!r && (r.subject !== def.subject || r.html !== def.html || (r.text || "") !== def.text),
    version: r?.version || 0, updated_at: r?.updated_at || null, updated_by_name: r?.updated_by_name || null,
  };
}

/** Placeholders every email can use. */
export function baseVars(s) {
  const site = siteUrl(s), es = emailSettings(s);
  return {
    store_name: s.store_name || "NawaraTrend", company_name: s["email.company_name"] || "Nawara Trend",
    support_email: es.support_email, support_phone: s.phone || "",
    site_url: site, website_url: site, account_url: `${site}/account`, login_url: `${site}/login`, address: s.address || "",
  };
}

/** Placeholders about the customer themselves, for account emails. */
export function customerVars(c) {
  const d = String(c.phone || "").replace(/\D/g, "").slice(-10);
  return {
    customer_name: (c.name || "").split(" ")[0] || "there",
    customer_email: c.email || "", email: c.email || "", customer_phone: d,
    mobile_number: d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : "",
    registration_date: c.created_at ? longDate(c.created_at) : longDate(new Date()),
  };
}

/** Placeholders for an order email, read fresh from the database. */
export async function orderVars(orderId, conn = pool) {
  const [[o]] = await conn.query("SELECT * FROM orders WHERE id = ?", [orderId]);
  if (!o) return null;
  const [items] = await conn.query("SELECT product_name, size, qty, line_total FROM order_items WHERE order_id = ? ORDER BY id", [orderId]);
  const [cust] = o.customer_id ? await conn.query("SELECT name, email FROM customers WHERE id = ?", [o.customer_id]) : [[]];
  const site = siteUrl(await getSettings(conn));
  const c = cust[0];
  return {
    order: o,
    to: o.ship_email || c?.email || null,
    customerId: o.customer_id,
    vars: {
      customer_name: (c?.name || o.ship_name || "").split(" ")[0] || "there",
      order_number: o.order_number, order_date: longDate(o.created_at), order_status: STATUS[o.status] || o.status,
      order_total: money(o.total), order_subtotal: money(o.subtotal), delivery_fee: Number(o.delivery_fee) ? money(o.delivery_fee) : "Free",
      payment_method: PAY_METHOD[o.payment_method] || o.payment_method, payment_status: PAYMENT_STATUS[o.payment_status] || o.payment_status,
      order_items: itemsTable(items, money),
      shipping_address: [o.ship_name, o.ship_line1, o.ship_line2, `${o.ship_city}, ${o.ship_state} ${o.ship_pin}`, o.ship_phone].filter(Boolean).join(", "),
      tracking_number: o.tracking_number || "", courier_name: o.courier || "Courier", tracking_url: o.tracking_url || "",
      estimated_delivery_date: o.expected_delivery ? longDate(o.expected_delivery) : "",
      order_details_url: o.customer_id ? `${site}/account/orders/${o.order_number}` : `${site}/track?order=${o.order_number}`,
    },
  };
}

/** Builds the finished email (subject, full HTML with the branded frame, plain text). */
export async function render(key, vars, { template, conn = pool } = {}) {
  const s = await getSettings(conn);
  const t = template || (await getTemplate(key, conn));
  const all = { ...baseVars(s), ...vars };
  const subject = fill(t.subject, all, "subject").slice(0, 255);
  const body = fill(t.html, all, "html");
  const text = t.text?.trim() ? fill(t.text, all, "text") : htmlToText(body);
  return { subject, html: layout(body, { ...all, subject }), text, version: t.version, enabled: t.enabled, settings: s };
}

/**
 * Queues an email. Returns the log id, or null if there was nobody to send to or it was a duplicate.
 * opts: { key, to, vars, customerId, orderId, orderNumber, trigger, adminId, dedupeKey, force }
 *   trigger: registration | order | admin | system | test | retry | customer
 *   force:   send even if the template is turned off (test emails)
 */
export async function queueEmail(opts) {
  try {
    const to = String(opts.to || "").trim().toLowerCase();
    if (!to) return null;
    const def = TEMPLATES[opts.key];
    const r = await render(opts.key, opts.vars || {});
    const es = emailSettings(r.settings);
    // a template the team turned off simply isn't sent (and isn't logged); with all email turned off,
    // the email is logged as "skipped" so the team can see what customers didn't receive
    if (!r.enabled && !opts.force) return null;
    let status = "queued", why = null;
    if (!es.enabled && !opts.force) { status = "skipped"; why = "Email sending is turned off in Emails → Settings"; }
    const [ins] = await pool.query(
      `INSERT INTO email_logs (template_key, template_version, category, recipient, customer_id, order_id, order_number, subject, html, text,
         status, last_error, trigger_source, triggered_by, dedupe_key, max_attempts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [opts.key, r.version, opts.trigger === "test" ? "test" : def.category, to, opts.customerId || null, opts.orderId || null, opts.orderNumber || null,
       r.subject, r.html, r.text, status, why, opts.trigger || "system", opts.adminId || null, opts.dedupeKey || null, MAX_ATTEMPTS]);
    if (status === "queued") setImmediate(processQueue);
    return ins.insertId;
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return null;   // this exact email was already queued
    console.error("queueEmail failed:", err.message);
    return null;
  }
}

/** Queues the email for an order event (status change, payment change, new order). Never throws. */
export async function queueOrderEmail(orderId, key, { trigger = "admin", adminId = null, dedupeKey, statusMessage = "" } = {}) {
  try {
    const ov = await orderVars(orderId);
    if (!ov || !ov.to) return null;
    return await queueEmail({ key, to: ov.to, vars: { ...ov.vars, status_message: statusMessage || "" }, customerId: ov.customerId,
      orderId, orderNumber: ov.order.order_number, trigger, adminId, dedupeKey: dedupeKey || `${key}:${orderId}` });
  } catch (err) {
    console.error("queueOrderEmail failed:", err.message);
    return null;
  }
}

/* ---------- the worker ---------- */
let running = false, again = false;

export async function processQueue() {
  if (running) { again = true; return; }
  running = true;
  try {
    do {
      again = false;
      const [due] = await pool.query(
        `SELECT id FROM email_logs WHERE status = 'queued' OR (status = 'failed' AND next_attempt_at IS NOT NULL AND next_attempt_at <= NOW())
         ORDER BY id LIMIT 20`);
      for (const { id } of due) await sendOne(id);
      if (due.length === 20) again = true;
    } while (again);
  } catch (err) {
    console.error("email worker:", err.message);
  } finally {
    running = false;
  }
}

async function sendOne(id) {
  // claim it, so two workers can never send the same email
  const [claim] = await pool.query(
    "UPDATE email_logs SET status = 'sending', attempts = attempts + 1 WHERE id = ? AND status IN ('queued','failed')", [id]);
  if (!claim.affectedRows) return;
  const [[e]] = await pool.query("SELECT * FROM email_logs WHERE id = ?", [id]);
  const es = emailSettings(await getSettings());
  const transport = getTransport();
  try {
    const info = await transport.sendMail({
      from: { name: es.from_name, address: es.from_address }, to: e.recipient, replyTo: es.reply_to || undefined,
      subject: e.subject, html: e.html, text: e.text, headers: { "X-NawaraTrend-Email-Id": String(e.id) },
    });
    const response = transport.kind === "log" ? "Not sent: development mode (EMAIL_TRANSPORT=log)" : String(info.response || "Accepted by the mail server").slice(0, 500);
    await pool.query(
      "UPDATE email_logs SET status = 'sent', sent_at = NOW(), provider_message_id = ?, provider_response = ?, last_error = NULL, next_attempt_at = NULL WHERE id = ?",
      [String(info.messageId || "").slice(0, 255) || null, response, id]);
    await pool.query("INSERT INTO email_attempts (email_id, attempt, status, response) VALUES (?, ?, 'sent', ?)", [id, e.attempts, response]);
    await redactSecrets(e);
  } catch (err) {
    const msg = safeError(err);
    const wait = e.attempts < e.max_attempts ? RETRY_MINUTES[Math.min(e.attempts - 1, RETRY_MINUTES.length - 1)] : null;
    await pool.query(
      `UPDATE email_logs SET status = 'failed', last_error = ?, next_attempt_at = ${wait ? "NOW() + INTERVAL ? MINUTE" : "NULL"} WHERE id = ?`,
      wait ? [msg, wait, id] : [msg, id]);
    await pool.query("INSERT INTO email_attempts (email_id, attempt, status, response) VALUES (?, ?, 'failed', ?)", [id, e.attempts, msg]);
    if (!wait) await redactSecrets(e);
    console.error(`email #${id} to ${e.recipient} failed (attempt ${e.attempts}):`, msg);
  }
}

/* A password reset link is a key to the customer's account. Once the email has gone (or won't be retried),
   the log keeps the email but not the working link, so nobody reading the log can use it. */
const SECRET_LINK = /token=[a-f0-9]{64}/;
async function redactSecrets(e) {
  if (!SECRET_LINK.test(e.html + e.text)) return;
  const hide = (s) => String(s || "").replace(new RegExp(SECRET_LINK.source, "g"), "token=[removed-after-sending]");
  await pool.query("UPDATE email_logs SET html = ?, text = ? WHERE id = ?", [hide(e.html), hide(e.text), e.id]);
}

/** Starts the background sender: checks for due emails every minute. */
export function startEmailWorker() {
  // an email stuck in "sending" (server restarted mid-send) may or may not have gone out: don't resend it automatically
  pool.query(`UPDATE email_logs SET status = 'failed', next_attempt_at = NULL,
                last_error = 'The server restarted while sending; it may or may not have been delivered. Use Retry to send it again.'
              WHERE status = 'sending' AND updated_at < NOW() - INTERVAL 10 MINUTE`).catch(() => {});
  setTimeout(processQueue, 5000).unref();
  setInterval(processQueue, 60 * 1000).unref();
}
