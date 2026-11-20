/* Puts each page's SEO tags in <head> after the page changes: title, description, canonical,
   robots, Open Graph / Twitter cards, verification codes and structured data (JSON-LD).
   The server builds them (GET /api/store/seo, see server/src/lib/seo.js) from the admin SEO settings,
   and in production writes the same tags into the HTML, so this just keeps them right as you browse. */
import { BASE_URL } from "../services/api.js";
import { trackPage } from "./consent.js";

let lastPath = null;
/** The SEO title of the current page (the Shop page falls back to it when no category is chosen). */
export let pageTitle = "";

function setMeta(attr, key, value) {
  if (!value) return;
  const el = document.createElement("meta");
  el.setAttribute(attr, key);
  el.content = String(value);
  el.dataset.seo = "";
  document.head.appendChild(el);
}

export async function applySeo(path = location.pathname) {
  let seo;
  try {
    const r = await fetch(`${BASE_URL}/store/seo?path=${encodeURIComponent(path)}`);
    if (!r.ok) return;
    seo = await r.json();
  } catch { return; }
  if (path !== location.pathname) return;   // the visitor already moved on

  document.querySelectorAll("head [data-seo]").forEach((el) => el.remove());
  // the static fallbacks from index.html (or the server's versions) are replaced, not duplicated
  document.querySelectorAll('head meta[name="description"]').forEach((el) => el.remove());

  pageTitle = seo.title;
  document.title = seo.title;
  const desc = document.createElement("meta");
  desc.name = "description"; desc.content = seo.description || ""; desc.dataset.seo = "";
  document.head.appendChild(desc);
  setMeta("name", "robots", seo.robots);
  if (seo.canonical) {
    const link = document.createElement("link");
    link.rel = "canonical"; link.href = seo.canonical; link.dataset.seo = "";
    document.head.appendChild(link);
  }
  setMeta("property", "og:type", seo.type);
  setMeta("property", "og:site_name", seo.siteName);
  setMeta("property", "og:locale", seo.locale);
  setMeta("property", "og:title", seo.title);
  setMeta("property", "og:description", seo.description);
  setMeta("property", "og:url", seo.canonical);
  setMeta("property", "og:image", seo.image);
  if (seo.image) setMeta("property", "og:image:alt", seo.imageAlt || seo.title);
  if (seo.product) {
    setMeta("property", "product:price:amount", seo.product.price);
    setMeta("property", "product:price:currency", seo.product.currency);
    setMeta("property", "product:availability", seo.product.availability);
  }
  setMeta("name", "twitter:card", seo.image ? "summary_large_image" : "summary");
  setMeta("name", "twitter:site", seo.twitter);
  setMeta("name", "twitter:title", seo.title);
  setMeta("name", "twitter:description", seo.description);
  setMeta("name", "twitter:image", seo.image);
  for (const [attr, key, value] of seo.meta || []) setMeta(attr, key, value);
  setMeta("name", "google-site-verification", seo.google);
  setMeta("name", "msvalidate.01", seo.bing);
  for (const data of seo.jsonLd || []) {
    const s = document.createElement("script");
    s.type = "application/ld+json"; s.dataset.seo = "";
    s.textContent = JSON.stringify(data);
    document.head.appendChild(s);
  }

  if (path !== lastPath) { lastPath = path; trackPage(seo.ga4, path, document.title); }
}
