/* How email leaves the server, chosen in .env (secrets stay there, never in the database or admin panel):
     EMAIL_TRANSPORT=sendmail   the hosting server's own mail system (default in production; works on cPanel)
     EMAIL_TRANSPORT=smtp       SMTP_HOST, SMTP_PORT, SMTP_SECURE=1, SMTP_USER, SMTP_PASS
     EMAIL_TRANSPORT=log        nothing is sent; emails are only recorded in the log (default in development) */
import nodemailer from "nodemailer";

let transport = null;

export function getTransport() {
  if (transport) return transport;
  const kind = process.env.EMAIL_TRANSPORT || (process.env.NODE_ENV === "production" ? "sendmail" : "log");
  if (kind === "smtp") {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT) || 587, secure: process.env.SMTP_SECURE === "1",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      connectionTimeout: 20000, greetingTimeout: 20000, socketTimeout: 30000,
    });
  } else if (kind === "sendmail") {
    transport = nodemailer.createTransport({ sendmail: true, newline: "unix", path: process.env.SENDMAIL_PATH || "/usr/sbin/sendmail" });
  } else {
    transport = nodemailer.createTransport({ jsonTransport: true });
  }
  transport.kind = kind;
  return transport;
}

/** Error text that is safe to store and show: no passwords, limited length. */
export function safeError(err) {
  let s = String(err?.response || err?.message || err || "Unknown error");
  for (const secret of [process.env.SMTP_PASS, process.env.SMTP_USER].filter((x) => x && x.length > 3)) s = s.split(secret).join("***");
  return s.replace(/\s+/g, " ").slice(0, 500);
}
