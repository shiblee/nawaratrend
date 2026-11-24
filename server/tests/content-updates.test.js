/* One-off content updates (contentUpdates.js): applied once on deploy, never repeated or undone. */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { pool, close, browser } from "./helpers.js";

after(close);
const { applyContentUpdates } = await import("../src/config/contentUpdates.js");

test("the Taj Mahal watch keychain is added once, live in the catalogue with a code and its own SEO text", async () => {
  const { data } = await browser().get("/store/catalog");
  const p = data.products.find((x) => x.id === "taj-mahal-pocket-watch-keychain");
  assert.ok(p, "in the catalogue");
  assert.equal(p.price, 449);
  assert.equal(p.mrp, 641);
  assert.equal(p.cat, "accessories");
  assert.match(p.code, /^NT-\d+$/);
  assert.equal(p.images.length, 5);
  assert.ok(p.images[0].endsWith("taj-mahal-pocket-watch-keychain-1.jpg"));
  const [[row]] = await pool.query("SELECT seo_title, seo_description, stock FROM products WHERE slug = 'taj-mahal-pocket-watch-keychain'");
  assert.equal(row.stock, 50);
  assert.ok(row.seo_title.length + " | NawaraTrend".length <= 60);
  assert.ok(row.seo_description.length <= 155);
});

test("running again doesn't duplicate it, and doesn't bring back a product the team deleted", async () => {
  await applyContentUpdates();
  const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM products WHERE slug = 'taj-mahal-pocket-watch-keychain'");
  assert.equal(n, 1);
  await pool.query("DELETE FROM products WHERE slug = 'taj-mahal-pocket-watch-keychain'");
  await applyContentUpdates();
  const [[{ m }]] = await pool.query("SELECT COUNT(*) AS m FROM products WHERE slug = 'taj-mahal-pocket-watch-keychain'");
  assert.equal(m, 0);
});

test("the product page carries the SEO title, description and Google product data", async () => {
  const { buildSeo } = await import("../src/lib/seo.js");
  await pool.query("DELETE FROM settings WHERE `key` = 'content.2026-11-24-taj-mahal-watch-keychain'");
  await applyContentUpdates();
  const seo = await buildSeo("/product/taj-mahal-pocket-watch-keychain");
  assert.equal(seo.status, 200);
  assert.equal(seo.title, "Taj Mahal Pocket Watch Keychain, Antique Brass | NawaraTrend");
  assert.match(seo.description, /quartz pocket watch/);
  const product = seo.jsonLd.find((j) => j["@type"] === "Product");
  assert.equal(product.offers.price, "449.00");
  assert.equal(product.image.length, 5);
});

test("the Heritage Crest watch keychain is listed under a generic name, with no franchise names anywhere", async () => {
  const [[p]] = await pool.query("SELECT name, description, highlights, seo_title, seo_description, price, mrp, stock, images FROM products WHERE slug = 'heritage-crest-pocket-watch-keychain'");
  assert.ok(p);
  assert.deepEqual([Number(p.price), Number(p.mrp), p.stock], [449, 641, 50]);
  const text = [p.name, p.description, JSON.stringify(p.highlights), p.seo_title, p.seo_description].join(" ");
  assert.doesNotMatch(text, /hogwarts|harry|potter|gryffindor|slytherin|hufflepuff|ravenclaw|wizard/i);
  assert.match(p.description, /How to use/);
  assert.ok(p.seo_title.length + " | NawaraTrend".length <= 60);
  assert.ok(p.seo_description.length <= 155);
  assert.equal((typeof p.images === "string" ? JSON.parse(p.images) : p.images).length, 4);
});
