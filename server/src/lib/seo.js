/* SEO for every storefront URL: title, description, canonical, robots, social cards and
   structured data (JSON-LD). Used by GET /api/store/seo (the shop applies it after each page
   change), by the sitemap, and by the production server, which writes the same tags into the
   HTML so search engines see them without running JavaScript. Editable on the admin SEO page. */
import { pool } from "../config/db.js";
import { getSettings } from "./store.js";
import { jsonList } from "./http.js";

/* Fixed pages. `title`/`description` are the defaults; the admin can override each one. */
export const PAGES = [
  { key: "home", path: "/", label: "Home", priority: 1.0, freq: "daily",
    title: "", description: "" },   // empty = use the site-wide default title/description
  { key: "shop", path: "/shop", label: "Shop", priority: 0.9, freq: "daily",
    title: "Shop all products", description: "Browse our handpicked electronics, fashion, home & kitchen, beauty, kids and accessories. Genuine products, fair prices, free delivery on orders ₹999+." },
  { key: "about", path: "/about", label: "About us", priority: 0.5, freq: "monthly",
    title: "About us", description: "NawaraTrend is an online store from Lucknow with a short, handpicked range of everyday products, each one quality-checked before it reaches you." },
  { key: "contact", path: "/contact", label: "Contact", priority: 0.5, freq: "monthly",
    title: "Contact us", description: "Questions about an order, a return or a product? Call, WhatsApp or message NawaraTrend. We usually reply quickly." },
  { key: "faqs", path: "/faqs", label: "FAQs", priority: 0.6, freq: "monthly",
    title: "Frequently asked questions", description: "Answers about delivery times, free shipping, Cash on Delivery, returns, refunds, payments and your NawaraTrend account." },
  { key: "shipping", path: "/shipping-policy", label: "Shipping Policy", priority: 0.3, freq: "yearly",
    title: "Shipping policy", description: "How NawaraTrend delivers across India: dispatch in 1–2 business days, delivery times by region, charges and Cash on Delivery." },
  { key: "returns", path: "/refund-policy", label: "Returns & Refunds", priority: 0.3, freq: "yearly",
    title: "Returns & refunds", description: "7-day returns on most items, free replacements for damaged products, and refunds in 5–7 business days." },
  { key: "privacy", path: "/privacy-policy", label: "Privacy Policy", priority: 0.2, freq: "yearly",
    title: "Privacy policy", description: "How NawaraTrend collects, uses and protects your personal data, and your rights under India's DPDP Act, 2023." },
  { key: "terms", path: "/terms", label: "Terms & Conditions", priority: 0.2, freq: "yearly",
    title: "Terms & conditions", description: "The terms for shopping with NawaraTrend: orders, payments, delivery, returns and your rights." },
  { key: "checkout", path: "/checkout", label: "Checkout", noindex: true,
    title: "Checkout", description: "Complete your NawaraTrend order." },
  { key: "login", path: "/login", label: "Sign in", noindex: true,
    title: "Sign in", description: "Sign in to your NawaraTrend account to check out faster and track your orders." },
  // private pages: /account also covers /account/profile, /account/orders/NT… (prefix)
  { key: "account", path: "/account", prefix: true, label: "My account", noindex: true,
    title: "My account", description: "Your NawaraTrend profile, orders and order tracking." },
  { key: "track", path: "/track", label: "Track your order", noindex: true,
    title: "Track your order", description: "Follow your NawaraTrend order with its order number and the mobile number used at checkout." },
  { key: "reset", path: "/reset-password", label: "Reset password", noindex: true,
    title: "Reset your password", description: "Choose a new password for your NawaraTrend account." },
];

const clip = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s; };
const abs = (base, p) => base.replace(/\/+$/, "") + p;
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inr = (n) => `₹${Number(n).toLocaleString("en-IN")}`;
const days = (min, max) => ({ "@type": "QuantitativeValue", minValue: min, maxValue: max, unitCode: "DAY" });

/** Active categories that have at least one active product (the ones with a page of their own). */
async function liveCategories() {
  const [rows] = await pool.query(
    `SELECT c.slug, c.name, COUNT(p.id) AS n, MIN(p.price) AS min_price, MAX(p.updated_at) AS updated_at FROM categories c
     JOIN products p ON p.category_id = c.id AND p.status = 'active' WHERE c.is_active = 1 GROUP BY c.id ORDER BY c.sort_order, c.name`);
  return rows;
}

/** SEO settings with each page's overrides merged in. */
export async function seoConfig() {
  const s = await getSettings();
  const g = (k, d = "") => (s[`seo.${k}`] ?? d);
  const pages = PAGES.map((p) => ({
    ...p,
    defaultTitle: p.title, defaultDescription: p.description,
    title: g(`page.${p.key}.title`) || p.title,
    description: g(`page.${p.key}.description`) || p.description,
    noindex: p.noindex || g(`page.${p.key}.noindex`) === "1",
  }));
  return {
    store: s,
    siteUrl: (g("site_url") || "http://localhost:3001").replace(/\/+$/, ""),
    template: g("title_template") || "%s | NawaraTrend",
    defaultTitle: g("default_title"), defaultDescription: g("default_description"),
    shareImage: g("share_image"), logo: g("logo_url"), twitter: g("twitter_handle"),
    social: g("social_links").split(/\s+/).filter((u) => /^https?:\/\//.test(u)),
    indexing: g("indexing", "1") !== "0",
    robotsExtra: g("robots_extra"),
    google: g("google_verification"), bing: g("bing_verification"), ga4: g("ga4_id"),
    pages,
  };
}

const organization = (c) => ({
  "@type": ["Organization", "OnlineStore"], "@id": `${c.siteUrl}/#organization`,
  name: c.store.store_name || "NawaraTrend", url: `${c.siteUrl}/`, logo: c.logo || undefined,
  sameAs: c.social.length ? c.social : undefined,
  contactPoint: [{ "@type": "ContactPoint", telephone: c.store.phone, contactType: "customer service", areaServed: "IN", availableLanguage: ["en", "hi"] }],
  address: c.store.address ? { "@type": "PostalAddress", streetAddress: c.store.address.split(",").slice(0, 2).join(",").trim(), addressLocality: "Lucknow", addressRegion: "Uttar Pradesh", postalCode: (c.store.address.match(/\b\d{6}\b/) || [])[0], addressCountry: "IN" } : undefined,
});
const breadcrumbs = (c, items) => ({
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: abs(c.siteUrl, path) })),
});

const crumbHtml = (items) => `<nav aria-label="Breadcrumb"><ol>${items.map(([n, p], i) => `<li>${i === items.length - 1 ? esc(n) : `<a href="${esc(p)}">${esc(n)}</a>`}</li>`).join("")}</ol></nav>`;

let faqData = null;
async function faqs() {
  if (faqData) return faqData;
  try {
    const m = await import("../../../client/src/storefront/policies/faqs.js");
    faqData = m.FAQS.map((f) => ({ q: f.q, a: f.a.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() }));
  } catch { faqData = []; }
  return faqData;
}

/** Everything the <head> needs for a storefront path. */
export async function buildSeo(rawPath, conf) {
  const c = conf || (await seoConfig());
  const path = ("/" + String(rawPath || "/").split(/[?#]/)[0].replace(/^\/+/, "")).replace(/\/+$/, "") || "/";
  const name = c.store.store_name || "NawaraTrend";
  const full = (t) => (t ? c.template.replace("%s", t) : c.defaultTitle || name);
  const out = {
    status: 200, path, siteName: name, locale: "en_IN",
    title: full(""), description: c.defaultDescription, canonical: abs(c.siteUrl, path === "/" ? "/" : path),
    image: c.shareImage, type: "website", robots: "index, follow, max-image-preview:large, max-snippet:-1",
    twitter: c.twitter, google: c.google, bing: c.bing, ga4: c.ga4, jsonLd: [],
    meta: [],     // extra [attribute, key, value] tags, e.g. product brand and price labels for share cards
    ssr: null,    // the page's main content as plain HTML, for crawlers that don't run JavaScript
  };
  const cats = await liveCategories();

  const product = path.match(/^\/product\/([a-z0-9-]+)$/);
  if (product) {
    const [rows] = await pool.query(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.slug = ? AND p.status = 'active'`, [product[1]]);
    const p = rows[0];
    if (!p) {
      Object.assign(out, { status: 404, title: full("Product not found"), description: "This product isn't available any more.", robots: "noindex, follow" });
    } else {
      const price = Number(p.price), mrp = Number(p.mrp), off = mrp > price ? Math.round((1 - price / mrp) * 100) : 0;
      const images = jsonList(p.images);
      Object.assign(out, {
        title: full(p.seo_title || `${p.name} at ₹${price.toLocaleString("en-IN")}${off ? ` (${off}% off)` : ""}`),
        description: p.seo_description || clip(`${String(p.description || p.name).replace(/[.!\s]+$/, "")}. ${off ? `Now ${off}% off. ` : ""}100% genuine, free delivery on orders ₹${c.store.free_shipping_threshold.toLocaleString("en-IN")}+.`, 160),
        image: images[0] || c.shareImage, imageAlt: p.name, type: "product",
        product: { price, currency: "INR", availability: p.stock > 0 ? "in stock" : "out of stock" },
      });
      out.meta.push(["property", "product:brand", name], ["property", "product:condition", "new"], ["property", "product:retailer_item_id", p.sku || p.slug],
        ["name", "twitter:label1", "Price"], ["name", "twitter:data1", `${inr(price)}${off ? ` (${off}% off)` : ""}`],
        ["name", "twitter:label2", "Availability"], ["name", "twitter:data2", p.stock > 0 ? "In stock" : "Out of stock"]);
      out.jsonLd.push({
        "@type": "Product", "@id": `${out.canonical}#product`, name: p.name, description: clip(p.description || p.name, 5000),
        sku: p.sku || p.slug, image: images.length ? images : c.shareImage ? [c.shareImage] : undefined,
        brand: { "@type": "Brand", name }, category: p.category_name || undefined, url: out.canonical,
        offers: {
          "@type": "Offer", url: out.canonical, priceCurrency: "INR", price: price.toFixed(2),
          // the MRP, so Google can show the saving as a struck-through price
          priceSpecification: off ? [
            { "@type": "UnitPriceSpecification", price: price.toFixed(2), priceCurrency: "INR" },
            { "@type": "UnitPriceSpecification", priceType: "https://schema.org/StrikethroughPrice", price: mrp.toFixed(2), priceCurrency: "INR" },
          ] : undefined,
          availability: p.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
          itemCondition: "https://schema.org/NewCondition", seller: { "@id": `${c.siteUrl}/#organization` },
          shippingDetails: { "@type": "OfferShippingDetails", shippingDestination: { "@type": "DefinedRegion", addressCountry: "IN" },
            shippingRate: { "@type": "MonetaryAmount", value: price >= c.store.free_shipping_threshold ? 0 : c.store.delivery_fee, currency: "INR" },
            // packed in 1–2 business days, then 1–12 days in transit depending on the region (see the Shipping policy)
            deliveryTime: { "@type": "ShippingDeliveryTime", handlingTime: days(1, 2), transitTime: days(1, 12) } },
          hasMerchantReturnPolicy: { "@type": "MerchantReturnPolicy", applicableCountry: "IN", returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
            merchantReturnDays: 7, returnMethod: "https://schema.org/ReturnByMail" },
        },
        aggregateRating: p.review_count > 0 && Number(p.rating) > 0
          ? { "@type": "AggregateRating", ratingValue: Number(p.rating), reviewCount: p.review_count, bestRating: 5 } : undefined,
      });
      const crumbs = [["Home", "/"], ["Shop", "/shop"], ...(p.category_name ? [[p.category_name, `/shop/${p.category_slug}`]] : []), [p.name, path]];
      out.jsonLd.push(breadcrumbs(c, crumbs));
      const highlights = jsonList(p.highlights);
      out.ssr = crumbHtml(crumbs) + `<article><h1>${esc(p.name)}</h1>`
        + `<p><strong>${inr(price)}</strong>${off ? ` <s>MRP ${inr(mrp)}</s> (${off}% off)` : ""}. ${p.stock > 0 ? "In stock" : "Out of stock"}.</p>`
        + String(p.description || "").split(/\n\s*\n/).map((t) => `<p>${esc(t.trim())}</p>`).join("")
        + (highlights.length ? `<h2>Highlights</h2><ul>${highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : "")
        + images.map((src, i) => `<img src="${esc(src)}" alt="${esc(`${p.name}, photo ${i + 1} of ${images.length}`)}" loading="lazy">`).join("")
        + (p.category_name ? `<p>More in <a href="/shop/${esc(p.category_slug)}">${esc(p.category_name)}</a></p>` : "") + `</article>`;
    }
  } else if (path.match(/^\/shop\/([a-z0-9-]+)$/)) {
    const slug = path.split("/")[2];
    const cat = cats.find((x) => x.slug === slug);
    if (!cat) {
      Object.assign(out, { status: 404, title: full("Category not found"), description: "This category isn't available any more.", robots: "noindex, follow" });
    } else {
      const [items] = await pool.query(
        `SELECT p.slug, p.name, p.price, p.images FROM products p JOIN categories c ON c.id = p.category_id
         WHERE c.slug = ? AND p.status = 'active' ORDER BY p.sort_order, p.id`, [slug]);
      const n = items.length, first = jsonList(items[0]?.images)[0];
      const desc = clip(`Shop ${cat.name} online at NawaraTrend: ${n} handpicked product${n > 1 ? "s" : ""} from ${inr(cat.min_price)}. 100% genuine, Cash on Delivery and free delivery on orders ${inr(c.store.free_shipping_threshold)}+.`, 160);
      Object.assign(out, { title: full(`${cat.name}: Buy Online at the Best Price`), description: desc, image: first || c.shareImage, imageAlt: cat.name });
      const crumbs = [["Home", "/"], ["Shop", "/shop"], [cat.name, path]];
      out.jsonLd.push({
        "@type": "CollectionPage", "@id": `${out.canonical}#page`, name: cat.name, description: desc, url: out.canonical, inLanguage: "en-IN",
        isPartOf: { "@id": `${c.siteUrl}/#website` },
        mainEntity: { "@type": "ItemList", numberOfItems: n,
          itemListElement: items.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: abs(c.siteUrl, `/product/${p.slug}`), name: p.name })) },
      }, breadcrumbs(c, crumbs));
      out.ssr = crumbHtml(crumbs) + `<h1>${esc(cat.name)}</h1><p>${esc(desc)}</p><ul>`
        + items.map((p) => `<li><a href="/product/${esc(p.slug)}">${esc(p.name)}</a>, ${inr(p.price)}</li>`).join("") + `</ul>`;
    }
  } else {
    const page = c.pages.find((x) => x.path === path || (x.prefix && path.startsWith(x.path + "/")));
    if (!page) {
      Object.assign(out, { status: 404, title: full("Page not found"), robots: "noindex, follow" });
    } else {
      out.title = page.key === "home" ? (page.title ? full(page.title) : full("")) : full(page.title);
      out.description = page.description || c.defaultDescription;
      out.ssr = `<h1>${esc(page.key === "home" ? name : page.title || page.label)}</h1><p>${esc(out.description)}</p>`;
      if (page.noindex) out.robots = "noindex, follow";
      if (page.key === "home") {
        out.jsonLd.push(organization(c), { "@type": "WebSite", "@id": `${c.siteUrl}/#website`, name, url: `${c.siteUrl}/`, inLanguage: "en-IN", publisher: { "@id": `${c.siteUrl}/#organization` } });
      } else {
        if (!page.noindex) out.jsonLd.push(breadcrumbs(c, [["Home", "/"], [page.label, path]]));
      }
      if (page.key === "faqs") {
        const list = await faqs();
        if (list.length) out.jsonLd.push({ "@type": "FAQPage", mainEntity: list.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) });
      }
      if (page.key === "contact") out.jsonLd.push(organization(c));
    }
  }
  if (!c.indexing) out.robots = "noindex, nofollow";
  if (out.status === 404) out.canonical = null;   // missing pages have no canonical address
  // links to the main pages and every category, so crawlers can find the whole shop from any page
  out.ssr = `<nav aria-label="Site"><a href="/">${esc(name)}</a> <a href="/shop">Shop</a> `
    + cats.map((x) => `<a href="/shop/${esc(x.slug)}">${esc(x.name)}</a>`).join(" ")
    + ` <a href="/about">About</a> <a href="/contact">Contact</a> <a href="/faqs">FAQs</a></nav><main>${out.ssr || `<h1>${esc(out.title)}</h1>`}</main>`;
  out.jsonLd = out.jsonLd.map((x) => ({ "@context": "https://schema.org", ...JSON.parse(JSON.stringify(x)) }));   // drops undefined fields
  return out;
}

/* ---------- head HTML (for the production server) ---------- */
const attr = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
export function headHtml(seo) {
  const t = [];
  const meta = (k, v, prop) => v && t.push(`<meta ${prop ? "property" : "name"}="${k}" content="${attr(v)}" data-seo>`);
  t.push(`<title data-seo>${attr(seo.title)}</title>`);
  meta("description", seo.description);
  meta("robots", seo.robots);
  if (seo.canonical) t.push(`<link rel="canonical" href="${attr(seo.canonical)}" data-seo>`);
  meta("og:type", seo.type, 1); meta("og:site_name", seo.siteName, 1); meta("og:locale", seo.locale, 1);
  meta("og:title", seo.title, 1); meta("og:description", seo.description, 1); meta("og:url", seo.canonical, 1); meta("og:image", seo.image, 1); if (seo.image) meta("og:image:alt", seo.imageAlt || seo.title, 1);
  if (seo.product) { meta("product:price:amount", seo.product.price, 1); meta("product:price:currency", seo.product.currency, 1); meta("product:availability", seo.product.availability, 1); }
  meta("twitter:card", seo.image ? "summary_large_image" : "summary"); meta("twitter:site", seo.twitter);
  meta("twitter:title", seo.title); meta("twitter:description", seo.description); meta("twitter:image", seo.image);
  for (const [a, k, v] of seo.meta || []) meta(k, v, a === "property");
  meta("google-site-verification", seo.google); meta("msvalidate.01", seo.bing);
  for (const j of seo.jsonLd) t.push(`<script type="application/ld+json" data-seo>${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`);
  return t.join("\n    ");
}

/** The page's content as plain HTML, put inside #root for crawlers that don't run JavaScript.
    It is visually hidden (the shop draws the same content), and React replaces it when the page starts. */
export function bodyHtml(seo) {
  if (!seo.ssr) return "";
  return `<div style="position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0)">${seo.ssr}</div>`;
}

/* ---------- sitemap.xml and robots.txt ---------- */
const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export async function sitemapXml() {
  const c = await seoConfig();
  const [products] = await pool.query(
    `SELECT p.slug, p.name, p.images, p.updated_at FROM products p JOIN categories c ON c.id = p.category_id AND c.is_active = 1
     WHERE p.status = 'active' ORDER BY p.sort_order, p.id`);
  const urls = c.pages.filter((p) => !p.noindex).map((p) => `  <url><loc>${xml(abs(c.siteUrl, p.path))}</loc><changefreq>${p.freq}</changefreq><priority>${p.priority.toFixed(1)}</priority></url>`);
  if (c.indexing) for (const k of await liveCategories())
    urls.push(`  <url><loc>${xml(abs(c.siteUrl, `/shop/${k.slug}`))}</loc><lastmod>${new Date(k.updated_at).toISOString().slice(0, 10)}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`);
  for (const p of products) {
    const imgs = jsonList(p.images).slice(0, 10).map((src) => `<image:image><image:loc>${xml(src)}</image:loc><image:title>${xml(p.name)}</image:title></image:image>`).join("");
    urls.push(`  <url><loc>${xml(abs(c.siteUrl, `/product/${p.slug}`))}</loc><lastmod>${new Date(p.updated_at).toISOString().slice(0, 10)}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority>${imgs}</url>`);
  }
  return { count: urls.length, body: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.join("\n")}\n</urlset>\n` };
}

export async function robotsTxt() {
  const c = await seoConfig();
  const lines = c.indexing
    ? ["User-agent: *", "Allow: /", "Disallow: /admin", "Disallow: /api/", "Disallow: /checkout", "Disallow: /login", ...c.pages.filter((p) => p.noindex && !["checkout", "login"].includes(p.key)).map((p) => `Disallow: ${p.path}`)]
    : ["# Search engines are asked not to index this site (SEO > Indexing is off in the admin panel)", "User-agent: *", "Disallow: /"];
  if (c.robotsExtra.trim()) lines.push("", c.robotsExtra.trim());
  lines.push("", `Sitemap: ${c.siteUrl}/sitemap.xml`);
  return lines.join("\n") + "\n";
}
