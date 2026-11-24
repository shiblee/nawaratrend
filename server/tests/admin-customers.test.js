/* Admin › Customers: orders per customer, full sign-in / sign-out history, and the products a customer views most. */
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { pool, close, browser, adminToken, admin, registered, takeTestCode } from "./helpers.js";

let token, slugs;
before(async () => {
  token = await adminToken();
  const [rows] = await pool.query("SELECT slug FROM products WHERE status = 'active' ORDER BY id LIMIT 3");
  slugs = rows.map((r) => r.slug);
  assert.equal(slugs.length, 3);
});
after(close);

const address = (phone) => ({ name: "Test Person", phone, line1: "12 MG Road", line2: "", city: "Lucknow", state: "Uttar Pradesh", pin: "226001" });

test("orders can be listed for one customer, with tab counts for that customer only", async () => {
  const { b, phone, customer } = await registered();
  for (let i = 0; i < 2; i++) {
    const r = await b.post("/store/orders", { items: [{ productId: slugs[0], qty: 1 }], address: address(phone), payment: "cod" });
    assert.equal(r.status, 201, r.text);
  }
  const r = await admin(token, "GET", `/admin/orders?customer=${customer.id}`);
  assert.equal(r.status, 200);
  assert.equal(r.data.total, 2);
  assert.ok(r.data.rows.every((o) => o.customer_id === customer.id));
  assert.equal(r.data.customer.name, "Test Customer");
  assert.equal(Object.values(r.data.statusCounts).reduce((a, n) => a + n, 0), 2);
  const list = await admin(token, "GET", `/admin/customers?search=${customer.id}`);
  assert.equal(list.data.rows.find((c) => c.id === customer.id).orders, 2);
});

test("sign-in history lists every session: how they signed in, when they signed out, and what's still active", async () => {
  const { b, phone, password, customer } = await registered();   // session 1: sign-up
  await b.post("/store/auth/logout");
  const b2 = browser(); await b2.csrf();
  assert.equal((await b2.post("/store/auth/login", { mobile: phone, password })).status, 200);   // session 2: password, still active
  const b3 = browser(); await b3.csrf();
  const s = await b3.post("/store/auth/login/otp", { mobile: phone });
  assert.equal((await b3.post("/store/auth/login/otp/verify", { session: s.data.session, otp: takeTestCode() })).status, 200);   // session 3: code
  await pool.query("UPDATE customer_sessions SET expires_at = NOW() - INTERVAL 1 MINUTE WHERE id = (SELECT id FROM (SELECT MAX(id) AS id FROM customer_sessions WHERE customer_id = ?) x)", [customer.id]);

  const r = await admin(token, "GET", `/admin/customers/${customer.id}/sessions`);
  assert.equal(r.status, 200);
  assert.equal(r.data.total, 3);
  const [code, pw, signup] = r.data.rows;   // newest first
  assert.equal(signup.method, "signup");
  assert.equal(signup.state, "signed_out");
  assert.ok(signup.ended_at);
  assert.equal(pw.method, "password");
  assert.equal(pw.state, "active");
  assert.equal(pw.ended_at, null);
  assert.equal(code.method, "code");
  assert.equal(code.state, "expired");
  assert.equal(r.data.summary.active, 1);
  assert.deepEqual(r.data.summary.methods, { signup: 1, password: 1, code: 1 });
  // paging
  const p2 = await admin(token, "GET", `/admin/customers/${customer.id}/sessions?limit=2&page=2`);
  assert.equal(p2.data.rows.length, 1);
  assert.equal((await admin(token, "GET", "/admin/customers/999999/sessions")).status, 404);
});

test("product views: counted per visit for signed-in customers, guests ignored, most viewed first", async () => {
  const { b, customer } = await registered();
  const view = (who, slug) => who.post(`/store/products/${slug}/view`);
  assert.equal((await view(b, slugs[1])).status, 204);
  await view(b, slugs[1]);   // a reload within 10 minutes is the same visit
  await view(b, slugs[2]);
  // two earlier visits to slugs[1] (more than 10 minutes ago), so the next view counts as a new visit
  await pool.query("UPDATE customer_product_views v JOIN products p ON p.id = v.product_id SET v.views = 2, v.last_viewed_at = NOW() - INTERVAL 1 HOUR WHERE v.customer_id = ? AND p.slug = ?", [customer.id, slugs[1]]);
  await view(b, slugs[1]);
  const guest = browser(); await guest.csrf();
  assert.equal((await view(guest, slugs[0])).status, 204);
  assert.equal((await view(b, "no-such-product")).status, 204);

  const r = await admin(token, "GET", `/admin/customers/${customer.id}/views`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.rows.map((x) => [x.slug, x.views]), [[slugs[1], 3], [slugs[2], 1]]);
  assert.equal(r.data.stats.productVisits, 4);
  assert.ok(r.data.rows[0].code.startsWith("NT-"));
  const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM customer_product_views v JOIN products p ON p.id = v.product_id WHERE p.slug = ?", [slugs[0]]);
  assert.equal(n, 0, "guests are not tracked");

  const d = await admin(token, "GET", `/admin/customers/${customer.id}`);
  assert.equal(d.data.views[0].slug, slugs[1]);
  assert.equal(d.data.stats.viewedProducts, 2);
  assert.ok(d.data.stats.signIns >= 1);
  const list = await admin(token, "GET", `/admin/customers?search=${customer.id}`);
  const row = list.data.rows.find((c) => c.id === customer.id);
  assert.equal(row.product_views, 4);
  assert.ok(row.top_product);
});

test("viewing a product needs the CSRF token like every other change", async () => {
  const { b } = await registered();
  assert.equal((await b.post(`/store/products/${slugs[0]}/view`, undefined, { csrf: false })).status, 403);
});
