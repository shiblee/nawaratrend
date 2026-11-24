/* Signing in with a code by SMS, and "Sign in with Google" (linked to a verified mobile). Run: npm test (needs the local MySQL). */
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import { pool, takeTestCode, close, browser, mobile, registered } from "./helpers.js";

/* A stand-in for Google's tokeninfo endpoint: the "token" is the JSON Google would return. */
const google = http.createServer((req, res) => {
  const raw = new URL(req.url, "http://x").searchParams.get("id_token");
  try { const info = JSON.parse(Buffer.from(raw, "base64url").toString()); res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(info)); }
  catch { res.writeHead(400).end("{}"); }
});
const CLIENT = "test-client.apps.googleusercontent.com";
let sub = 1000;
const token = (over = {}) => Buffer.from(JSON.stringify({ aud: CLIENT, iss: "https://accounts.google.com", exp: String(Math.floor(Date.now() / 1000) + 600),
  sub: String(++sub), email: `g${sub}@gmail.com`, email_verified: "true", name: "Google Person", ...over })).toString("base64url");

before(async () => {
  await new Promise((r) => google.listen(0, r));
  process.env.GOOGLE_TOKENINFO_URL = `http://127.0.0.1:${google.address().port}/tokeninfo`;
  process.env.GOOGLE_CLIENT_ID = CLIENT;
});
after(async () => { google.close(); await close(); });

/* ---------- sign in with a code ---------- */
test("sign in with a code by SMS, no password needed", async () => {
  const { phone, customer } = await registered();
  const b = browser(); await b.csrf();
  const s = await b.post("/store/auth/login/otp", { mobile: phone });
  assert.equal(s.status, 201);
  assert.equal(s.data.sent, true);
  const code = takeTestCode();
  assert.ok(!s.text.includes(code));
  const v = await b.post("/store/auth/login/otp/verify", { session: s.data.session, otp: code, remember: true });
  assert.equal(v.status, 200);
  assert.equal(v.data.customer.id, customer.id);
  assert.equal((await b.get("/store/auth/me")).data.customer.id, customer.id);
  // the code works once
  const again = await browser(); await again.csrf();
  assert.equal((await again.post("/store/auth/login/otp/verify", { session: s.data.session, otp: code })).status, 410);
});

test("sign-in code: unknown number is told to create an account; wrong code counts down", async () => {
  const b = browser(); await b.csrf();
  const none = await b.post("/store/auth/login/otp", { mobile: mobile() });
  assert.equal(none.status, 404);
  assert.equal(none.data.code, "no_account");
  const { phone } = await registered();
  const s = await b.post("/store/auth/login/otp", { mobile: phone });
  const code = takeTestCode();
  const wrong = await b.post("/store/auth/login/otp/verify", { session: s.data.session, otp: code === "000000" ? "111111" : "000000" });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.data.code, "otp_wrong");
  assert.equal((await b.get("/store/auth/me")).status, 401);
});

test("sign-in code: a suspended account can't get in", async () => {
  const { phone, customer } = await registered();
  await pool.query("UPDATE customers SET is_active = 0 WHERE id = ?", [customer.id]);
  const b = browser(); await b.csrf();
  const s = await b.post("/store/auth/login/otp", { mobile: phone });
  const v = await b.post("/store/auth/login/otp/verify", { session: s.data.session, otp: takeTestCode() });
  assert.equal(v.status, 403);
  assert.equal(v.data.code, "suspended");
  assert.equal((await b.get("/store/auth/me")).status, 401);
});

test("a registration code can't be used to sign in (purposes are separate)", async () => {
  const { phone } = await registered();
  const b = browser(); await b.csrf();
  const reset = await b.post("/store/auth/forgot", { mobile: phone });
  const v = await b.post("/store/auth/login/otp/verify", { session: reset.data.session, otp: takeTestCode() });
  assert.equal(v.status, 410);
});

/* ---------- Google ---------- */
test("Google config tells the page the client id", async () => {
  assert.equal((await browser().get("/store/auth/google/config")).data.clientId, CLIENT);
});

test("first Google sign-in with a new number: confirm mobile once, account created; next time Google alone signs in", async () => {
  const b = browser(); await b.csrf();
  const cred = token({ name: "Riya Sharma" });
  const g = await b.post("/store/auth/google", { credential: cred });
  assert.equal(g.status, 200);
  assert.equal(g.data.needMobile, true);
  assert.equal(g.data.email, `g${sub}@gmail.com`);
  const phone = mobile();
  const noTerms = await b.post("/store/auth/google/mobile", { ticket: g.data.ticket, mobile: phone });
  assert.equal(noTerms.data.field, "acceptTerms");
  const m = await b.post("/store/auth/google/mobile", { ticket: g.data.ticket, mobile: phone, acceptTerms: true });
  assert.equal(m.status, 201);
  assert.equal(m.data.existing, false);
  const v = await b.post("/store/auth/google/verify", { ticket: g.data.ticket, session: m.data.session, otp: takeTestCode() });
  assert.equal(v.status, 201);
  assert.equal(v.data.created, true);
  assert.equal(v.data.customer.name, "Riya Sharma");
  assert.equal(v.data.customer.phone, phone);
  assert.equal(v.data.customer.hasPassword, false);
  assert.equal(v.data.customer.emailVerified, true);

  const later = browser(); await later.csrf();
  const again = await later.post("/store/auth/google", { credential: cred });
  assert.equal(again.status, 200);
  assert.equal(again.data.customer.id, v.data.customer.id);
  // the account has no password, so it can set one without a "current password"
  const pw = await later.put("/store/account/password", { newPassword: "FirstPass1" });
  assert.equal(pw.status, 200);
  assert.equal(pw.data.customer.hasPassword, true);
});

test("Google with a number that already has an account links to it (no second account)", async () => {
  const { phone, customer } = await registered();
  const b = browser(); await b.csrf();
  const g = await b.post("/store/auth/google", { credential: token() });
  const m = await b.post("/store/auth/google/mobile", { ticket: g.data.ticket, mobile: phone });
  assert.equal(m.data.existing, true);
  const v = await b.post("/store/auth/google/verify", { ticket: g.data.ticket, session: m.data.session, otp: takeTestCode() });
  assert.equal(v.status, 200);
  assert.equal(v.data.customer.id, customer.id);
  assert.equal(v.data.customer.google, true);
  const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM customers WHERE phone = ?", [`+91${phone}`]);
  assert.equal(n, 1);
  // a different Google account can't take over that number
  const other = browser(); await other.csrf();
  const g2 = await other.post("/store/auth/google", { credential: token() });
  const m2 = await other.post("/store/auth/google/mobile", { ticket: g2.data.ticket, mobile: phone });
  assert.equal(m2.status, 409);
  assert.equal(m2.data.code, "google_other");
});

test("without the mobile code, Google alone never gets into someone's account", async () => {
  const { phone } = await registered();
  const b = browser(); await b.csrf();
  const g = await b.post("/store/auth/google", { credential: token() });
  const m = await b.post("/store/auth/google/mobile", { ticket: g.data.ticket, mobile: phone });
  takeTestCode();
  const v = await b.post("/store/auth/google/verify", { ticket: g.data.ticket, session: m.data.session, otp: "000000" });
  assert.equal(v.status, 400);
  assert.equal((await b.get("/store/auth/me")).status, 401);
});

test("Google tokens for another site, expired, or forged are refused; tampered tickets too", async () => {
  const b = browser(); await b.csrf();
  for (const bad of [token({ aud: "someone-else" }), token({ exp: "1000" }), token({ iss: "evil.example" }), "not-a-real-google-token-at-all"]) {
    const r = await b.post("/store/auth/google", { credential: bad });
    assert.ok([400, 401].includes(r.status), r.text);
  }
  const g = await b.post("/store/auth/google", { credential: token() });
  const [body, mac] = g.data.ticket.split(".");
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url")), sub: "1" })).toString("base64url");
  const r = await b.post("/store/auth/google/mobile", { ticket: `${forged}.${mac}`, mobile: mobile(), acceptTerms: true });
  assert.equal(r.status, 410);
});

test("Google sign-in is switched off cleanly when no client id is set", async () => {
  const saved = process.env.GOOGLE_CLIENT_ID; process.env.GOOGLE_CLIENT_ID = "";
  try {
    const b = browser(); await b.csrf();
    assert.equal((await b.get("/store/auth/google/config")).data.clientId, "");
    assert.equal((await b.post("/store/auth/google", { credential: token() })).status, 503);
  } finally { process.env.GOOGLE_CLIENT_ID = saved; }
});
