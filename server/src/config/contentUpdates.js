/* One-off changes to the store's content (new products, SEO wording), applied by initDb on deploy.
   Each update runs once: when it's done, a "content.<id>" row is saved in settings, so a product deleted
   or edited later in the admin panel is never put back. SEO text is only replaced where it still has the
   value it had when the update was written (or none), so the team's own edits are kept. */
import { pool } from "./db.js";

const SITE = "https://nawaratrend.com";
const img = (slug, files) => files.map((f) => `${SITE}/products/${slug}/${f}`);

const TAJ = "taj-mahal-pocket-watch-keychain";

const UPDATES = [
  {
    id: "2026-11-24-taj-mahal-watch-keychain",
    product: {
      slug: TAJ, category: "accessories",
      name: "Taj Mahal Pocket Watch Keychain, Antique Brass Finish Quartz Watch with Push-Open Cover & Gift Box",
      description: [
        "Carry a piece of India's most loved monument wherever you go.",
        "Press the crown and the engraved Taj Mahal cover springs open to reveal a classic quartz watch with a clean white dial and bold, easy-to-read numerals. Close it, and it's a striking heritage keychain that gets noticed.",
        "The antique brass finish brings out every detail of the domes, minarets and gardens, while the smooth plain back, sturdy metal chain and solid key ring make it light enough for everyday keys and made to last.",
        "It arrives in an elegant black gift box with a golden satin lining: a thoughtful gift for birthdays, Diwali, Father's Day and anniversaries, and a memorable souvenir for anyone who loves India's heritage.",
      ].join("\n\n"),
      price: 449, mrp: 641, stock: 50,
      highlights: [
        "Engraved Taj Mahal cover with fine 3D detailing",
        "Push the crown to open: a working quartz watch inside",
        "Antique brass finish with a smooth plain back",
        "Sturdy metal chain and solid key ring",
        "Arrives in a black gift box with satin lining",
        "A memorable gift and souvenir of India",
      ],
      images: img(TAJ, [`${TAJ}-1.jpg`, `${TAJ}-2.webp`, `${TAJ}-3.webp`, `${TAJ}-4.webp`, `${TAJ}-5.webp`]),
      seo_title: "Taj Mahal Pocket Watch Keychain, Antique Brass",
      seo_description: "Engraved Taj Mahal keychain that opens to a working quartz pocket watch. Antique brass finish, sturdy chain, gift box. ₹449 (30% off), COD in India.",
    },
  },
  {
    // Google shows about 60 characters of a title and 155 of a description; these were cut off, or too alike
    id: "2026-11-24-seo-titles",
    seo: [
      { slug: "mens-premium-black-shirt", from: "Men's Black Full Sleeve Shirt with Embroidered Emblem",
        title: "Men's Black Full Sleeve Shirt, Embroidered",
        description: "Premium black full-sleeve shirt for men with a crisp spread collar and embroidered chest emblem. Sizes M, L, XL. ₹499 (30% off ₹713), COD across India." },
      { slug: "mens-premium-sage-green-shirt", from: "Men's Sage Green Full Sleeve Shirt with Embroidered Emblem",
        title: "Men's Sage Green Shirt, Embroidered Emblem",
        description: "Premium sage green full-sleeve shirt for men: breathable fabric, spread collar, embroidered emblem. Sizes M, L, XL. ₹499 (30% off ₹713), COD across India." },
      { slug: "mens-premium-coffee-brown-shirt", from: "Men's Coffee Brown Full Sleeve Shirt with Gold Embroidery",
        title: "Men's Coffee Brown Shirt, Gold Embroidery",
        description: "Premium coffee brown full-sleeve shirt for men with gold Nawara Trend crown embroidery and tan buttons. Sizes M, L, XL. ₹499 (30% off), COD across India." },
      { slug: "mens-premium-navy-blue-shirt", from: "Men's Navy Blue Full Sleeve Shirt with Gold Embroidery",
        title: "Men's Navy Blue Shirt, Gold Embroidery",
        description: "Premium navy blue full-sleeve shirt for men with gold Nawara Trend crown embroidery and a spread collar. Sizes M, L, XL. ₹499 (30% off), COD across India." },
      { slug: "kids-puppy-water-bottle-500ml-blue", from: "Kids Water Bottle 500ml with Straw & Lock",
        title: "Puppy Kids Water Bottle 500ml with Straw" },
      { slug: "kids-blue-alien-water-bottle-500ml", from: "Kids Water Bottle 500ml, Blue Alien Straw Cup",
        title: "Blue Alien Kids Water Bottle 500ml, Straw" },
      { slug: "kids-pink-bunny-water-bottle-500ml", from: "Pink Kids Water Bottle 500ml with Straw & Lock",
        title: "Pink Bunny Kids Water Bottle 500ml, Straw" },
    ],
  },
];

async function done(id) {
  const [[r]] = await pool.query("SELECT 1 AS x FROM settings WHERE `key` = ?", [`content.${id}`]);
  return !!r;
}

async function addProduct(p) {
  const [[exists]] = await pool.query("SELECT id FROM products WHERE slug = ?", [p.slug]);
  if (exists) return false;
  const [[cat]] = await pool.query("SELECT id FROM categories WHERE slug = ?", [p.category]);
  if (!cat) return false;   // a database without this category (e.g. a fresh demo) doesn't get the product
  const [[{ next }]] = await pool.query("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM products");
  await pool.query(
    `INSERT INTO products (slug, category_id, name, description, price, mrp, stock, highlights, images, status, sort_order, seo_title, seo_description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
    [p.slug, cat.id, p.name, p.description, p.price, p.mrp, p.stock, JSON.stringify(p.highlights), JSON.stringify(p.images), next, p.seo_title, p.seo_description]);
  return true;
}

async function updateSeo(rows) {
  let n = 0;
  for (const r of rows) {
    const [t] = await pool.query("UPDATE products SET seo_title = ? WHERE slug = ? AND (seo_title IS NULL OR seo_title = ?)", [r.title, r.slug, r.from]);
    n += t.affectedRows;
    if (r.description) await pool.query("UPDATE products SET seo_description = ? WHERE slug = ? AND seo_title = ?", [r.description, r.slug, r.title]);
  }
  return n;
}

export async function applyContentUpdates() {
  for (const u of UPDATES) {
    if (await done(u.id)) continue;
    if (u.product && await addProduct(u.product)) console.log(`Added product: ${u.product.slug}`);
    if (u.seo) { const n = await updateSeo(u.seo); if (n) console.log(`Updated SEO titles for ${n} products`); }
    await pool.query("INSERT INTO settings (`key`, value) VALUES (?, ?)", [`content.${u.id}`, new Date().toISOString()]);
  }
}
