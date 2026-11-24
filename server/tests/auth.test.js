/* Sign-up, OTP, sign-in, password reset, emails and admin access. Run: npm test (needs the local MySQL). */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { pool, takeTestCode, close, browser, mobile, registered, adminToken, admin, wait } from "./helpers.js";

after(close);

const form = (phone, extra = {}) => ({ name: "Asha Verma", mobile: phone, password: "Secret123", confirmPassword: "Secret123", acceptTerms: true, ...extra });
const e164 = (p) => `+91${p}`;

test("registration with a valid mobile sends an OTP and creates no account yet", async () => {
  const b = browser(); await b.csrf();
  const phone = mobile();
  const r = await b.post("/store/auth/register", form(phone));
  assert.equal(r.status, 201);
  assert.equal(r.data.sent, true);
  assert.equal(r.data.length, 6);
  const code = takeTestCode();
  assert.match(code, /^\d{6}$/);
  assert.ok(!r.text.includes(code), "the code must never appear in a reply");
  const [c] = await pool.query("SELECT id FROM customers WHERE phone = ?", [e164(phone)]);
  assert.equal(c.length, 0, "no account before verification");
  const [[o]] = await pool.query("SELECT code_hash FROM otp_verifications WHERE public_id = ?", [r.data.session]);
  assert.notEqual(o.code_hash, code);
  const [[log]] = await pool.query("SELECT * FROM sms_logs WHERE phone = ? ORDER BY id DESC LIMIT 1", [e164(phone)]);
  assert.equal(log.status, "sent");
  assert.ok(!JSON.stringify(log).includes(code), "the code must never be logged");
});

test("registration without email succeeds after OTP and sends no email", async () => {
  const { b, phone, customer } = await registered();
  assert.equal(customer.phone, phone);
  assert.equal(customer.phoneVerified, true);
  const me = await b.get("/store/auth/me");
  assert.equal(me.status, 200);
  assert.equal(me.data.customer.id, customer.id);
  const [emails] = await pool.query("SELECT id FROM email_logs WHERE customer_id = ?", [customer.id]);
  assert.equal(emails.length, 0);
  const [[p]] = await pool.query("SELECT status, password_hash FROM pending_registrations WHERE customer_id = ?", [customer.id]);
  assert.equal(p.status, "completed");
  assert.equal(p.password_hash, null, "pending password hash is wiped after activation");
});

test("registration with email queues the confirmation; an email failure doesn't block the account", async () => {
  const { customer } = await registered({ email: `asha${Date.now()}@example.com` });
  const [[e]] = await pool.query("SELECT * FROM email_logs WHERE customer_id = ? AND template_key = 'registration_confirmation'", [customer.id]);
  assert.ok(e, "confirmation email logged");
  assert.match(e.subject, /Your Account Has Been Created Successfully/);
  assert.match(e.html, /Registered Mobile:<\/b> \+91 \d{5} \d{5}/);
  await wait(1500);   // the worker tries to send (the test mail server is unreachable)
  const [[after]] = await pool.query("SELECT status, last_error FROM email_logs WHERE id = ?", [e.id]);
  assert.equal(after.status, "failed");
  assert.ok(after.last_error);
  const [[c]] = await pool.query("SELECT is_active, phone_verified_at FROM customers WHERE id = ?", [customer.id]);
  assert.equal(c.is_active, 1);
  assert.ok(c.phone_verified_at);
});

test("duplicate mobile number is refused and the existing account is untouched", async () => {
  const { phone, customer } = await registered();
  const b = browser(); await b.csrf();
  const r = await b.post("/store/auth/register", form(phone, { name: "Someone Else" }));
  assert.equal(r.status, 409);
  assert.equal(r.data.code, "mobile_taken");
  const [[c]] = await pool.query("SELECT name FROM customers WHERE id = ?", [customer.id]);
  assert.equal(c.name, "Test Customer");
});

test("the same mobile number written differently is still refused", async () => {
  const { phone } = await registered();
  for (const typed of [`+91${phone}`, `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`, `0${phone}`, `91${phone}`]) {
    const b = browser(); await b.csrf();
    const r = await b.post("/store/auth/register", form(typed, { name: "Someone Else" }));
    assert.equal(r.status, 409, typed);
    assert.equal(r.data.code, "mobile_taken");
  }
  const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM customers WHERE phone = ?", [e164(phone)]);
  assert.equal(n, 1);
});

test("the database itself refuses a second account with the same mobile", async () => {
  const { phone } = await registered();
  await assert.rejects(pool.query("INSERT INTO customers (name, phone) VALUES ('Copy', ?)", [e164(phone)]), { code: "ER_DUP_ENTRY" });
});

test("a number registered by someone else mid-sign-up can't be overwritten (race)", async () => {
  const b = browser(); await b.csrf();
  const phone = mobile();
  const r = await b.post("/store/auth/register", form(phone));
  const code = takeTestCode();
  await pool.query("INSERT INTO customers (name, phone, password) VALUES ('First Owner', ?, 'x')", [e164(phone)]);
  const v = await b.post("/store/auth/register/verify", { session: r.data.session, otp: code });
  assert.equal(v.status, 409);
  const [rows] = await pool.query("SELECT name FROM customers WHERE phone = ?", [e164(phone)]);
  assert.deepEqual(rows.map((x) => x.name), ["First Owner"]);
});

test("two simultaneous verifications of one code create exactly one account", async () => {
  const b = browser(); await b.csrf();
  const phone = mobile();
  const r = await b.post("/store/auth/register", form(phone));
  const code = takeTestCode();
  const results = await Promise.all([1, 2, 3].map(() => b.post("/store/auth/register/verify", { session: r.data.session, otp: code })));
  assert.equal(results.filter((x) => x.status === 201).length, 1);
  const [rows] = await pool.query("SELECT id FROM customers WHERE phone = ?", [e164(phone)]);
  assert.equal(rows.length, 1);
});

test("incorrect OTP is rejected, and the session locks after 5 wrong tries", async () => {
  const b = browser(); await b.csrf();
  const r = await b.post("/store/auth/register", form(mobile()));
  const code = takeTestCode();
  const wrong = code === "000000" ? "111111" : "000000";
  const first = await b.post("/store/auth/register/verify", { session: r.data.session, otp: wrong });
  assert.equal(first.status, 400);
  assert.equal(first.data.code, "otp_wrong");
  assert.equal(first.data.attemptsLeft, 4);
  for (let i = 0; i < 3; i++) await b.post("/store/auth/register/verify", { session: r.data.session, otp: wrong });
  const fifth = await b.post("/store/auth/register/verify", { session: r.data.session, otp: wrong });
  assert.equal(fifth.status, 429);
  assert.equal(fifth.data.code, "otp_locked");
  const late = await b.post("/store/auth/register/verify", { session: r.data.session, otp: code });
  assert.equal(late.status, 429, "even the right code no longer works");
});

test("expired OTP needs a new code", async () => {
  const b = browser(); await b.csrf();
  const r = await b.post("/store/auth/register", form(mobile()));
  const code = takeTestCode();
  await pool.query("UPDATE otp_verifications SET code_expires_at = NOW() - INTERVAL 1 SECOND WHERE public_id = ?", [r.data.session]);
  const v = await b.post("/store/auth/register/verify", { session: r.data.session, otp: code });
  assert.equal(v.status, 400);
  assert.equal(v.data.code, "otp_expired");
  assert.equal(v.data.canResend, true);
});

test("resend: cooldown, the old code stops working, and the resend limit holds", async () => {
  const b = browser(); await b.csrf();
  const r = await b.post("/store/auth/register", form(mobile()));
  const oldCode = takeTestCode();
  const early = await b.post("/store/auth/otp/resend", { session: r.data.session, purpose: "registration" });
  assert.equal(early.status, 429);
  assert.equal(early.data.code, "otp_cooldown");
  const back = () => pool.query("UPDATE otp_verifications SET last_sent_at = NOW() - INTERVAL 2 MINUTE WHERE public_id = ?", [r.data.session]);
  await back();
  const again = await b.post("/store/auth/otp/resend", { session: r.data.session, purpose: "registration" });
  assert.equal(again.status, 200);
  assert.equal(again.data.resendsLeft, 2);
  const newCode = takeTestCode();
  if (newCode !== oldCode) {
    const old = await b.post("/store/auth/register/verify", { session: r.data.session, otp: oldCode });
    assert.equal(old.status, 400, "the previous code is expired by the resend");
  }
  await back(); await b.post("/store/auth/otp/resend", { session: r.data.session, purpose: "registration" });
  await back(); await b.post("/store/auth/otp/resend", { session: r.data.session, purpose: "registration" });
  await back();
  const tooMany = await b.post("/store/auth/otp/resend", { session: r.data.session, purpose: "registration" });
  assert.equal(tooMany.status, 429);
  assert.equal(tooMany.data.code, "otp_resend_limit");
});

test("sign-up without a confirmation password works", async () => {
  const b = browser(); await b.csrf();
  const r = await b.post("/store/auth/register", { name: "No Confirm", mobile: mobile(), password: "Secret123", acceptTerms: true });
  assert.equal(r.status, 201);
  takeTestCode();
});

test("form validation: email format, weak password, mismatched confirmation, terms", async () => {
  const b = browser(); await b.csrf();
  const phone = mobile();
  const cases = [
    [form(phone, { email: "not-an-email" }), "email"],
    [form(phone, { password: "short", confirmPassword: "short" }), "password"],
    [form(phone, { password: "allletters", confirmPassword: "allletters" }), "password"],
    [form(phone, { confirmPassword: "Different1" }), "confirmPassword"],
    [form(phone, { acceptTerms: false }), "acceptTerms"],
    [form("12345"), "mobile"],
    [form(phone, { name: "A" }), "name"],
  ];
  for (const [body, field] of cases) {
    const r = await b.post("/store/auth/register", body);
    assert.equal(r.status, 400, `expected 400 for ${field}`);
    assert.equal(r.data.field, field);
  }
});

test("login: success creates a session; wrong password and unknown number get the same reply", async () => {
  const { phone, password } = await registered();
  const b = browser(); await b.csrf();
  const ok = await b.post("/store/auth/login", { mobile: phone, password, remember: true });
  assert.equal(ok.status, 200);
  const cookie = ok.headers.getSetCookie().find((c) => c.startsWith("nt_sid="));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Max-Age=2592000/);
  assert.ok(!ok.text.includes(b.jar.nt_sid), "session token is not in the body");
  const attempt = async (m) => { const x = browser(); await x.csrf(); return x.post("/store/auth/login", { mobile: m, password: "Wrong1234" }); };
  const wrong = await attempt(phone);
  const nobody = await attempt(mobile());
  assert.equal(wrong.status, 401);
  assert.equal(nobody.status, 401);
  assert.equal(wrong.data.message, nobody.data.message);
});

test("suspended account can't sign in, and suspension ends its sessions", async () => {
  const { b, phone, password, customer } = await registered();
  const token = await adminToken();
  const s = await admin(token, "PATCH", `/admin/customers/${customer.id}`, { is_active: false });
  assert.equal(s.status, 200);
  assert.equal((await b.get("/store/auth/me")).status, 401, "existing session ended");
  const x = browser(); await x.csrf();
  const bad = await x.post("/store/auth/login", { mobile: phone, password: "Wrong1234" });
  assert.equal(bad.status, 401, "a wrong password doesn't reveal the suspension");
  const r = await x.post("/store/auth/login", { mobile: phone, password });
  assert.equal(r.status, 403);
  assert.equal(r.data.code, "suspended");
});

test("logout revokes the session on the server", async () => {
  const { b } = await registered();
  const stolen = { ...b.jar };
  await b.post("/store/auth/logout");
  assert.equal((await b.get("/store/auth/me")).status, 401);
  const thief = browser(); Object.assign(thief.jar, stolen);
  assert.equal((await thief.get("/store/auth/me")).status, 401, "a copied cookie no longer works");
});

test("forgot password by OTP: generic reply, reset, old sessions end, new password works", async () => {
  const { b: oldDevice, phone } = await registered();
  const b = browser(); await b.csrf();
  const unknown = await b.post("/store/auth/forgot", { mobile: mobile() });
  const known = await b.post("/store/auth/forgot", { mobile: phone });
  assert.equal(unknown.status, 200);
  assert.equal(known.status, 200);
  assert.deepEqual(Object.keys(unknown.data).sort(), Object.keys(known.data).sort());
  assert.equal(unknown.data.message, known.data.message);
  const code = takeTestCode();
  assert.ok(code, "a real account gets a code");
  const decoy = await b.post("/store/auth/forgot/verify", { session: unknown.data.session, otp: code });
  assert.equal(decoy.status, 400, "a number without an account can never verify");
  const v = await b.post("/store/auth/forgot/verify", { session: known.data.session, otp: code });
  assert.equal(v.status, 200);
  const r = await b.post("/store/auth/forgot/reset", { session: known.data.session, resetToken: v.data.resetToken, password: "BrandNew99", confirmPassword: "BrandNew99" });
  assert.equal(r.status, 200);
  assert.equal((await oldDevice.get("/store/auth/me")).status, 401, "other devices are signed out");
  const again = await b.post("/store/auth/forgot/reset", { session: known.data.session, resetToken: v.data.resetToken, password: "Another99", confirmPassword: "Another99" });
  assert.equal(again.status, 410, "a reset works once");
  const x = browser(); await x.csrf();
  assert.equal((await x.post("/store/auth/login", { mobile: phone, password: "BrandNew99" })).status, 200);
});

test("SMS gateway failure is reported and logged", async () => {
  const b = browser(); await b.csrf();
  const r = await b.post("/store/auth/register", form("6000000000"));
  assert.equal(r.status, 201);
  assert.equal(r.data.sent, false);
  assert.equal(r.data.resendIn, 0, "the customer can retry straight away");
  const [[log]] = await pool.query("SELECT status, failure_reason FROM sms_logs WHERE phone = '+916000000000' ORDER BY id DESC LIMIT 1");
  assert.equal(log.status, "failed");
  assert.match(log.failure_reason, /Simulated/);
});

test("OTP disabled: new sign-ups can't bypass verification", async () => {
  await pool.query("UPDATE settings SET value = '0' WHERE `key` = 'otp.enabled'");
  try {
    const b = browser(); await b.csrf();
    const r = await b.post("/store/auth/register", form(mobile()));
    assert.equal(r.status, 503);
    assert.equal(r.data.code, "otp_disabled");
  } finally {
    await pool.query("UPDATE settings SET value = '1' WHERE `key` = 'otp.enabled'");
  }
});

test("an admin's template edit is used for the next email", async () => {
  const token = await adminToken();
  const t = await admin(token, "GET", "/admin/emails/templates/registration_confirmation");
  const save = await admin(token, "PUT", "/admin/emails/templates/registration_confirmation", { subject: "Hello {{customer_name}} from {{company_name}}", html: t.data.html, text: "" });
  assert.equal(save.status, 200);
  const { customer } = await registered({ email: `edit${Date.now()}@example.com` });
  const [[e]] = await pool.query("SELECT subject FROM email_logs WHERE customer_id = ? AND template_key = 'registration_confirmation'", [customer.id]);
  assert.equal(e.subject, "Hello Test from Nawara Trend");
  const h = await admin(token, "GET", "/admin/emails/templates/registration_confirmation/history");
  assert.ok(h.data.length >= 1, "the edit is in the template history");
  await admin(token, "POST", "/admin/emails/templates/registration_confirmation/reset");
});

test("access control: staff can't open the logs or OTP settings; customers can't open the admin API", async () => {
  const staff = await adminToken("staff");
  assert.equal((await admin(staff, "GET", "/admin/communication/sms-logs")).status, 403);
  assert.equal((await admin(staff, "GET", "/admin/emails/logs")).status, 403);
  assert.equal((await admin(staff, "GET", "/admin/communication/otp-settings")).status, 403);
  assert.equal((await admin(staff, "GET", "/admin/customers")).status, 200, "staff can still view customers");
  const manager = await adminToken("manager");
  const logs = await admin(manager, "GET", "/admin/communication/sms-logs");
  assert.equal(logs.status, 200);
  assert.ok(logs.data.rows.every((r) => /X{6}/.test(r.phone)), "managers see masked numbers");
  assert.equal((await admin(manager, "PUT", "/admin/communication/otp-settings", { length: 4 })).status, 403);
  const { b } = await registered();
  assert.equal((await b.get("/admin/customers")).status, 401);
});

test("OTP settings stay within safe limits", async () => {
  const token = await adminToken();
  assert.equal((await admin(token, "PUT", "/admin/communication/otp-settings", { length: 2 })).status, 400);
  assert.equal((await admin(token, "PUT", "/admin/communication/otp-settings", { expiry_minutes: 120 })).status, 400);
  assert.equal((await admin(token, "PUT", "/admin/communication/otp-settings", { max_attempts: 5, expiry_minutes: 5 })).status, 200);
});

test("CSRF: changes without the token are refused", async () => {
  const b = browser(); await b.csrf();
  const r = await b.post("/store/auth/login", { mobile: mobile(), password: "x" }, { csrf: false });
  assert.equal(r.status, 403);
  assert.equal(r.data.code, "csrf");
});

test("abandoned sign-ups expire and lose their password hash", async () => {
  const b = browser(); await b.csrf();
  const r = await b.post("/store/auth/register", form(mobile()));
  takeTestCode();
  const [[o]] = await pool.query("SELECT pending_id FROM otp_verifications WHERE public_id = ?", [r.data.session]);
  await pool.query("UPDATE pending_registrations SET expires_at = NOW() - INTERVAL 1 MINUTE WHERE id = ?", [o.pending_id]);
  const { runCleanup } = await import("../src/lib/cleanup.js");
  await runCleanup();
  const [[p]] = await pool.query("SELECT status, password_hash FROM pending_registrations WHERE id = ?", [o.pending_id]);
  assert.equal(p.status, "expired");
  assert.equal(p.password_hash, null);
});
