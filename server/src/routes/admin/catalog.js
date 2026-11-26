/* Products and categories. Everyone can view; managers and owners can change. */
import express from "express";
import { pool } from "../../config/db.js";
import { ah, HttpError, str, num, oneOf, strList, bool, colorList, paging, slugify, jsonList, URL_RE } from "../../lib/http.js";
import { assignProductCodes, productCode } from "../../lib/codes.js";
import { audit } from "../../lib/store.js";
import { requireRole } from "../../middleware/auth.js";

const router = express.Router();
const canEdit = requireRole("owner", "manager");

/* ---------- Products ---------- */
const shape = (r) => ({
  ...r, price: Number(r.price), mrp: Number(r.mrp), cost_price: r.cost_price == null ? null : Number(r.cost_price),
  rating: Number(r.rating), highlights: jsonList(r.highlights), sizes: jsonList(r.sizes), size_prices: jsonList(r.size_prices), colors: jsonList(r.colors), images: jsonList(r.images),
  is_featured: !!r.is_featured, code: productCode(r.code_no),
});

/** [{ size, price, mrp, image }]: a price per size; sizes without one sell at the product's price. */
function sizePriceList(v) {
  if (!Array.isArray(v) || v.length > 15) throw new HttpError(400, "Check the prices per size", { field: "size_prices" });
  return v.map((x, i) => {
    const f = `size_prices[${i + 1}]`;
    const size = str(x?.size, f, { max: 20 });
    const price = num(x?.price, `${f} price`, { min: 1, max: 10000000 });
    const mrp = num(x?.mrp === "" || x?.mrp == null ? price : x.mrp, `${f} MRP`, { min: 1, max: 10000000 });
    if (mrp < price) throw new HttpError(400, `MRP for ${size} can't be lower than its price`, { field: "size_prices" });
    const image = str(x?.image, `${f} photo`, { optional: true, max: 500, pattern: URL_RE });
    return { size, price, mrp, ...(image ? { image } : {}) };
  });
}

function readProduct(b) {
  const name = str(b.name, "name", { min: 2, max: 150 });
  const price = num(b.price, "price", { min: 1, max: 10000000 });
  const mrp = num(b.mrp === "" || b.mrp == null ? price : b.mrp, "mrp", { min: 1, max: 10000000 });
  if (mrp < price) throw new HttpError(400, "MRP can't be lower than the selling price", { field: "mrp" });
  return {
    name, price, mrp,
    slug: slugify(str(b.slug, "slug", { optional: true, max: 80 }) || name),
    category_id: num(b.category_id, "category", { int: true, min: 1, optional: true }),
    description: str(b.description, "description", { optional: true, max: 5000 }),
    cost_price: num(b.cost_price, "cost price", { min: 0, max: 10000000, optional: true }),
    sku: str(b.sku, "SKU", { optional: true, max: 60, pattern: /^[A-Za-z0-9._-]+$/ }),
    stock: num(b.stock ?? 0, "stock", { int: true, min: 0, max: 1000000 }),
    low_stock_threshold: num(b.low_stock_threshold ?? 5, "low stock alert", { int: true, min: 0, max: 100000 }),
    rating: num(b.rating ?? 0, "rating", { min: 0, max: 5 }),
    review_count: num(b.review_count ?? 0, "review count", { int: true, min: 0, max: 10000000 }),
    highlights: JSON.stringify(strList(b.highlights, "highlights", { maxItems: 8, maxLen: 120 })),
    sizes: JSON.stringify(strList(b.sizes, "sizes", { maxItems: 15, maxLen: 20 })),
    // left alone when not sent, so an older open copy of the form can't wipe them
    ...(b.size_prices === undefined ? {} : { size_prices: JSON.stringify(sizePriceList(b.size_prices)) }),
    ...(b.colors === undefined ? {} : { colors: JSON.stringify(colorList(b.colors)) }),
    images: JSON.stringify(strList(b.images, "images", { maxItems: 20, maxLen: 500, pattern: URL_RE })),
    status: oneOf(b.status ?? "active", "status", ["active", "draft", "archived"]),
    is_featured: bool(b.is_featured) ? 1 : 0,
    sort_order: num(b.sort_order ?? 0, "sort order", { int: true, min: 0, max: 100000 }),
    seo_title: str(b.seo_title, "SEO title", { optional: true, max: 80 }),
    seo_description: str(b.seo_description, "SEO description", { optional: true, max: 200 }),
  };
}

async function ensureUnique(field, value, id) {
  if (!value) return;
  const [rows] = await pool.query(`SELECT id FROM products WHERE ${field} = ? AND id <> ?`, [value, id || 0]);
  if (rows.length) throw new HttpError(409, field === "slug" ? "Another product already uses this web address (slug)" : "Another product already uses this SKU", { field });
}

router.get("/products", ah(async (req, res) => {
  await assignProductCodes();   // anything added straight into the database
  const { page, limit, offset } = paging(req.query);
  const where = [], args = [];
  if (req.query.search) {
    const s = `%${req.query.search}%`, code = String(req.query.search).trim().match(/^nt-?0*([1-9]\d{0,8})$/i);   // "NT-09"
    where.push(`(p.name LIKE ? OR p.sku LIKE ? OR p.slug LIKE ?${code ? " OR p.code_no = ?" : ""})`); args.push(s, s, s, ...(code ? [Number(code[1])] : []));
  }
  if (req.query.category) { where.push("p.category_id = ?"); args.push(Number(req.query.category)); }
  if (["active", "draft", "archived"].includes(req.query.status)) { where.push("p.status = ?"); args.push(req.query.status); }
  if (req.query.stock === "low") where.push("p.stock > 0 AND p.stock <= p.low_stock_threshold");
  if (req.query.stock === "out") where.push("p.stock = 0");
  const sorts = { newest: "p.created_at DESC", name: "p.name", price_asc: "p.price", price_desc: "p.price DESC", stock: "p.stock", order: "p.sort_order, p.id" };
  const order = sorts[req.query.sort] || sorts.order;
  const w = where.length ? "WHERE " + where.join(" AND ") : "";
  const [rows] = await pool.query(
    `SELECT p.*, c.name AS category_name,
       (SELECT COALESCE(SUM(oi.qty),0) FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE oi.product_id = p.id AND o.status NOT IN ('cancelled','returned')) AS units_sold
     FROM products p LEFT JOIN categories c ON c.id = p.category_id ${w} ORDER BY ${order} LIMIT ? OFFSET ?`, [...args, limit, offset]);
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM products p ${w}`, args);
  res.json({ rows: rows.map((r) => ({ ...shape(r), units_sold: Number(r.units_sold) })), total, page, limit });
}));

router.get("/products/:id", ah(async (req, res) => {
  const [rows] = await pool.query("SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?", [req.params.id]);
  if (!rows[0]) throw new HttpError(404, "Product not found");
  const [sales] = await pool.query(
    `SELECT COALESCE(SUM(oi.qty),0) AS units, COALESCE(SUM(oi.line_total),0) AS revenue, COUNT(DISTINCT o.id) AS orders
     FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.product_id = ? AND o.status NOT IN ('cancelled','returned')`, [req.params.id]);
  res.json({ ...shape(rows[0]), sales: { units: Number(sales[0].units), revenue: Number(sales[0].revenue), orders: sales[0].orders } });
}));

router.post("/products", canEdit, ah(async (req, res) => {
  const p = readProduct(req.body || {});
  await ensureUnique("slug", p.slug); await ensureUnique("sku", p.sku);
  const [r] = await pool.query("INSERT INTO products SET ?", [p]);
  await assignProductCodes();
  await audit(req, "product.create", "product", r.insertId, { name: p.name, price: p.price, stock: p.stock });
  res.status(201).json({ id: r.insertId });
}));

router.put("/products/:id", canEdit, ah(async (req, res) => {
  const id = Number(req.params.id);
  const [old] = await pool.query("SELECT * FROM products WHERE id = ?", [id]);
  if (!old[0]) throw new HttpError(404, "Product not found");
  const p = readProduct(req.body || {});
  await ensureUnique("slug", p.slug, id); await ensureUnique("sku", p.sku, id);
  await pool.query("UPDATE products SET ? WHERE id = ?", [p, id]);
  // record what changed, so the activity log is useful
  const changes = {};
  for (const k of ["name", "price", "mrp", "stock", "status", "category_id", "is_featured"]) {
    const before = old[0][k] == null ? null : String(Number.isNaN(Number(old[0][k])) ? old[0][k] : Number(old[0][k]));
    const after = p[k] == null ? null : String(Number.isNaN(Number(p[k])) ? p[k] : Number(p[k]));
    if (before !== after) changes[k] = [old[0][k], p[k]];
  }
  await audit(req, "product.update", "product", id, { name: p.name, changes });
  res.json({ ok: true });
}));

// Quick stock change from the list (staff can do this too, e.g. after a delivery arrives)
router.patch("/products/:id/stock", ah(async (req, res) => {
  const stock = num(req.body?.stock, "stock", { int: true, min: 0, max: 1000000 });
  const [old] = await pool.query("SELECT name, stock FROM products WHERE id = ?", [req.params.id]);
  if (!old[0]) throw new HttpError(404, "Product not found");
  await pool.query("UPDATE products SET stock = ? WHERE id = ?", [stock, req.params.id]);
  await audit(req, "product.stock", "product", req.params.id, { name: old[0].name, from: old[0].stock, to: stock });
  res.json({ ok: true });
}));

router.delete("/products/:id", canEdit, ah(async (req, res) => {
  const [old] = await pool.query("SELECT name FROM products WHERE id = ?", [req.params.id]);
  if (!old[0]) throw new HttpError(404, "Product not found");
  const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM order_items WHERE product_id = ?", [req.params.id]);
  if (n > 0) {
    // keep products that appear in orders, so order history stays complete
    await pool.query("UPDATE products SET status = 'archived' WHERE id = ?", [req.params.id]);
    await audit(req, "product.archive", "product", req.params.id, { name: old[0].name, reason: "has orders" });
    return res.json({ archived: true, message: "This product is in past orders, so it was archived instead of deleted." });
  }
  await pool.query("DELETE FROM products WHERE id = ?", [req.params.id]);
  await audit(req, "product.delete", "product", req.params.id, { name: old[0].name });
  res.json({ deleted: true });
}));

/* ---------- Categories ---------- */
router.get("/categories", ah(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT c.*, COUNT(p.id) AS product_count, SUM(p.status = 'active') AS active_count
     FROM categories c LEFT JOIN products p ON p.category_id = c.id GROUP BY c.id ORDER BY c.sort_order, c.name`);
  res.json(rows.map((r) => ({ ...r, is_active: !!r.is_active, product_count: Number(r.product_count), active_count: Number(r.active_count || 0) })));
}));

const readCategory = (b) => {
  const name = str(b.name, "name", { min: 2, max: 100 });
  return {
    name, slug: slugify(str(b.slug, "slug", { optional: true, max: 60 }) || name),
    sort_order: num(b.sort_order ?? 0, "sort order", { int: true, min: 0, max: 10000 }),
    is_active: b.is_active === undefined ? 1 : bool(b.is_active) ? 1 : 0,
  };
};

router.post("/categories", canEdit, ah(async (req, res) => {
  const c = readCategory(req.body || {});
  const [d] = await pool.query("SELECT id FROM categories WHERE slug = ?", [c.slug]);
  if (d.length) throw new HttpError(409, "A category with this web address (slug) already exists");
  const [r] = await pool.query("INSERT INTO categories SET ?", [c]);
  await audit(req, "category.create", "category", r.insertId, { name: c.name });
  res.status(201).json({ id: r.insertId });
}));

router.put("/categories/:id", canEdit, ah(async (req, res) => {
  const c = readCategory(req.body || {});
  const [d] = await pool.query("SELECT id FROM categories WHERE slug = ? AND id <> ?", [c.slug, req.params.id]);
  if (d.length) throw new HttpError(409, "A category with this web address (slug) already exists");
  const [r] = await pool.query("UPDATE categories SET ? WHERE id = ?", [c, req.params.id]);
  if (!r.affectedRows) throw new HttpError(404, "Category not found");
  await audit(req, "category.update", "category", req.params.id, c);
  res.json({ ok: true });
}));

router.delete("/categories/:id", canEdit, ah(async (req, res) => {
  const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM products WHERE category_id = ?", [req.params.id]);
  if (n > 0) throw new HttpError(409, `Move or delete the ${n} product${n > 1 ? "s" : ""} in this category first`);
  const [old] = await pool.query("SELECT name FROM categories WHERE id = ?", [req.params.id]);
  if (!old[0]) throw new HttpError(404, "Category not found");
  await pool.query("DELETE FROM categories WHERE id = ?", [req.params.id]);
  await audit(req, "category.delete", "category", req.params.id, { name: old[0].name });
  res.json({ ok: true });
}));

export default router;
