/* One-off changes to the store's content (new products, SEO wording), applied by initDb on deploy.
   Each update runs once: when it's done, a "content.<id>" row is saved in settings, so a product deleted
   or edited later in the admin panel is never put back. SEO text is only replaced where it still has the
   value it had when the update was written (or none), so the team's own edits are kept. */
import { pool } from "./db.js";

const SITE = "https://nawaratrend.com";
const img = (slug, files) => files.map((f) => `${SITE}/products/${slug}/${f}`);

const TAJ = "taj-mahal-pocket-watch-keychain";
const CREST = "heritage-crest-pocket-watch-keychain";
const CUP = "animal-cup-keychain-pouch";

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
    // the crest is a well-known film design: the listing deliberately names no franchise, school or characters
    id: "2026-11-24-heritage-crest-watch-keychain",
    product: {
      slug: CREST, category: "accessories",
      name: "Heritage Crest Pocket Watch Keychain, Antique Brass Quartz Watch with Flip-Open Cover & Gift Box",
      description: [
        "A pocket watch with a story on its cover.",
        "The flip-open lid carries a richly embossed heraldic crest, with every curl, feather and shield line raised in antique brass. Press the crown and it opens to a classic quartz watch with a crisp white dial and bold numerals, protected by a textured inner cover.",
        "Clip it to your keys or bag with the sturdy chain and solid key ring, and it's a conversation starter wherever you take it. It arrives in a gift box lined with golden satin, ready for birthdays, Diwali, Father's Day or anyone who loves a vintage piece.",
        "How to use: remove the small white plastic lock from the crown before first use. Press the crown to open the cover; the watch starts. To set the time, lift the crown to stop the watch, turn it to the right time, then press it back in to start again.",
      ].join("\n\n"),
      price: 449, mrp: 641, stock: 50,
      highlights: [
        "Richly embossed heraldic crest on the cover",
        "Press the crown to flip open: a working quartz watch inside",
        "Clear white dial with bold, easy-to-read numerals",
        "Antique brass finish and textured inner cover",
        "Sturdy metal chain and solid key ring",
        "Arrives in a gift box with satin lining",
      ],
      images: img(CREST, [`${CREST}-1.jpg`, `${CREST}-2.webp`, `${CREST}-3.webp`, `${CREST}-4.webp`]),
      seo_title: "Heritage Crest Pocket Watch Keychain, Brass",
      seo_description: "Vintage pocket watch keychain with an embossed heraldic crest, flip-open cover and quartz dial. Antique brass finish, gift box. ₹449 (30% off), COD.",
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
  {
    // the owner asked to drop photos 2 and 3; only applied while the listing still has the original three
    id: "2026-11-25-burger-pouch-photos",
    images: [{
      slug: "burger-panda-keychain-pouch",
      from: img("burger-panda-keychain-pouch", ["1.jpg", "2.webp", "3.webp"]),
      to: img("burger-panda-keychain-pouch", ["1.jpg"]),
    }],
  },
  {
    // five new branded photos added after the main one
    id: "2026-11-25-burger-pouch-new-photos",
    images: [{
      slug: "burger-panda-keychain-pouch",
      from: img("burger-panda-keychain-pouch", ["1.jpg"]),
      to: img("burger-panda-keychain-pouch", ["1.jpg", ...[2, 3, 4, 5, 6].map((n) => `burger-panda-keychain-pouch-${n}.webp`)]),
    }],
  },
  {
    // it's a keychain, not a pouch: the title now matches the photos (the page address stays the same)
    id: "2026-11-25-burger-keychain-title",
    fields: [{
      slug: "burger-panda-keychain-pouch",
      name: {
        from: "Cute Burger Keychain Pouch with 3D Panda, Soft Silicone Mini Storage Pouch & Bag Charm for Coins, Earbuds & Keys",
        to: "Cute Panda Burger Keychain, Soft Silicone 3D Panda Bag Charm with Gold-Tone Metal Keyring for Keys, Bags & Cars",
      },
      seo_title: { from: "Burger Panda Keychain Pouch, Silicone", to: "Cute Panda Burger Keychain, Silicone Bag Charm" },
    }],
  },
  {
    // keychain, not a pouch: description, highlights and Google snippet rewritten to match the photos
    id: "2026-11-25-burger-keychain-text",
    fields: [{
      slug: "burger-panda-keychain-pouch",
      description: {
        from: "A keychain, a bag charm and a mini pouch in one! This cute burger keychain pouch is shaped like a colourful burger, with an adorable 3D panda on top. Sesame seeds, lettuce, cheese and a juicy patty make it look good enough to eat.\n\nIt is made of soft, durable and flexible silicone, and the small storage space is handy for coins, earbuds and other little things. The gold-tone chain and ring attach it to keys, school bags, backpacks and handbags.\n\nA cute, trendy accessory for school and everyday use, and a lovely birthday or return gift for kids.\n\nIncludes: 1 keychain pouch.",
        to: [
          "Meet the cutest keychain in town! This panda burger keychain is shaped like a colourful burger, with an adorable 3D panda sitting on top. Sesame seeds, lettuce, cheese and a juicy patty make it look good enough to eat.",
          "Give it a gentle squeeze and the little panda pops up out of the bun: a fun fidget that kids and adults love.",
          "It is made of soft, durable and flexible silicone, with bright colours and fine detailing. A sturdy gold-tone metal clasp and keyring attach it to keys, car keys, school bags, backpacks and handbags, and it is light enough to carry every day.",
          "A cute, trendy accessory and a lovely birthday or return gift for kids, friends and family.",
          "Includes: 1 keychain.",
        ].join("\n\n"),
      },
      highlights: {
        from: ["Adorable 3D panda on top", "Colourful burger design with lettuce, cheese and patty layers", "Mini storage pouch for coins, earbuds and more", "Keychain and bag charm in one", "Soft, durable and flexible silicone", "Gold-tone chain and ring", "Attach to keys, school bags and backpacks", "Perfect gift for kids"],
        to: ["Adorable 3D panda on top", "Squeeze it and the panda pops up", "Colourful burger design with lettuce, cheese and patty layers", "Soft, durable and flexible silicone", "Sturdy gold-tone metal clasp and keyring", "Lightweight and easy to carry", "For keys, car keys, bags and backpacks", "Perfect gift for everyone"],
      },
      seo_description: {
        from: "Cute Burger keychain pouch with 3D panda: soft silicone mini pouch for coins and earbuds, with chain and ring. Bag charm and gift for kids. ₹199 (30% off).",
        to: "Cute panda burger keychain in soft silicone with a 3D panda on top and a gold-tone metal keyring. For keys, bags and cars. ₹199 (30% off), COD in India.",
      },
    }],
  },
  {
    // the cup carries a printed emblem and the figure is a generic yellow animal: the listing names no tournament, film or character
    id: "2026-11-25-animal-cup-keychain-pouch",
    product: {
      slug: CUP, category: "accessories",
      name: "Cute Animal Cup Keychain Pouch, Soft Silicone Mini Storage Mug with 3D Character Lid & Gold-Tone Keyring for Bags & Keys",
      description: [
        "A tiny mug with a big personality! This cute keychain pouch is shaped like a white coffee cup, with an adorable yellow 3D animal sitting on the lid, waving hello.",
        "Lift the soft lid and there's a mini storage space inside, handy for coins, earbuds, hair ties and other little things. Close it, and it's a charming keychain and bag charm that gets noticed.",
        "It is made of soft, durable and flexible silicone that's comfortable to hold, with bright colours and fine detailing. The sturdy gold-tone chain and metal keyring attach it to keys, car keys, school bags, backpacks and handbags, and it's light enough to carry every day.",
        "A cute, trendy accessory and a lovely birthday or return gift for kids, friends and family.",
        "Includes: 1 keychain pouch.",
      ].join("\n\n"),
      price: 199, mrp: 284, stock: 50,
      highlights: [
        "Adorable 3D animal sitting on the lid",
        "Cute coffee-cup shape with a handle",
        "Openable lid with a mini storage space",
        "Keeps coins, earbuds and small things",
        "Soft, durable and flexible silicone",
        "Sturdy gold-tone chain and metal keyring",
        "For keys, school bags, backpacks and handbags",
        "Perfect gift for kids",
      ],
      images: img(CUP, [`${CUP}-1.jpg`, `${CUP}-2.webp`, `${CUP}-3.webp`]),
      seo_title: "Cute Animal Cup Keychain Pouch, Silicone",
      seo_description: "Cute cup-shaped keychain pouch with a 3D animal on the lid: soft silicone mini storage for coins and earbuds, gold-tone keyring. ₹199 (30% off), COD.",
    },
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

async function updateImages(rows) {
  let n = 0;
  for (const r of rows) {
    const [[p]] = await pool.query("SELECT id, images FROM products WHERE slug = ?", [r.slug]);
    if (!p) continue;
    const cur = typeof p.images === "string" ? JSON.parse(p.images) : p.images;
    if (JSON.stringify(cur) !== JSON.stringify(r.from)) continue;   // edited in the admin panel since: leave it
    await pool.query("UPDATE products SET images = ? WHERE id = ?", [JSON.stringify(r.to), p.id]);
    n++;
  }
  return n;
}

// each field changes only while it still has its old value, so edits made in the admin panel are kept;
// lists (highlights, a JSON column) are compared and stored as JSON
async function updateFields(rows) {
  const norm = (v) => (typeof v === "string" ? v : JSON.stringify(v));
  let n = 0;
  for (const { slug, ...fields } of rows) {
    for (const [col, { from, to }] of Object.entries(fields)) {
      const [[p]] = await pool.query(`SELECT id, \`${col}\` AS v FROM products WHERE slug = ?`, [slug]);
      if (!p) continue;
      const cur = Array.isArray(from) && typeof p.v === "string" ? JSON.parse(p.v) : p.v;
      if (norm(cur) !== norm(from)) continue;
      await pool.query(`UPDATE products SET \`${col}\` = ? WHERE id = ?`, [norm(to), p.id]);
      n++;
    }
  }
  return n;
}

export async function applyContentUpdates() {
  for (const u of UPDATES) {
    if (await done(u.id)) continue;
    if (u.product && await addProduct(u.product)) console.log(`Added product: ${u.product.slug}`);
    if (u.seo) { const n = await updateSeo(u.seo); if (n) console.log(`Updated SEO titles for ${n} products`); }
    if (u.fields) { const n = await updateFields(u.fields); if (n) console.log(`Updated ${n} product fields`); }
    if (u.images) { const n = await updateImages(u.images); if (n) console.log(`Updated photos for ${n} products`); }
    await pool.query("INSERT INTO settings (`key`, value) VALUES (?, ?)", [`content.${u.id}`, new Date().toISOString()]);
  }
}
