/* Admin SEO page: site-wide settings, per-page and per-product titles/descriptions, verification
   and analytics codes, plus a health check. Everyone can view; owners and managers can change. */
import express from "express";
import { pool } from "../../config/db.js";
import { ah, HttpError, str, bool, URL_RE } from "../../lib/http.js";
import { audit } from "../../lib/store.js";
import { requireRole } from "../../middleware/auth.js";
import { seoConfig, buildSeo, sitemapXml, robotsTxt, PAGES } from "../../lib/seo.js";

const router = express.Router();
const canEdit = requireRole("owner", "manager");

const save = (key, value) => pool.query("INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [key, value ?? ""]);

router.get("/seo", ah(async (req, res) => {
  const c = await seoConfig();
  const [products] = await pool.query(
    `SELECT p.id, p.slug, p.name, p.description, p.seo_title, p.seo_description, p.images, p.status, c.name AS category_name
     FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.status = 'active' ORDER BY p.sort_order, p.id`);
  // the final title/description the store will actually use, so the admin sees real previews
  const withFinal = await Promise.all(products.map(async (p) => {
    const s = await buildSeo(`/product/${p.slug}`, c);
    return { ...p, images: undefined, hasImage: (Array.isArray(p.images) ? p.images : []).length > 0, finalTitle: s.title, finalDescription: s.description, url: s.canonical };
  }));
  const pages = await Promise.all(c.pages.map(async (p) => {
    const s = await buildSeo(p.path, c);
    return { key: p.key, path: p.path, label: p.label, title: p.title === p.defaultTitle ? "" : p.title, description: p.description === p.defaultDescription ? "" : p.description,
      defaultTitle: p.defaultTitle, defaultDescription: p.defaultDescription, noindex: p.noindex, lockedNoindex: !!PAGES.find((x) => x.key === p.key).noindex,
      finalTitle: s.title, finalDescription: s.description, url: abs(c.siteUrl, p.path), structuredData: s.jsonLd.map((j) => [].concat(j["@type"]).join("/")) };
  }));
  const { count } = await sitemapXml();
  res.json({
    settings: {
      site_url: c.siteUrl, title_template: c.template, default_title: c.defaultTitle, default_description: c.defaultDescription,
      share_image: c.shareImage, logo_url: c.logo, twitter_handle: c.twitter, social_links: c.social.join("\n"),
      indexing: c.indexing, robots_extra: c.robotsExtra, google_verification: c.google, bing_verification: c.bing, ga4_id: c.ga4,
    },
    pages, products: withFinal, sitemapUrls: count, robots: await robotsTxt(),
  });
}));
const abs = (base, p) => base.replace(/\/+$/, "") + p;

const RULES = {
  site_url: (v) => str(v, "site address", { max: 200, pattern: /^https?:\/\/[^\s/]+(\/[^\s]*)?$/i, msg: "Site address must start with https:// (e.g. https://nawaratrend.com)" }).replace(/\/+$/, ""),
  title_template: (v) => { const s = str(v, "title template", { max: 80 }); if (!s.includes("%s")) throw new HttpError(400, "The title template must contain %s where the page title goes", { field: "title_template" }); return s; },
  default_title: (v) => str(v, "home page title", { min: 10, max: 80 }),
  default_description: (v) => str(v, "default description", { min: 50, max: 200 }),
  share_image: (v) => str(v, "share image", { optional: true, max: 500, pattern: URL_RE }) || "",
  logo_url: (v) => str(v, "logo", { optional: true, max: 500, pattern: URL_RE }) || "",
  twitter_handle: (v) => str(v, "X / Twitter handle", { optional: true, max: 30, pattern: /^@?[A-Za-z0-9_]{1,15}$/ })?.replace(/^@?/, "@") || "",
  social_links: (v) => String(v || "").split(/\s+/).filter(Boolean).map((u, i) => str(u, `social link ${i + 1}`, { max: 300, pattern: URL_RE })).slice(0, 10).join("\n"),
  indexing: (v) => (bool(v) ? "1" : "0"),
  robots_extra: (v) => str(v, "extra robots rules", { optional: true, max: 2000 }) || "",
  google_verification: (v) => str(v, "Google verification code", { optional: true, max: 120, pattern: /^[A-Za-z0-9_-]+$/, msg: "Paste only the code from content=\"…\"" }) || "",
  bing_verification: (v) => str(v, "Bing verification code", { optional: true, max: 120, pattern: /^[A-Za-z0-9_-]+$/, msg: "Paste only the code from content=\"…\"" }) || "",
  ga4_id: (v) => str(v, "Google Analytics ID", { optional: true, max: 20, pattern: /^G-[A-Z0-9]{4,14}$/i, msg: "Google Analytics IDs look like G-XXXXXXXXXX" })?.toUpperCase() || "",
};

router.put("/seo/settings", canEdit, ah(async (req, res) => {
  const changed = [];
  for (const [k, rule] of Object.entries(RULES)) {
    if (req.body?.[k] === undefined) continue;
    await save(`seo.${k}`, rule(req.body[k]));
    changed.push(k);
  }
  await audit(req, "seo.settings", "seo", null, { changed });
  res.json({ ok: true });
}));

router.put("/seo/pages/:key", canEdit, ah(async (req, res) => {
  const page = PAGES.find((p) => p.key === req.params.key);
  if (!page) throw new HttpError(404, "Page not found");
  const title = str(req.body?.title, "title", { optional: true, max: 70 }) || "";
  const description = str(req.body?.description, "description", { optional: true, max: 200 }) || "";
  await save(`seo.page.${page.key}.title`, title);
  await save(`seo.page.${page.key}.description`, description);
  if (!page.noindex) await save(`seo.page.${page.key}.noindex`, bool(req.body?.noindex) ? "1" : "0");
  await audit(req, "seo.page", "seo", page.key, { name: page.label, title, noindex: !!req.body?.noindex });
  res.json({ ok: true });
}));

router.put("/seo/products/:id", canEdit, ah(async (req, res) => {
  const seo_title = str(req.body?.seo_title, "title", { optional: true, max: 80 });
  const seo_description = str(req.body?.seo_description, "description", { optional: true, max: 200 });
  const [r] = await pool.query("UPDATE products SET seo_title = ?, seo_description = ? WHERE id = ?", [seo_title, seo_description, req.params.id]);
  if (!r.affectedRows) throw new HttpError(404, "Product not found");
  const [[p]] = await pool.query("SELECT name FROM products WHERE id = ?", [req.params.id]);
  await audit(req, "seo.product", "product", req.params.id, { name: p.name, seo_title, seo_description });
  res.json({ ok: true });
}));

export default router;
