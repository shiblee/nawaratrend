/* Permanent product codes: one each, unaffected by other products, never reused. */
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { pool, close, browser, adminToken, admin } from "./helpers.js";
import { assignProductCodes } from "../src/lib/codes.js";
after(close);

const codes = async () => Object.fromEntries((await browser().get("/store/catalog")).data.products.map((p) => [p.id, p.code]));

test("codes are given in the order products were added, and stay when products are added, moved or deleted", async () => {
  const token = await adminToken();
  const before = await codes();
  const [seeded] = await pool.query("SELECT slug FROM products ORDER BY id");
  assert.deepEqual(seeded.map((s) => before[s.slug]), seeded.map((_, i) => `NT-${String(i + 1).padStart(2, "0")}`));

  const [[cat]] = await pool.query("SELECT id FROM categories ORDER BY sort_order LIMIT 1");
  const add = (slug) => admin(token, "POST", "/admin/products", { name: slug, slug, category_id: cat.id, price: 10, stock: 1, sort_order: 0 });
  const a = await add("first-in-shop");   // comes before everything else in the shop
  const n = seeded.length;
  let now = await codes();
  assert.equal(now["first-in-shop"], `NT-${String(n + 1).padStart(2, "0")}`);
  for (const s of seeded) assert.equal(now[s.slug], before[s.slug]);

  const put = await admin(token, "PUT", `/admin/products/${a.data.id}`, { name: "renamed", slug: "renamed", category_id: cat.id, price: 12, stock: 1, sort_order: 99, code_no: 1 });
  assert.equal(put.status, 200, put.text);
  assert.equal((await codes()).renamed, `NT-${String(n + 1).padStart(2, "0")}`, "saving can't change the code");

  await admin(token, "DELETE", `/admin/products/${a.data.id}`);
  await add("second");
  now = await codes();
  assert.equal(now.second, `NT-${String(n + 2).padStart(2, "0")}`, "a deleted product's code isn't reused");

  await pool.query("INSERT INTO products (slug, name, category_id, price, mrp, stock) VALUES ('direct', 'Direct', ?, 5, 5, 1)", [cat.id]);
  assert.equal((await codes()).direct, `NT-${String(n + 3).padStart(2, "0")}`, "a product added straight into the database gets one too");
  const found = await admin(token, "GET", `/admin/products?search=nt-${n + 3}`);
  assert.deepEqual(found.data.rows.map((r) => r.slug), ["direct"]);
});

test("simultaneous requests never give two products the same code", async () => {
  await pool.query("UPDATE products SET code_no = NULL");
  await Promise.all([assignProductCodes(), assignProductCodes(), assignProductCodes()]);
  const [[r]] = await pool.query("SELECT COUNT(*) n, COUNT(code_no) c, COUNT(DISTINCT code_no) d FROM products");
  assert.equal(r.c, r.n); assert.equal(r.d, r.n);
});
