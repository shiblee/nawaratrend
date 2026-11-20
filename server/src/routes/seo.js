/* Public SEO routes: /sitemap.xml, /robots.txt, /api/store/seo, and (in production) the HTML
   for every storefront page with its title, meta tags and structured data already in <head>. */
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ah } from "../lib/http.js";
import { bodyHtml, buildSeo, headHtml, robotsTxt, sitemapXml } from "../lib/seo.js";

const router = express.Router();

router.get("/sitemap.xml", ah(async (req, res) => {
  const { body } = await sitemapXml();
  res.type("application/xml").set("Cache-Control", "public, max-age=3600").send(body);
}));

router.get("/robots.txt", ah(async (req, res) => {
  res.type("text/plain").set("Cache-Control", "public, max-age=3600").send(await robotsTxt());
}));

router.get("/api/store/seo", ah(async (req, res) => {
  const { ssr, ...seo } = await buildSeo(String(req.query.path || "/"));   // the shop draws its own content
  res.set("Cache-Control", "no-store").json(seo);
}));

/* Production: serve the built storefront (client/dist) with SEO tags written into each page.
   Turned on with SERVE_CLIENT=1 after `cd client && npm run build`. */
export function storefrontHtml(app) {
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../client/dist");
  const indexFile = path.join(dist, "index.html");
  if (!fs.existsSync(indexFile)) {
    console.warn(`SERVE_CLIENT=1 but ${indexFile} doesn't exist. Run "cd client && npm run build" first.`);
    return;
  }
  const template = fs.readFileSync(indexFile, "utf8")
    .replace(/<title>[\s\S]*?<\/title>/, "")
    .replace(/<meta name="description"[^>]*>/, "");
  app.use(express.static(dist, { index: false, maxAge: "7d", setHeaders: (res, file) => { if (file.endsWith(".html")) res.set("Cache-Control", "no-cache"); } }));
  app.get(/^\/(?!api\/).*/, ah(async (req, res) => {
    if (req.path.startsWith("/admin")) {
      return res.set("Cache-Control", "no-cache").send(template.replace("</head>", `<title>NawaraTrend Admin</title><meta name="robots" content="noindex, nofollow">\n</head>`));
    }
    const seo = await buildSeo(req.path);
    res.status(seo.status).set("Cache-Control", "no-cache").send(template.replace("</head>", `    ${headHtml(seo)}\n  </head>`).replace('<div id="root"></div>', `<div id="root">${bodyHtml(seo)}</div>`));
  }));
}

export default router;
