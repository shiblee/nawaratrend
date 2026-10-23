/* Creates every table the store needs and seeds starting data.
   Safe to run again: tables are created only if missing, and seed data only goes into empty tables.
   Usage: npm run init-db */
import "dotenv/config";   // first, so the database settings below come from .env

import bcrypt from "bcryptjs";
import { pool } from "./db.js";

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
];

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

  // SEO (edited on the admin SEO page)
  "seo.site_url": process.env.SITE_URL || "http://localhost:3001",
  "seo.title_template": "%s | NawaraTrend",
  "seo.default_title": "NawaraTrend | Handpicked Quality Products Across India",
  "seo.default_description": "Shop a small, handpicked range of electronics, fashion, home, beauty, kids and accessories. 100% genuine, quality-checked, free delivery on orders ₹999+.",
  "seo.share_image": "https://i0.wp.com/nawaratrend.com/wp-content/uploads/2022/12/NawaraTrend_Logo_500100.png?fit=500%2C100&ssl=1",
  "seo.logo_url": "https://i0.wp.com/nawaratrend.com/wp-content/uploads/2022/12/NawaraTrend_Logo_500100.png?fit=500%2C100&ssl=1",
  "seo.twitter_handle": "",
  "seo.social_links": "",
  "seo.indexing": "1",
  "seo.robots_extra": "",
  "seo.google_verification": "",
  "seo.bing_verification": "",
  "seo.ga4_id": "",
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
  if (!rows.length) { await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`); console.log(`Added ${table}.${column}`); }
}

const isEmpty = async (table) => {
  const [[{ n }]] = await pool.query(`SELECT COUNT(*) AS n FROM ${table}`);
  return n === 0;
};

const run = async () => {
  for (const sql of TABLES) await pool.query(sql);
  // upgrades for databases created by an earlier version
  await pool.query("ALTER TABLE settings MODIFY value TEXT NOT NULL");
  await addColumn("products", "seo_title", "VARCHAR(80) DEFAULT NULL AFTER sort_order");
  await addColumn("products", "seo_description", "VARCHAR(200) DEFAULT NULL AFTER seo_title");
  console.log(`Tables ready (${TABLES.length})`);

  for (const [key, value] of Object.entries(SETTINGS)) {
    await pool.query("INSERT IGNORE INTO settings (`key`, value) VALUES (?, ?)", [key, value]);
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
  process.exit(0);
};

run().catch((err) => {
  console.error("Database init failed:", err.message);
  process.exit(1);
});
