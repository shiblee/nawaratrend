/* Email templates: the built-in defaults, the placeholders each one may use, and a small, safe
   template engine. Admins edit the subject, HTML body and plain-text body in the admin panel
   (stored in the email_templates table); anything not edited uses the default below.

   Template language (deliberately tiny, nothing can run code):
     {{customer_name}}                  a placeholder; HTML-escaped in the HTML body
     {{#if tracking_number}} … {{/if}}  shown only when the placeholder has a value (no nesting)
   order_items is the one placeholder that inserts ready-made HTML (a table built by the server). */

export const COMMON_VARS = ["customer_name", "store_name", "support_email", "support_phone", "site_url", "account_url"];
export const ORDER_VARS = [
  "order_number", "order_date", "order_status", "order_total", "order_subtotal", "delivery_fee", "payment_method", "payment_status",
  "order_items", "shipping_address", "tracking_number", "courier_name", "tracking_url", "estimated_delivery_date",
  "status_message", "order_details_url",
];
export const VAR_HELP = {
  customer_name: "Customer's name", customer_email: "Customer's email", customer_phone: "Customer's mobile",
  store_name: "Store name (Settings)", support_email: "Support email (Email settings)", support_phone: "Store phone (Settings)",
  site_url: "Website address", account_url: "Link to My account", login_url: "Link to the sign-in page",
  reset_url: "One-time password reset link", reset_expires_minutes: "Minutes until the reset link expires",
  order_number: "Order number, e.g. NT2610123", order_date: "Date the order was placed", order_status: "Current order status",
  order_total: "Order total, e.g. ₹1,299", order_subtotal: "Items subtotal", delivery_fee: "Delivery charge (or Free)",
  payment_method: "UPI / Card / Cash on Delivery", payment_status: "Paid, Unpaid, Refunded…", order_items: "Table of the items ordered",
  shipping_address: "Delivery address", tracking_number: "Courier tracking number", courier_name: "Courier company",
  tracking_url: "Courier tracking link", estimated_delivery_date: "Expected delivery date",
  status_message: "The message your team wrote with this update", order_details_url: "Link to the order's tracking page",
};
export const RAW_HTML_VARS = ["order_items"];

/* ---------- default wording ---------- */
const BTN = "display:inline-block;background:#15203B;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px";
const NOTE = "background:#FFF6E0;border-left:4px solid #F4A300;padding:12px 14px;border-radius:8px;margin:16px 0";
const button = (url, label) => `<p style="margin:24px 0"><a href="{{${url}}}" style="${BTN}">${label}</a></p>`;
const teamNote = `{{#if status_message}}<p style="${NOTE}">{{status_message}}</p>{{/if}}`;
const tracking = `{{#if tracking_number}}<p><b>Courier:</b> {{courier_name}}<br><b>Tracking number:</b> {{tracking_number}}</p>{{/if}}
{{#if tracking_url}}<p><a href="{{tracking_url}}">Track your parcel on the courier's website</a></p>{{/if}}`;
const expected = `{{#if estimated_delivery_date}}<p><b>Expected delivery:</b> {{estimated_delivery_date}}</p>{{/if}}`;
const summary = `<p><b>Order #{{order_number}}</b> · placed {{order_date}}</p>{{order_items}}<p style="text-align:right">Delivery: {{delivery_fee}}<br><b>Total: {{order_total}}</b></p>`;

const orderEmail = (heading, intro, extra = "", label = "Track your order") =>
  `<h1>${heading}</h1>\n<p>Hi {{customer_name}},</p>\n<p>${intro}</p>\n${teamNote}\n${extra}\n${button("order_details_url", label)}\n${summary}`;

export const TEMPLATES = {
  welcome: {
    name: "Welcome (new account)", category: "account", vars: ["customer_email"],
    description: "Sent when someone creates an account with an email address.",
    subject: "Welcome to {{store_name}}, {{customer_name}}!",
    html: `<h1>Welcome, {{customer_name}}!</h1>
<p>Your {{store_name}} account has been created successfully.</p>
<p>From your account you can check out faster, see every order you've placed and follow each delivery step by step.</p>
${button("account_url", "Go to my account")}
<p>You signed up with <b>{{customer_email}}</b>. If this wasn't you, just reply to this email and we'll sort it out.</p>`,
  },
  password_reset: {
    name: "Password reset link", category: "account", essential: true, vars: ["reset_url", "reset_expires_minutes"],
    description: "Sent when a customer asks to reset a forgotten password. Can't be turned off.",
    subject: "Reset your {{store_name}} password",
    html: `<h1>Reset your password</h1>
<p>Hi {{customer_name}},</p>
<p>We received a request to reset the password for your {{store_name}} account. Click the button below to choose a new one.</p>
${button("reset_url", "Choose a new password")}
<p>This link works once and expires in {{reset_expires_minutes}} minutes. If you didn't ask for this, you can ignore this email: your password stays the same.</p>`,
  },
  password_changed: {
    name: "Password changed", category: "account", vars: ["login_url"],
    description: "Security notice sent after the password is changed or reset.",
    subject: "Your {{store_name}} password was changed",
    html: `<h1>Your password was changed</h1>
<p>Hi {{customer_name}},</p>
<p>The password for your {{store_name}} account was just changed, and you've been signed out on your other devices.</p>
<p>If this was you, there's nothing else to do. If it wasn't, please reset your password straight away and contact us.</p>
${button("login_url", "Sign in")}`,
  },
  order_placed: {
    name: "Order placed", category: "order", vars: [],
    description: "Sent to the customer as soon as an order is placed.",
    subject: "We've received your order #{{order_number}}",
    html: `<h1>Thank you for your order!</h1>
<p>Hi {{customer_name}},</p>
<p>We've received your order and we'll let you know as soon as it's confirmed.</p>
${button("order_details_url", "View your order")}
${summary}
<p><b>Payment:</b> {{payment_method}} ({{payment_status}})</p>
<p><b>Delivering to:</b><br>{{shipping_address}}</p>`,
  },
  order_confirmed: {
    name: "Order confirmed", category: "order", vars: [],
    description: "Sent when the team confirms the order.",
    subject: "Your order #{{order_number}} is confirmed",
    html: orderEmail("Your order is confirmed", "Good news: we've confirmed your order and are getting it ready to ship.", expected),
  },
  order_on_hold: {
    name: "Order on hold", category: "order", vars: [],
    description: "Sent when an order is put on hold.",
    subject: "Your order #{{order_number}} is on hold",
    html: orderEmail("Your order is on hold", "Your order is on hold for the moment. We'll be in touch if we need anything from you."),
  },
  order_packed: {
    name: "Order packed", category: "order", vars: [], disabledByDefault: true,
    description: "Sent when the order is packed (off by default, to avoid too many emails).",
    subject: "Your order #{{order_number}} is packed",
    html: orderEmail("Your order is packed", "Your order is packed and will be handed to the courier soon.", expected),
  },
  order_shipped: {
    name: "Order shipped", category: "order", vars: [],
    description: "Sent when the order is handed to the courier, with tracking details.",
    subject: "Your order #{{order_number}} is on its way",
    html: orderEmail("Your order has shipped", "Your order is on its way to you.", tracking + "\n" + expected),
  },
  order_out_for_delivery: {
    name: "Out for delivery", category: "order", vars: [],
    description: "Sent when the parcel is out for delivery.",
    subject: "Your order #{{order_number}} arrives today",
    html: orderEmail("Out for delivery today", "Your order is out for delivery. Please keep your phone handy so the courier can reach you.", tracking),
  },
  order_delivery_failed: {
    name: "Delivery attempt failed", category: "order", vars: [],
    description: "Sent when the courier couldn't deliver.",
    subject: "We couldn't deliver order #{{order_number}}",
    html: orderEmail("We missed you", "The courier tried to deliver your order but couldn't. They'll try again, or we'll contact you to arrange delivery.", tracking),
  },
  order_delivered: {
    name: "Order delivered", category: "order", vars: [],
    description: "Sent when the order is delivered.",
    subject: "Your order #{{order_number}} has been delivered",
    html: orderEmail("Delivered!", "Your order has been delivered. We hope you love it. If anything isn't right, reply to this email and we'll help.", "", "View your order"),
  },
  order_return_requested: {
    name: "Return requested", category: "order", vars: [],
    description: "Sent when a return is recorded for the order.",
    subject: "Return request for order #{{order_number}}",
    html: orderEmail("We've received your return request", "We've noted your return request and will arrange the pickup. We'll keep you updated.", "", "View your order"),
  },
  order_returned: {
    name: "Return received", category: "order", vars: [],
    description: "Sent when the returned items are received.",
    subject: "We've received your return for order #{{order_number}}",
    html: orderEmail("Return received", "We've received the items you returned. If you paid online, your refund will follow and we'll email you when it's on its way.", "", "View your order"),
  },
  order_cancelled: {
    name: "Order cancelled", category: "order", vars: [],
    description: "Sent when the order is cancelled.",
    subject: "Your order #{{order_number}} has been cancelled",
    html: orderEmail("Your order has been cancelled", "Your order has been cancelled. If you paid online, the refund will be processed and we'll email you about it.", "", "View your order"),
  },
  payment_received: {
    name: "Payment received", category: "order", vars: [],
    description: "Sent when an online (UPI or card) payment is marked as paid.",
    subject: "Payment received for order #{{order_number}}",
    html: orderEmail("Payment received", "Thank you: we've received your payment of {{order_total}}.", "", "View your order"),
  },
  refund_initiated: {
    name: "Refund initiated", category: "order", vars: [],
    description: "Sent when a refund is started.",
    subject: "Refund started for order #{{order_number}}",
    html: orderEmail("Your refund has started", "We've started the refund of {{order_total}} for your order. It usually reaches your account in 5–7 working days.", "", "View your order"),
  },
  refund_completed: {
    name: "Refund completed", category: "order", vars: [],
    description: "Sent when the refund is completed.",
    subject: "Refund completed for order #{{order_number}}",
    html: orderEmail("Your refund is complete", "We've refunded {{order_total}} for your order. Depending on your bank it can take a few days to show.", "", "View your order"),
  },
};
for (const t of Object.values(TEMPLATES)) {
  t.text = t.text || "";   // empty = made automatically from the HTML
  t.allowed = [...COMMON_VARS, ...(t.category === "order" ? ORDER_VARS : []), ...t.vars];
}

/* ---------- engine ---------- */
const IF_BLOCK = /\{\{#if\s+([a-z_]+)\s*\}\}([\s\S]*?)\{\{\/if\}\}/g;
const VAR = /\{\{\s*([a-z_]+)\s*\}\}/g;
const TAG = /\{\{([^{}]*)\}\}/g;

export const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// a value may be a string, or { html, text } when it needs a different form in each (order_items)
const plain = (v) => (v && typeof v === "object" ? v.text : v);
const filled = (v) => { const s = plain(v); return s !== undefined && s !== null && String(s).trim() !== ""; };

/** Fills in a template. mode: "html" (values escaped), "text" or "subject" (plain). */
export function fill(tpl, vars, mode) {
  const out = String(tpl || "").replace(IF_BLOCK, (_, name, inner) => (filled(vars[name]) ? inner : "")).replace(VAR, (_, name) => {
    const v = vars[name];
    if (v === undefined || v === null) return "";
    if (mode === "html") return typeof v === "object" ? v.html : RAW_HTML_VARS.includes(name) ? String(v) : escapeHtml(v);
    return String(plain(v));
  });
  return mode === "subject" ? out.replace(/\s+/g, " ").trim() : out;
}

/** Problems with an edited template: unknown placeholders and broken {{#if}} blocks. Empty list = fine. */
export function validate(key, { subject = "", html = "", text = "" }) {
  const t = TEMPLATES[key];
  const errors = [];
  for (const [part, src] of [["Subject", subject], ["HTML body", html], ["Plain-text body", text]]) {
    let depth = 0;
    for (const [, inner] of String(src).matchAll(TAG)) {
      const tag = inner.trim();
      const m = tag.match(/^#if\s+([a-z_]+)$/) || tag.match(/^([a-z_]+)$/);
      if (tag === "/if") { if (--depth < 0) { errors.push(`${part}: {{/if}} without a matching {{#if …}}`); depth = 0; } continue; }
      if (!m) { errors.push(`${part}: "{{${inner}}}" isn't a placeholder this email understands`); continue; }
      if (tag.startsWith("#if")) { if (++depth > 1) errors.push(`${part}: {{#if}} blocks can't be put inside each other`); }
      if (!t.allowed.includes(m[1])) errors.push(`${part}: {{${m[1]}}} isn't available in this email`);
    }
    if (depth > 0) errors.push(`${part}: an {{#if …}} block is missing its {{/if}}`);
  }
  if (!String(subject).trim()) errors.push("Subject can't be empty");
  if (!String(html).trim()) errors.push("HTML body can't be empty");
  return [...new Set(errors)];
}

/** Plain-text version of an HTML email body, for mail apps that don't show HTML. */
export function htmlToText(html) {
  return String(html)
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => `${label.replace(/<[^>]+>/g, "").trim()}: ${href}`)
    .replace(/<(br|\/p|\/h[1-6]|\/tr|\/li|\/div|\/table)\s*\/?>/gi, "\n")
    .replace(/<\/t[dh]>/gi, "  ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** The branded frame around every email (header, footer with store contacts). Not editable, so every email stays consistent. */
export function layout(bodyHtml, ctx) {
  const e = escapeHtml;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(ctx.subject)}</title>
<style>h1{font-size:22px;line-height:1.3;margin:0 0 16px;color:#15203B}p{margin:0 0 12px}a{color:#15203B}</style></head>
<body style="margin:0;padding:0;background:#F4F1EA;font-family:Arial,Helvetica,sans-serif;color:#1F2937;font-size:15px;line-height:1.6">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F4F1EA;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#15203B;padding:20px 28px"><a href="${e(ctx.site_url)}" style="color:#F4A300;font-size:22px;font-weight:800;text-decoration:none;letter-spacing:.3px">${e(ctx.store_name)}</a></td></tr>
<tr><td style="padding:28px">${bodyHtml}</td></tr>
<tr><td style="background:#FAF8F3;padding:18px 28px;font-size:12px;color:#6B7280;line-height:1.6">
Questions? Reply to this email${ctx.support_phone ? ` or call ${e(ctx.support_phone)}` : ""}.<br>
${e(ctx.store_name)}${ctx.address ? ` · ${e(ctx.address)}` : ""}<br>
<a href="${e(ctx.site_url)}" style="color:#6B7280">${e(String(ctx.site_url).replace(/^https?:\/\//, ""))}</a>
</td></tr></table></td></tr></table></body></html>`;
}

/** The items table that {{order_items}} inserts. */
export function itemsTable(items, money) {
  const e = escapeHtml;
  const rows = items.map((i) => `<tr><td style="padding:8px 0;border-bottom:1px solid #EEE">${e(i.product_name)}${i.size ? ` <span style="color:#6B7280">(Size ${e(i.size)})</span>` : ""}<br><span style="color:#6B7280;font-size:13px">Qty ${i.qty}</span></td><td style="padding:8px 0;border-bottom:1px solid #EEE;text-align:right;white-space:nowrap">${money(i.line_total)}</td></tr>`).join("");
  return {
    html: `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;margin:8px 0 16px">${rows}</table>`,
    text: items.map((i) => `- ${i.qty} x ${i.product_name}${i.size ? ` (Size ${i.size})` : ""}: ${money(i.line_total)}`).join("\n"),
  };
}

// The built-in templates must pass the same checks as an admin's edits.
for (const [key, t] of Object.entries(TEMPLATES)) {
  const errors = validate(key, t);
  if (errors.length) throw new Error(`Built-in email template "${key}" is invalid: ${errors.join("; ")}`);
}
