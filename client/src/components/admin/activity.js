/* Plain-English descriptions of admin actions, for the dashboard and the activity log. */
export const ACTION = {
  login: "signed in", "login.failed": "had a failed sign-in", "login.locked": "was locked out", "product.create": "added a product",
  "product.update": "edited a product", "product.stock": "changed stock", "product.delete": "deleted a product", "product.archive": "archived a product",
  "category.create": "added a category", "category.update": "edited a category", "category.delete": "deleted a category",
  "order.update": "updated an order", "orders.export": "exported orders", "customer.disable": "suspended a customer", "customer.enable": "reactivated a customer",
  "customer.update": "updated a customer", "message.status": "updated a message", "message.delete": "deleted a message", "team.add": "added a team member",
  "team.update": "updated a team member", "settings.update": "changed settings", "profile.update": "updated their profile",
  "password.change": "changed their password", "logout.all": "signed out everywhere",
  "seo.settings": "changed SEO settings", "seo.page": "edited a page's SEO", "seo.product": "edited a product's SEO",
  "order.create": "new order placed", "email_template.update": "edited an email template", "email_template.enable": "turned on an email",
  "email_template.disable": "turned off an email", "email_template.reset": "restored an email template", "email.test": "sent a test email",
  "email.retry": "retried an email", "email.resend": "resent an email", "emails.export": "exported the email log", "email.settings": "changed email settings",
  "otp.settings": "changed OTP / SMS settings", "sms.test": "sent a test text message", "sms.export": "exported the SMS / OTP log",
};
export const describe = (a) => {
  const d = typeof a.details === "string" ? (() => { try { return JSON.parse(a.details); } catch { return {}; } })() : a.details || {};
  const what = d?.name || (a.entity === "order" ? `#${a.entity_id}` : a.entity === "email" && a.entity_id ? `email ${a.entity_id}` : "");
  return `${ACTION[a.action] || a.action}${what ? ` · ${what}` : ""}`;
};
