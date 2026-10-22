import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import storeRoutes from "./routes/store.js";
import adminAuthRoutes from "./routes/admin/auth.js";
import adminCatalogRoutes from "./routes/admin/catalog.js";
import adminOrderRoutes from "./routes/admin/orders.js";
import adminSystemRoutes from "./routes/admin/system.js";
import adminSeoRoutes from "./routes/admin/seo.js";
import seoRoutes, { storefrontHtml } from "./routes/seo.js";
import { requireAdmin } from "./middleware/auth.js";
import { HttpError } from "./lib/http.js";

const app = express();
app.disable("x-powered-by");

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
app.use(cors({ origin: (origin, cb) => cb(null, !origin || origins.includes(origin)), maxAge: 600 }));
app.use(express.json({ limit: "100kb" }));
app.use("/api", rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false, message: { message: "Too many requests. Please slow down." } }));

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/store", storeRoutes);
app.use("/api/admin/auth", adminAuthRoutes);
app.use(seoRoutes);   // /sitemap.xml, /robots.txt, /api/store/seo
app.use("/api/admin", requireAdmin, adminCatalogRoutes, adminOrderRoutes, adminSystemRoutes, adminSeoRoutes);

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
