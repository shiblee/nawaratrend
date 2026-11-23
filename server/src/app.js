import fs from "fs";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import storeRoutes from "./routes/store.js";
import accountRoutes from "./routes/account.js";
import adminAuthRoutes from "./routes/admin/auth.js";
import adminCatalogRoutes from "./routes/admin/catalog.js";
import adminOrderRoutes from "./routes/admin/orders.js";
import adminSystemRoutes from "./routes/admin/system.js";
import adminSeoRoutes from "./routes/admin/seo.js";
import adminEmailRoutes from "./routes/admin/emails.js";
import seoRoutes, { storefrontHtml } from "./routes/seo.js";
import { requireAdmin, csrfProtect } from "./middleware/auth.js";
import adminCommRoutes from "./routes/admin/communication.js";
import { HttpError } from "./lib/http.js";

const app = express();
app.disable("x-powered-by");

// On cPanel / behind a proxy the visitor's real IP is in X-Forwarded-For (used by rate limits and the activity log)
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);

// One address for every page (good for SEO): https, and without "www." (or with, if CANONICAL_HOST says so)
const canonicalHost = process.env.CANONICAL_HOST;
if (canonicalHost) {
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    const proto = req.get("x-forwarded-proto") || req.protocol;
    if (req.hostname !== canonicalHost || proto !== "https") return res.redirect(301, `https://${canonicalHost}${req.originalUrl}`);
    next();
  });
}

// Only the storefront/admin website may call this API from a browser.
const origins = (process.env.CLIENT_ORIGIN || "http://localhost:3000,http://localhost:3001").split(",").map((s) => s.trim());
// Content Security Policy: only what the storefront needs (Google Fonts, product images from https,
// Google Analytics once a visitor accepts analytics cookies, and the logo's inline onerror fallback).
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'", "https://www.googletagmanager.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "https://*.google-analytics.com", "https://*.analytics.google.com", "https://www.googletagmanager.com"],
      frameAncestors: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null,
    },
  },
}));
// credentials: the storefront's sign-in is an HttpOnly cookie (only these origins may send it)
app.use(cors({ origin: (origin, cb) => cb(null, !origin || origins.includes(origin)), credentials: true, maxAge: 600 }));
// profile photos arrive as an image inside JSON (resized in the browser first), so that one route may send more
app.use("/api/store/account/avatar", express.json({ limit: "1mb" }));
app.use(express.json({ limit: "100kb" }));
app.use("/api", rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false, message: { message: "Too many requests. Please slow down." } }));

// the version this process started with (written by scripts/deploy.sh), so a deploy can tell when the new one is running
let build;
try { build = fs.readFileSync(new URL("../BUILD_ID", import.meta.url), "utf8").trim(); } catch { /* not deployed: no version */ }
app.get("/api/health", (req, res) => res.set("Cache-Control", "no-store").json({ status: "ok", build }));

// every change on the storefront API (sign-in, orders, contact form…) must carry the CSRF header
app.use("/api/store", csrfProtect, storeRoutes, accountRoutes);
app.use("/api/admin/auth", adminAuthRoutes);
app.use(seoRoutes);   // /sitemap.xml, /robots.txt, /api/store/seo
app.use("/api/admin", requireAdmin, adminCatalogRoutes, adminOrderRoutes, adminSystemRoutes, adminSeoRoutes, adminEmailRoutes, adminCommRoutes);

app.use("/api", (req, res) => res.status(404).json({ message: "Not found" }));

// production: serve the built storefront with SEO tags in every page (see routes/seo.js)
if (process.env.SERVE_CLIENT === "1") storefrontHtml(app);

// One place that turns errors into JSON. Unexpected errors are logged but their details stay private.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ message: err.message, ...(err.details || {}) });
  if (err.type === "entity.parse.failed") return res.status(400).json({ message: "Invalid request" });
  if (err.type === "entity.too.large") return res.status(413).json({ message: "Request is too large" });
  if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "This value is already in use" });
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}:`, err);
  res.status(500).json({ message: "Something went wrong on our side. Please try again." });
});

export default app;
