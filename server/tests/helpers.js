/* Test setup: a separate database (nawaratrend_test, created and reset here), SMS in memory, and email
   pointed at a closed port so every email "fails" (proving an email problem never blocks sign-up). */
import crypto from "crypto";

Object.assign(process.env, {
  NODE_ENV: "test",
  SMS_PROVIDER: "memory",
  EMAIL_TRANSPORT: "smtp", SMTP_HOST: "127.0.0.1", SMTP_PORT: "1",
  DB_NAME: process.env.TEST_DB_NAME || "nawaratrend_test",
  JWT_SECRET: "test-secret-" + "x".repeat(40),
  TRUST_PROXY: "1",
  SITE_URL: "http://localhost:3000",
});

const { default: dotenv } = await import("dotenv");
dotenv.config();   // DB host / user / password from server/.env (DB_NAME above wins)

const mysql = (await import("mysql2/promise")).default;
const root = await mysql.createConnection({ host: process.env.DB_HOST || "localhost", port: Number(process.env.DB_PORT) || 8889,
  user: process.env.DB_USER || "root", password: process.env.DB_PASSWORD || "root" });
await root.query(`DROP DATABASE IF EXISTS \`${process.env.DB_NAME}\``);
await root.query(`CREATE DATABASE \`${process.env.DB_NAME}\``);
await root.end();

const { initDatabase } = await import("../src/config/initDb.js");
const log = console.log; console.log = () => {};
await initDatabase();
console.log = log;

export const { pool } = await import("../src/config/db.js");
export const { takeTestCode } = await import("../src/lib/sms/providers.js");
const { default: app } = await import("../src/app.js");

const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api`;
export const close = async () => { server.close(); await pool.end(); };

let n = 0;
/** A fresh test mobile number (valid Indian format, never repeated in a run). */
export const mobile = () => `9${String(Date.now() % 1e6).padStart(6, "0")}${String(n++ % 1000).padStart(3, "0")}`;

/** A browser: keeps cookies, sends the CSRF header, and comes from its own IP address (so rate limits don't collide). */
export function browser() {
  const jar = {};
  const ip = `10.${crypto.randomInt(255)}.${crypto.randomInt(255)}.${crypto.randomInt(1, 255)}`;
  async function call(method, path, body, { csrf = true, headers = {} } = {}) {
    const h = { "Content-Type": "application/json", "X-Forwarded-For": ip, ...headers };
    const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
    if (cookie) h.Cookie = cookie;
    if (csrf && jar.nt_csrf && method !== "GET") h["X-CSRF-Token"] = decodeURIComponent(jar.nt_csrf);
    const res = await fetch(base + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";"); const i = pair.indexOf("=");
      const k = pair.slice(0, i), v = pair.slice(i + 1);
      if (/Max-Age=0/.test(c) || v === "") delete jar[k]; else jar[k] = v;
    }
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, text, headers: res.headers };
  }
  const b = {
    jar, ip, call,
    get: (p, o) => call("GET", p, undefined, o),
    post: (p, body, o) => call("POST", p, body, o),
    put: (p, body, o) => call("PUT", p, body, o),
    patch: (p, body, o) => call("PATCH", p, body, o),
    csrf: () => call("GET", "/store/auth/csrf"),
  };
  return b;
}

/** Signs up and verifies a customer; returns { b, phone, password, customer }. */
export async function registered({ email = null, password = "Secret123" } = {}) {
  const b = browser(); await b.csrf();
  const phone = mobile();
  const r = await b.post("/store/auth/register", { name: "Test Customer", mobile: phone, email, password, confirmPassword: password, acceptTerms: true });
  if (r.status !== 201) throw new Error(`register failed: ${r.status} ${r.text}`);
  const v = await b.post("/store/auth/register/verify", { session: r.data.session, otp: takeTestCode() });
  if (v.status !== 201) throw new Error(`verify failed: ${v.status} ${v.text}`);
  return { b, phone, password, customer: v.data.customer };
}

/** Admin panel bearer token for the seeded owner (or a new admin of the given role). */
export async function adminToken(role = "owner") {
  const login = async (email, password) => {
    const r = await fetch(base + "/admin/auth/login", { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.250.0." + crypto.randomInt(1, 255) },
      body: JSON.stringify({ email, password }) });
    return (await r.json()).token;
  };
  if (role === "owner") return login("admin@nawaratrend.com", "Admin@123");
  const bcrypt = (await import("bcryptjs")).default;
  const email = `${role}${Date.now()}${n++}@test.local`;
  await pool.query("INSERT INTO admins (name, email, password, role) VALUES (?, ?, ?, ?)", [`Test ${role}`, email, await bcrypt.hash("Passw0rd!", 4), role]);
  return login(email, "Passw0rd!");
}

export async function admin(token, method, path, body) {
  const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data, text };
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
