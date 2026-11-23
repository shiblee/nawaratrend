/* Creates every table the store needs and seeds starting data.
   Safe to run again: tables are created only if missing, and seed data only goes into empty tables.
   Usage: npm run init-db */
import "dotenv/config";   // first, so the database settings below come from .env

import bcrypt from "bcryptjs";
import { pathToFileURL } from "url";
import { pool } from "./db.js";
import { assignProductCodes } from "../lib/codes.js";

const DEFAULT_ADMIN_EMAIL = "admin@nawaratrend.com";
const DEFAULT_ADMIN_PASSWORD = "Admin@123";

const TABLES = [
  `CREATE TABLE IF NOT EXISTS admins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('owner','manager','staff') NOT NULL DEFAULT 'staff',
    avatar VARCHAR(255) DEFAULT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    must_change_password TINYINT(1) NOT NULL DEFAULT 0,
    failed_attempts INT NOT NULL DEFAULT 0,
    locked_until DATETIME DEFAULT NULL,
    token_version INT NOT NULL DEFAULT 0,
    last_login_at DATETIME DEFAULT NULL,
    last_login_ip VARCHAR(64) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    slug VARCHAR(60) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    slug VARCHAR(80) NOT NULL UNIQUE,
    code_no INT DEFAULT NULL UNIQUE,
    category_id INT DEFAULT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL DEFAULT 0,
    mrp DECIMAL(10,2) NOT NULL DEFAULT 0,
    cost_price DECIMAL(10,2) DEFAULT NULL,
    sku VARCHAR(60) DEFAULT NULL UNIQUE,
    stock INT NOT NULL DEFAULT 0,
    low_stock_threshold INT NOT NULL DEFAULT 5,
    rating DECIMAL(2,1) NOT NULL DEFAULT 0,
    review_count INT NOT NULL DEFAULT 0,
    highlights JSON DEFAULT NULL,
    sizes JSON DEFAULT NULL,
    colors JSON DEFAULT NULL,
    images JSON DEFAULT NULL,
    status ENUM('active','draft','archived') NOT NULL DEFAULT 'active',
    is_featured TINYINT(1) NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    seo_title VARCHAR(80) DEFAULT NULL,
    seo_description VARCHAR(200) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_products_status (status),
    CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
  )`,

  `CREATE TABLE IF NOT EXISTS customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) DEFAULT NULL UNIQUE,
    phone VARCHAR(20) DEFAULT NULL UNIQUE,
    password VARCHAR(255) DEFAULT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    failed_attempts INT NOT NULL DEFAULT 0,
    locked_until DATETIME DEFAULT NULL,
    last_login_at DATETIME DEFAULT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_number VARCHAR(20) NOT NULL UNIQUE,
    customer_id INT DEFAULT NULL,
    status ENUM('pending','confirmed','packed','shipped','delivered','cancelled','returned') NOT NULL DEFAULT 'pending',
    payment_method ENUM('upi','card','cod') NOT NULL,
    payment_status ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
    subtotal DECIMAL(10,2) NOT NULL,
    delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
    total DECIMAL(10,2) NOT NULL,
    ship_name VARCHAR(100) NOT NULL,
    ship_phone VARCHAR(20) NOT NULL,
    ship_email VARCHAR(150) DEFAULT NULL,
    ship_line1 VARCHAR(150) NOT NULL,
    ship_line2 VARCHAR(150) DEFAULT NULL,
    ship_city VARCHAR(60) NOT NULL,
    ship_state VARCHAR(60) NOT NULL,
    ship_pin VARCHAR(10) NOT NULL,
    courier VARCHAR(60) DEFAULT NULL,
    tracking_number VARCHAR(80) DEFAULT NULL,
    admin_notes TEXT,
    ip VARCHAR(64) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_orders_status (status),
    INDEX idx_orders_created (created_at),
    CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
  )`,

  `CREATE TABLE IF NOT EXISTS order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    product_id INT DEFAULT NULL,
    product_name VARCHAR(150) NOT NULL,
    product_slug VARCHAR(80) DEFAULT NULL,
    size VARCHAR(20) DEFAULT NULL,
    color VARCHAR(40) DEFAULT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    qty INT NOT NULL,
    line_total DECIMAL(10,2) NOT NULL,
    CONSTRAINT fk_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
  )`,

  `CREATE TABLE IF NOT EXISTS order_status_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    status VARCHAR(20) NOT NULL,
    note VARCHAR(255) DEFAULT NULL,
    admin_id INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_hist_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_hist_admin FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL
  )`,

  `CREATE TABLE IF NOT EXISTS contact_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    topic VARCHAR(30) NOT NULL,
    name VARCHAR(100) NOT NULL,
    contact VARCHAR(150) NOT NULL,
    order_ref VARCHAR(30) DEFAULT NULL,
    message TEXT NOT NULL,
    status ENUM('new','read','replied','closed') NOT NULL DEFAULT 'new',
    ip VARCHAR(64) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS settings (
    \`key\` VARCHAR(60) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT DEFAULT NULL,
    action VARCHAR(60) NOT NULL,
    entity VARCHAR(40) DEFAULT NULL,
    entity_id VARCHAR(40) DEFAULT NULL,
    details JSON DEFAULT NULL,
    ip VARCHAR(64) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_created (created_at),
    CONSTRAINT fk_audit_admin FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL
  )`,

  // profile photos live in the database (not on disk), so deploys can never wipe them and they use no hosting file quota
  `CREATE TABLE IF NOT EXISTS customer_avatars (
    customer_id INT PRIMARY KEY,
    mime VARCHAR(20) NOT NULL,
    data MEDIUMBLOB NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_avatar_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
  )`,

  // one-time password reset links; only a hash of the token is stored
  `CREATE TABLE IF NOT EXISTS password_resets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used_at DATETIME DEFAULT NULL,
    ip VARCHAR(64) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_reset_customer (customer_id, created_at),
    CONSTRAINT fk_reset_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
  )`,

  // admin-edited email templates (defaults live in server/src/lib/email/templates.js)
  `CREATE TABLE IF NOT EXISTS email_templates (
    \`key\` VARCHAR(40) PRIMARY KEY,
    subject VARCHAR(255) NOT NULL,
    html MEDIUMTEXT NOT NULL,
    text MEDIUMTEXT,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    version INT NOT NULL DEFAULT 1,
    updated_by INT DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_tpl_admin FOREIGN KEY (updated_by) REFERENCES admins(id) ON DELETE SET NULL
  )`,

  // every email the store sends (or decided not to send), with what was sent and what the mail server said
  `CREATE TABLE IF NOT EXISTS email_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    template_key VARCHAR(40) NOT NULL,
    template_version INT NOT NULL DEFAULT 0,
    category VARCHAR(20) NOT NULL,
    recipient VARCHAR(150) NOT NULL,
    customer_id INT DEFAULT NULL,
    order_id INT DEFAULT NULL,
    order_number VARCHAR(20) DEFAULT NULL,
    subject VARCHAR(255) NOT NULL,
    html MEDIUMTEXT NOT NULL,
    text MEDIUMTEXT,
    status ENUM('queued','sending','sent','failed','skipped') NOT NULL DEFAULT 'queued',
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 4,
    next_attempt_at DATETIME DEFAULT NULL,
    last_error VARCHAR(500) DEFAULT NULL,
    provider_message_id VARCHAR(255) DEFAULT NULL,
    provider_response VARCHAR(500) DEFAULT NULL,
    trigger_source VARCHAR(20) NOT NULL DEFAULT 'system',
    triggered_by INT DEFAULT NULL,
    dedupe_key VARCHAR(120) DEFAULT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_at DATETIME DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email_created (created_at),
    INDEX idx_email_status (status, next_attempt_at),
    INDEX idx_email_customer (customer_id),
    INDEX idx_email_order (order_id),
    CONSTRAINT fk_email_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    CONSTRAINT fk_email_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
    CONSTRAINT fk_email_admin FOREIGN KEY (triggered_by) REFERENCES admins(id) ON DELETE SET NULL
  )`,

  `CREATE TABLE IF NOT EXISTS email_attempts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email_id INT NOT NULL,
    attempt INT NOT NULL,
    status ENUM('sent','failed') NOT NULL,
    response VARCHAR(500) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_attempt_email FOREIGN KEY (email_id) REFERENCES email_logs(id) ON DELETE CASCADE
  )`,

  /* ---------- sign-up with mobile OTP ----------
     A sign-up waits here until its mobile number is verified; only then is the customer account created
     (customers.phone is UNIQUE, so two sign-ups racing for one number can never both win).
     The password is kept only as a hash, and even that is wiped once the sign-up is finished or abandoned. */
  `CREATE TABLE IF NOT EXISTS pending_registrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(150) DEFAULT NULL,
    password_hash VARCHAR(255) DEFAULT NULL,
    status ENUM('pending','completed','expired','cancelled') NOT NULL DEFAULT 'pending',
    customer_id INT DEFAULT NULL,
    ip VARCHAR(64) DEFAULT NULL,
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME DEFAULT NULL,
    INDEX idx_pending_phone (phone, status),
    INDEX idx_pending_expires (status, expires_at),
    CONSTRAINT fk_pending_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
  )`,

  /* One verification session per sign-up / password reset. Only an HMAC of the current code is stored;
     a resend replaces it (so older codes stop working at once). public_id is what the browser holds. */
  `CREATE TABLE IF NOT EXISTS otp_verifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    public_id CHAR(32) NOT NULL UNIQUE,
    purpose ENUM('registration','password_reset') NOT NULL,
    phone VARCHAR(20) NOT NULL,
    customer_id INT DEFAULT NULL,
    pending_id INT DEFAULT NULL,
    code_hash CHAR(64) NOT NULL,
    code_expires_at DATETIME NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    total_attempts INT NOT NULL DEFAULT 0,
    resends INT NOT NULL DEFAULT 0,
    last_sent_at DATETIME DEFAULT NULL,
    last_send_ok TINYINT(1) NOT NULL DEFAULT 0,
    status ENUM('pending','verified','expired','locked','cancelled','used') NOT NULL DEFAULT 'pending',
    reset_token_hash CHAR(64) DEFAULT NULL,
    reset_expires_at DATETIME DEFAULT NULL,
    decoy TINYINT(1) NOT NULL DEFAULT 0,
    ip VARCHAR(64) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verified_at DATETIME DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_otp_phone (phone, created_at),
    INDEX idx_otp_ip (ip, created_at),
    CONSTRAINT fk_otp_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    CONSTRAINT fk_otp_pending FOREIGN KEY (pending_id) REFERENCES pending_registrations(id) ON DELETE SET NULL
  )`,

  // every text message sent (never the code itself)
  `CREATE TABLE IF NOT EXISTS sms_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    otp_id INT DEFAULT NULL,
    customer_id INT DEFAULT NULL,
    pending_id INT DEFAULT NULL,
    phone VARCHAR(20) NOT NULL,
    purpose VARCHAR(30) NOT NULL,
    provider VARCHAR(30) NOT NULL,
    status ENUM('queued','sent','delivered','failed') NOT NULL DEFAULT 'queued',
    provider_message_id VARCHAR(120) DEFAULT NULL,
    provider_response VARCHAR(500) DEFAULT NULL,
    failure_reason VARCHAR(500) DEFAULT NULL,
    otp_expires_at DATETIME DEFAULT NULL,
    trigger_source VARCHAR(20) NOT NULL DEFAULT 'customer',
    triggered_by INT DEFAULT NULL,
    ip VARCHAR(64) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_at DATETIME DEFAULT NULL,
    delivered_at DATETIME DEFAULT NULL,
    INDEX idx_sms_created (created_at),
    INDEX idx_sms_phone (phone, created_at),
    INDEX idx_sms_customer (customer_id),
    CONSTRAINT fk_sms_otp FOREIGN KEY (otp_id) REFERENCES otp_verifications(id) ON DELETE SET NULL,
    CONSTRAINT fk_sms_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    CONSTRAINT fk_sms_pending FOREIGN KEY (pending_id) REFERENCES pending_registrations(id) ON DELETE SET NULL,
    CONSTRAINT fk_sms_admin FOREIGN KEY (triggered_by) REFERENCES admins(id) ON DELETE SET NULL
  )`,

  /* Signed-in customer sessions. The browser holds a random token in an HttpOnly cookie; only its hash is
     stored. Signing out (here or everywhere) revokes the row, so a copied cookie stops working too. */
  `CREATE TABLE IF NOT EXISTS customer_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    remember TINYINT(1) NOT NULL DEFAULT 0,
    ip VARCHAR(64) DEFAULT NULL,
    user_agent VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME DEFAULT NULL,
    expires_at DATETIME NOT NULL,
    revoked_at DATETIME DEFAULT NULL,
    revoke_reason VARCHAR(40) DEFAULT NULL,
    INDEX idx_csess_customer (customer_id, created_at),
    CONSTRAINT fk_csess_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
  )`,

  // last number handed out, e.g. for product codes
  `CREATE TABLE IF NOT EXISTS counters (
    name VARCHAR(40) PRIMARY KEY,
    value INT NOT NULL DEFAULT 0
  )`,

  // every saved version of an email template (Emails → template → History)
  `CREATE TABLE IF NOT EXISTS email_template_versions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    template_key VARCHAR(40) NOT NULL,
    version INT NOT NULL,
    subject VARCHAR(255) NOT NULL,
    html MEDIUMTEXT NOT NULL,
    text MEDIUMTEXT,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    action VARCHAR(20) NOT NULL DEFAULT 'edit',
    admin_id INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tplv_key (template_key, version),
    CONSTRAINT fk_tplv_admin FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL
  )`,
];

const SITE = (process.env.SITE_URL || "http://localhost:3001").replace(/\/+$/, "");
// the old WordPress logo, replaced by the maroon & gold brand images in client/public/brand
const OLD_WP_LOGO = "https://i0.wp.com/nawaratrend.com/wp-content/uploads/2022/12/NawaraTrend_Logo_500100.png?fit=500%2C100&ssl=1";

const SETTINGS = {
  store_name: "NawaraTrend",
  free_shipping_threshold: "999",
  delivery_fee: "49",
  phone: "+91 89608 88231",
  whatsapp: "+91 98075 62620",
  address: "House No. 264/146, Billouchbura Road, Lucknow, Uttar Pradesh 226004",
  cod_enabled: "1",
  whatsapp_enabled: "1",
  whatsapp_message: "Hi NawaraTrend, I have a question.",
  home_banner_image: "",
  home_banner_mobile: "",
  home_banner_link: "",
  home_banner_alt: "",

  // SEO (edited on the admin SEO page)
  "seo.site_url": SITE,
  "seo.title_template": "%s | NawaraTrend",
  "seo.default_title": "NawaraTrend | Handpicked Quality Products Across India",
  "seo.default_description": "Shop a small, handpicked range of electronics, fashion, home, beauty, kids and accessories. 100% genuine, quality-checked, free delivery on orders ₹999+.",
  "seo.share_image": `${SITE}/brand/og-image.jpg`,
  "seo.logo_url": `${SITE}/brand/mark-gold.png`,
  "seo.twitter_handle": "",
  "seo.social_links": "",
  "seo.indexing": "1",
  "seo.robots_extra": "",
  "seo.google_verification": "",
  "seo.bing_verification": "",
  "seo.ga4_id": "",

  // Emails (edited on the admin Emails page; the mail server login stays in .env)
  "email.enabled": "1",
  "email.from_name": "NawaraTrend",
  "email.from_address": "",
  "email.reply_to": "",
  "email.support_email": "",
  "email.company_name": "Nawara Trend",
  "email.log_retention_days": "0",

  // Mobile OTP (Communication → OTP / SMS). The SMS provider's API key stays in .env.
  "otp.enabled": "1",
  "otp.length": "6",
  "otp.expiry_minutes": "5",
  "otp.resend_seconds": "60",
  "otp.max_attempts": "5",
  "otp.max_resends": "3",
  "otp.phone_hourly_limit": "5",
  "otp.ip_hourly_limit": "20",
  "otp.pending_hours": "24",
  "sms.log_retention_days": "180",
};

const CATEGORIES = [
  ["electronics", "Electronics"], ["fashion", "Fashion"], ["home", "Home & Kitchen"],
  ["beauty", "Beauty & Care"], ["kids", "Kids & Toys"], ["accessories", "Accessories"],
];

// The storefront's sample range, so the shop looks the same once it reads from the database.
const PRODUCTS = [
  {slug:"earbuds", cat:"electronics", name:"Wireless Bluetooth Earbuds", price:1299, mrp:2999, rating:4.3, reviews:214, stock:6, featured:1,
   desc:"Clear sound and a pocket-size charging case for calls, music and commutes.",
   highlights:["Up to 24 hours with the case","Touch controls, built-in mic","Bluetooth 5.3, quick pairing"]},
  {slug:"band", cat:"electronics", name:"Smart Fitness Band", price:1799, mrp:3499, rating:4.1, reviews:64, stock:40,
   desc:"Tracks steps, heart rate and sleep, and shows phone notifications on your wrist.",
   highlights:["Heart rate & sleep tracking","Water resistant for daily wear","Up to 10 days per charge"]},
  {slug:"shirt", cat:"fashion", name:"Men's Cotton Slim-Fit Shirt", price:699, mrp:1299, rating:4.1, reviews:86, stock:60, sizes:["S","M","L","XL","XXL"],
   desc:"Soft, breathable cotton that works for office days and weekends.",
   highlights:["100% cotton","Sizes S to XXL","Machine washable"]},
  {slug:"kurta", cat:"fashion", name:"Women's Printed Cotton Kurta", price:599, mrp:1199, rating:4.2, reviews:112, stock:55, sizes:["XS","S","M","L","XL","XXL"],
   desc:"A light everyday kurta with a fresh print and a relaxed fit.",
   highlights:["Breathable cotton fabric","Sizes XS to XXL","Colour-fast print"]},
  {slug:"cookware", cat:"home", name:"Non-Stick Cookware Set, 3 Pieces", price:1499, mrp:2499, rating:4.4, reviews:131, stock:25, featured:1,
   desc:"Fry pan, kadai and tawa with a durable non-stick coating for everyday cooking.",
   highlights:["Works on gas & induction","Cool-touch handles","Easy to clean"]},
  {slug:"serum", cat:"beauty", name:"Vitamin C Face Serum, 30 ml", price:449, mrp:799, rating:4.2, reviews:95, stock:80,
   desc:"A lightweight serum for brighter, even-looking skin.",
   highlights:["Suitable for all skin types","Non-sticky, absorbs fast","Use morning or night"]},
  {slug:"blocks", cat:"kids", name:"Building Blocks Set, 250 Pieces", price:899, mrp:1499, rating:4.6, reviews:72, stock:3,
   desc:"Colourful blocks that build creativity and fine motor skills.",
   highlights:["Ages 4 and up","Non-toxic, smooth edges","Storage box included"]},
  {slug:"backpack", cat:"accessories", name:"Laptop Backpack with USB Port", price:999, mrp:1999, rating:4.3, reviews:58, stock:30,
   desc:"A padded backpack for laptops up to 15.6\" with room for daily essentials.",
   highlights:["Water-resistant fabric","Built-in USB charging port","Padded laptop sleeve"]},
];

// MySQL has no "ADD COLUMN IF NOT EXISTS", so check information_schema first
async function addColumn(table, column, definition) {
  const [rows] = await pool.query(
    "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?", [table, column]);
  if (rows.length) return false;
  await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  console.log(`Added ${table}.${column}`);
  return true;
}

const isEmpty = async (table) => {
  const [[{ n }]] = await pool.query(`SELECT COUNT(*) AS n FROM ${table}`);
  return n === 0;
};

export async function initDatabase() {
  for (const sql of TABLES) await pool.query(sql);
  // upgrades for databases created by an earlier version
  await pool.query("ALTER TABLE settings MODIFY value TEXT NOT NULL");
  await addColumn("products", "seo_title", "VARCHAR(80) DEFAULT NULL AFTER sort_order");
  await addColumn("products", "seo_description", "VARCHAR(200) DEFAULT NULL AFTER seo_title");
  // colour options: [{ name, hex, image }] on the product, and the colour chosen on each order line
  await addColumn("products", "colors", "JSON DEFAULT NULL AFTER sizes");
  await addColumn("order_items", "color", "VARCHAR(40) DEFAULT NULL AFTER size");
  // permanent product codes (see lib/codes.js)
  await addColumn("products", "code_no", "INT DEFAULT NULL UNIQUE AFTER slug");
  await pool.query("INSERT IGNORE INTO counters (name, value) VALUES ('product_code', 0)");
  // customer accounts: sign out everywhere / after a password change
  await addColumn("customers", "token_version", "INT NOT NULL DEFAULT 0 AFTER locked_until");
  // order tracking: more statuses, refunds, courier link and expected delivery (existing values are all kept)
  await pool.query(`ALTER TABLE orders MODIFY status ENUM('pending','on_hold','confirmed','packed','shipped','out_for_delivery','delivery_failed',
    'delivered','return_requested','returned','cancelled') NOT NULL DEFAULT 'pending'`);
  await pool.query("ALTER TABLE orders MODIFY payment_status ENUM('pending','paid','failed','refund_pending','refunded') NOT NULL DEFAULT 'pending'");
  await addColumn("orders", "tracking_url", "VARCHAR(255) DEFAULT NULL AFTER tracking_number");
  await addColumn("orders", "expected_delivery", "DATE DEFAULT NULL AFTER tracking_url");
  // the order timeline: what the customer is told (note) and what only the team sees (internal_note)
  await pool.query("ALTER TABLE order_status_history MODIFY note VARCHAR(500) DEFAULT NULL");
  await addColumn("order_status_history", "from_status", "VARCHAR(20) DEFAULT NULL AFTER order_id");
  await addColumn("order_status_history", "internal_note", "VARCHAR(1000) DEFAULT NULL AFTER note");
  if (await addColumn("order_status_history", "actor", "VARCHAR(10) NOT NULL DEFAULT 'system' AFTER admin_id")) {
    await pool.query("UPDATE order_status_history SET actor = IF(admin_id IS NULL, 'customer', 'admin')");
  }
  // mobile-first accounts: verified flags, last sign-in address, and numbers stored as +91XXXXXXXXXX
  await addColumn("customers", "phone_verified_at", "DATETIME DEFAULT NULL AFTER phone");
  await addColumn("customers", "email_verified_at", "DATETIME DEFAULT NULL AFTER email");
  await addColumn("customers", "last_login_ip", "VARCHAR(64) DEFAULT NULL AFTER last_login_at");
  const [moved] = await pool.query("UPDATE customers SET phone = CONCAT('+91', phone) WHERE phone REGEXP '^[6-9][0-9]{9}$'");
  if (moved.affectedRows) console.log(`Stored ${moved.affectedRows} mobile numbers as +91XXXXXXXXXX`);
  // email delivery tracking for providers that report it (bounced / delivered)
  await pool.query("ALTER TABLE email_logs MODIFY status ENUM('queued','sending','sent','delivered','failed','bounced','skipped') NOT NULL DEFAULT 'queued'");
  await addColumn("email_logs", "delivered_at", "DATETIME DEFAULT NULL AFTER sent_at");
  console.log(`Tables ready (${TABLES.length})`);

  for (const [key, value] of Object.entries(SETTINGS)) {
    await pool.query("INSERT IGNORE INTO settings (`key`, value) VALUES (?, ?)", [key, value]);
  }
  // rebrand: swap the old WordPress logo for the new images, but only where nobody has changed it
  for (const key of ["seo.share_image", "seo.logo_url"]) {
    await pool.query("UPDATE settings SET value = ? WHERE `key` = ? AND value = ?", [SETTINGS[key], key, OLD_WP_LOGO]);
  }

  if (await isEmpty("categories")) {
    for (const [i, [slug, name]] of CATEGORIES.entries()) {
      await pool.query("INSERT INTO categories (slug, name, sort_order) VALUES (?, ?, ?)", [slug, name, i + 1]);
    }
    console.log(`Seeded ${CATEGORIES.length} categories`);
  }

  if (await isEmpty("products")) {
    const [cats] = await pool.query("SELECT id, slug FROM categories");
    const catId = Object.fromEntries(cats.map((c) => [c.slug, c.id]));
    for (const [i, p] of PRODUCTS.entries()) {
      await pool.query(
        `INSERT INTO products (slug, category_id, name, description, price, mrp, sku, stock, rating, review_count, highlights, sizes, is_featured, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.slug, catId[p.cat], p.name, p.desc, p.price, p.mrp, `NT-${String(i + 1).padStart(3, "0")}`, p.stock, p.rating, p.reviews,
         JSON.stringify(p.highlights), p.sizes ? JSON.stringify(p.sizes) : null, p.featured || 0, i + 1]
      );
    }
    console.log(`Seeded ${PRODUCTS.length} products`);
  }
  const coded = await assignProductCodes();
  if (coded) console.log(`Gave ${coded} products a permanent code`);

  const [existing] = await pool.query("SELECT id FROM admins WHERE email = ?", [DEFAULT_ADMIN_EMAIL]);
  if (existing.length === 0) {
    const hashed = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 12);
    await pool.query(
      "INSERT INTO admins (name, email, password, role, must_change_password) VALUES (?, ?, ?, 'owner', 1)",
      ["Admin", DEFAULT_ADMIN_EMAIL, hashed]
    );
    console.log(`Seeded owner admin: ${DEFAULT_ADMIN_EMAIL} / ${DEFAULT_ADMIN_PASSWORD} (change it after first login)`);
  }

  console.log("Database initialized successfully");
}

// run directly (npm run init-db), not when imported by the tests
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  initDatabase().then(() => process.exit(0)).catch((err) => {
    console.error("Database init failed:", err.message);
    process.exit(1);
  });
}
