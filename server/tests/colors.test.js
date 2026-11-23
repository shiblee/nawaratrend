/* Colour options: choosing one or several colours of a product, from the catalogue through to the order. */
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { pool, close, browser, adminToken, admin, mobile, registered } from "./helpers.js";

const COLORS = [{ name: "Yellow", hex: "#F5C518", image: "https://example.com/y.webp" }, { name: "Green", hex: "#8CBF8A", image: null }];
let token, body, id;

before(async () => {
  token = await adminToken();
  const [[cat]] = await pool.query("SELECT id FROM categories LIMIT 1");
  body = { name: "Colour Test Pouch", slug: "colour-test-pouch", category_id: cat.id, price: 200, mrp: 300, stock: 5, images: ["https://example.com/main.webp"], colors: COLORS };
  const r = await admin(token, "POST", "/admin/products", body);
  assert.equal(r.status, 201, r.text);
  id = r.data.id;
});
after(close);

const address = (phone) => ({ name: "Test Person", phone, line1: "12 MG Road", line2: "Hazratganj", city: "Lucknow", state: "Uttar Pradesh", pin: "226001" });
const order = async (items, b) => {
  if (!b) { b = browser(); await b.csrf(); }
  return b.post("/store/orders", { items: items.map((i) => ({ productId: "colour-test-pouch", qty: 1, ...i })), address: address(mobile()), payment: "cod" });
};
const stock = async () => (await pool.query("SELECT stock FROM products WHERE id = ?", [id]))[0][0].stock;

test("the catalogue lists the colours, and leaves them out for products without any", async () => {
  const { data } = await browser().get("/store/catalog");
  assert.deepEqual(data.products.find((p) => p.id === "colour-test-pouch").colors, COLORS);
  assert.ok(data.products.filter((p) => p.id !== "colour-test-pouch").every((p) => p.colors === undefined));
});

test("several colours in one order are saved as separate lines and share the stock", async () => {
  const r = await order([{ color: "Yellow", qty: 2 }, { color: "Green", qty: 1 }]);
  assert.equal(r.status, 201, r.text);
  assert.equal(r.data.subtotal, 600);
  const [rows] = await pool.query("SELECT oi.color, oi.qty FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.order_number = ? ORDER BY oi.id", [r.data.orderId]);
  assert.deepEqual(rows.map((x) => [x.color, x.qty]), [["Yellow", 2], ["Green", 1]]);
  assert.equal(await stock(), 2);
});

test("an order across colours can't take more than the total stock", async () => {
  const r = await order([{ color: "Yellow", qty: 2 }, { color: "Green", qty: 1 }]);
  assert.equal(r.status, 409);
  assert.equal(await stock(), 2);
});

test("a missing or unknown colour is refused", async () => {
  assert.equal((await order([{}])).status, 400);
  const r = await order([{ color: "Pink" }]);
  assert.equal(r.status, 400);
  assert.match(r.data.message, /isn't available in Pink/);
});

test("a colour sent for a product without colours is ignored", async () => {
  await admin(token, "POST", "/admin/products", { ...body, name: "Plain Pouch", slug: "plain-pouch", colors: [] });
  const r = await order([{ productId: "plain-pouch", color: "Yellow" }]);
  assert.equal(r.status, 201, r.text);
  const [[i]] = await pool.query("SELECT color FROM order_items WHERE product_slug = 'plain-pouch'");
  assert.equal(i.color, null);
});

test("the customer sees the colour and its photo, the team sees it in the order, CSV and email", async () => {
  const { b } = await registered();
  const r = await order([{ color: "Yellow" }], b);
  assert.equal(r.status, 201, r.text);
  const mine = await b.get(`/store/orders/mine/${r.data.orderId}`);
  assert.equal(mine.data.order.items[0].color, "Yellow");
  assert.equal(mine.data.order.items[0].image, "https://example.com/y.webp");
  const [[o]] = await pool.query("SELECT id FROM orders WHERE order_number = ?", [r.data.orderId]);
  assert.equal((await admin(token, "GET", `/admin/orders/${o.id}`)).data.items[0].color, "Yellow");
  assert.match((await admin(token, "GET", "/admin/orders/export.csv")).text, /1 x Colour Test Pouch \(Yellow\)/);
  const { itemsTable } = await import("../src/lib/email/templates.js");
  const t = itemsTable([{ product_name: "Pouch", size: "M", color: "Yellow", qty: 1, line_total: 200 }], String);
  assert.match(t.html, /Size M · Yellow/);
  assert.match(t.text, /\(Size M · Yellow\)/);
});

test("admin checks: duplicates, symbols and bad swatches are refused; a form without colours leaves them alone", async () => {
  const put = (colors) => admin(token, "PUT", `/admin/products/${id}`, { ...body, colors });
  assert.equal((await put([COLORS[0], { ...COLORS[0], name: "yellow" }])).status, 400);
  assert.equal((await put([{ name: "Red|Blue", hex: "#FF0000" }])).status, 400);
  assert.equal((await put([{ name: "Red", hex: "red" }])).status, 400);
  assert.equal((await put([{ name: "Red", hex: "#FF0000", image: "javascript:alert(1)" }])).status, 400);
  assert.equal((await put(undefined)).status, 200);
  assert.deepEqual((await admin(token, "GET", `/admin/products/${id}`)).data.colors, COLORS);
});
