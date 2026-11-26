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
const BEAR_CUP = "bear-cup-keychain-pouch";
const BLUE_CUP = "blue-cup-keychain-pouch";
const RED_CUP = "red-cup-keychain-pouch";
const ATTAR = "jannatul-firdaus-attar";
const OUDH = "white-oudh-attar";
const QAHWA = "khamrah-qahwa-attar";
const AVENTUS = "aventus-inspired-attar";

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
  {
    // the supplier's cup carries a luxury-brand monogram: it's painted out of the photo and the listing names no brand or character
    id: "2026-11-25-bear-cup-keychain-pouch",
    product: {
      slug: BEAR_CUP, category: "accessories",
      name: "Cute Bear Cup Keychain Pouch, Press & Pop 3D Bear, Soft Silicone Mini Storage Mug with Gold-Tone Keyring for Bags & Keys",
      description: [
        "A tiny mug with a playful surprise! This cute keychain pouch is shaped like a brown coffee cup with a fluffy white top, and a little pink 3D bear peeking out from inside.",
        "Press the bear down and it pops right back up: a fun fidget that kids and adults can't stop playing with. Lift the soft lid and there's a mini storage space inside, handy for coins, earbuds, hair ties and other little things.",
        "It is made of soft, durable and flexible silicone that's comfortable to hold, with bright colours and fine detailing. The sturdy gold-tone chain and metal keyring attach it to keys, car keys, school bags, backpacks and handbags, and it's light enough to carry every day.",
        "A cute, trendy accessory and a lovely birthday or return gift for kids, friends and family.",
        "Includes: 1 keychain pouch.",
      ].join("\n\n"),
      price: 199, mrp: 284, stock: 50,
      highlights: [
        "Adorable 3D bear peeking out of the cup",
        "Press the bear and it pops back up",
        "Openable lid with a mini storage space",
        "Keeps coins, earbuds and small things",
        "Soft, durable and flexible silicone",
        "Sturdy gold-tone chain and metal keyring",
        "For keys, school bags, backpacks and handbags",
        "Perfect gift for kids",
      ],
      images: img(BEAR_CUP, [`${BEAR_CUP}-1.jpg`]),
      seo_title: "Cute Bear Cup Keychain Pouch, Press & Pop",
      seo_description: "Cute cup keychain pouch with a 3D bear that pops up when pressed. Soft silicone, mini storage for coins and earbuds, metal keyring. ₹199 (30% off), COD.",
    },
  },
  {
    // the cup carries a soft-drink brand's logo (photos published as they are, at the owner's choice): the text names no brand
    id: "2026-11-25-blue-cup-keychain-pouch",
    product: {
      slug: BLUE_CUP, category: "accessories",
      name: "Cute Blue Cup Keychain Pouch, Press & Pop 3D Bunny-Hood Doll, Soft Silicone Mini Storage Mug with Gold-Tone Keyring",
      description: [
        "A tiny blue mug with a playful surprise! This cute keychain pouch is shaped like a coffee cup with a fluffy white top, and a sweet 3D doll in a blue bunny-ear hoodie peeking out from inside.",
        "Press the doll down and it pops right back up: a fun fidget that kids and adults can't stop playing with. Lift the soft lid and there's a mini storage space inside, handy for coins, earbuds, hair ties and other little things.",
        "It is made of soft, durable and flexible silicone, with bright colours and fine detailing. The sturdy gold-tone chain, clasp and metal keyring attach it to handbags, car keys, home keys, backpacks, pencil pouches, water bottles, luggage, phone lanyards and ID card holders, and it's light enough to carry every day.",
        "A cute, trendy accessory and a lovely birthday or return gift for kids, friends and family.",
        "Includes: 1 keychain pouch.",
      ].join("\n\n"),
      price: 199, mrp: 284, stock: 50,
      highlights: [
        "Adorable 3D doll in a blue bunny-ear hoodie",
        "Press the doll and it pops back up",
        "Openable lid with a mini storage space",
        "Keeps coins, earbuds and small things",
        "Soft, durable and flexible silicone",
        "Sturdy gold-tone chain, clasp and metal keyring",
        "For bags, keys, backpacks, bottles and luggage",
        "Perfect gift for kids",
      ],
      images: img(BLUE_CUP, [`${BLUE_CUP}-1.jpg`, `${BLUE_CUP}-2.webp`, `${BLUE_CUP}-3.webp`, `${BLUE_CUP}-4.webp`]),
      seo_title: "Cute Blue Cup Keychain Pouch, Press & Pop",
      seo_description: "Blue cup keychain pouch with a 3D bunny-hood doll that pops up when pressed. Soft silicone, mini storage for coins, metal keyring. ₹199 (30% off), COD.",
    },
  },
  {
    // the owner chose to show the supplier's original photos (brand monogram included) instead of the painted-out one
    id: "2026-11-26-bear-cup-original-photos",
    images: [{
      slug: BEAR_CUP,
      from: img(BEAR_CUP, [`${BEAR_CUP}-1.jpg`]),
      to: img(BEAR_CUP, [`${BEAR_CUP}-2.jpg`, `${BEAR_CUP}-3.webp`, `${BEAR_CUP}-4.webp`]),
    }],
  },
  {
    // the cup carries a soft-drink brand's logo (photos published as they are, at the owner's choice): the text names no brand
    id: "2026-11-26-red-cup-keychain-pouch",
    product: {
      slug: RED_CUP, category: "accessories",
      name: "Cute Red Cup Keychain Pouch, Press & Pop 3D Bear, Soft Silicone Mini Storage Mug with Gold-Tone Keyring for Bags & Keys",
      description: [
        "A tiny red mug with a playful surprise! This cute keychain pouch is shaped like a coffee cup with a fluffy white top, and a little pink 3D bear peeking out from inside.",
        "Press the bear down and it pops right back up: a fun fidget that kids and adults can't stop playing with. Lift the soft lid and there's a mini storage space inside, handy for coins, earbuds, hair ties and other little things.",
        "It is made of soft, durable and flexible silicone, with bright colours and fine detailing. The sturdy gold-tone chain, clasp and metal keyrings attach it to handbags, car keys, home keys, backpacks, school bags, water bottles, pencil pouches, luggage and ID card holders, and it's light enough to carry every day.",
        "A cute, trendy accessory and a lovely birthday or return gift for kids, friends and family.",
        "Includes: 1 keychain pouch.",
      ].join("\n\n"),
      price: 199, mrp: 284, stock: 50,
      highlights: [
        "Adorable 3D bear peeking out of the cup",
        "Press the bear and it pops back up",
        "Openable lid with a mini storage space",
        "Keeps coins, earbuds and small things",
        "Soft, durable and flexible silicone",
        "Sturdy gold-tone chain, clasp and metal keyrings",
        "For bags, keys, backpacks, bottles and luggage",
        "Perfect gift for kids",
      ],
      images: img(RED_CUP, [`${RED_CUP}-1.jpg`, `${RED_CUP}-2.webp`, `${RED_CUP}-3.webp`]),
      seo_title: "Cute Red Cup Keychain Pouch, Press & Pop Bear",
      seo_description: "Red cup keychain pouch with a 3D bear that pops up when pressed. Soft silicone, mini storage for coins, gold-tone keyring. ₹199 (30% off), COD in India.",
    },
  },
  {
    // one attar product with two sizes, each with its own price and photo. It replaces the two separate
    // 6 ml and 12 ml products listed earlier the same day: the 6 ml one becomes this product, the 12 ml one is archived.
    id: "2026-11-26-jannatul-firdaus-attar",
    merge: { from: `${ATTAR}-6ml`, archive: [`${ATTAR}-12ml`] },
    product: {
      slug: ATTAR, category: "beauty",
      name: "Jannatul Firdaus Attar, Alcohol-Free Concentrated Perfume Oil in Gold Crown Roll-On Bottle with Gift Box, 6 ml & 12 ml",
      description: [
        "Jannatul Firdaus, the garden of paradise, is one of the best-loved attars: a soft, sweet floral fragrance that feels fresh, clean and calming.",
        "This is a pure, concentrated perfume oil with no alcohol, so it is gentle on the skin and suitable to wear for prayer and every day. A few dabs on the wrists, neck or behind the ears are enough, and the fragrance stays with you for hours.",
        "It comes in an elegant gold crown bottle with a gift box, in two sizes: 6 ml and 12 ml. A lovely gift for Eid, Ramadan, weddings and special occasions.",
        "Includes: 1 attar bottle (6 ml or 12 ml, as chosen) with gift box.",
      ].join("\n\n"),
      price: 252, mrp: 280, stock: 50,
      sizes: ["6 ml", "12 ml"],
      size_prices: [
        { size: "6 ml", price: 252, mrp: 280, image: img(ATTAR, [`${ATTAR}-6ml-2.webp`])[0] },
        { size: "12 ml", price: 514, mrp: 571, image: img(ATTAR, [`${ATTAR}-12ml-3.webp`])[0] },
      ],
      highlights: [
        "100% alcohol-free concentrated perfume oil",
        "Soft, sweet and calming floral fragrance",
        "Long-lasting: a few dabs are enough",
        "Gentle on skin, suitable for prayer",
        "Two sizes: 6 ml and 12 ml",
        "Elegant gold crown bottle with gift box",
        "Perfect gift for Eid, Ramadan and weddings",
      ],
      images: img(ATTAR, [`${ATTAR}-1.jpg`, `${ATTAR}-6ml-2.webp`, `${ATTAR}-12ml-3.webp`]),
      seo_title: "Jannatul Firdaus Attar, Alcohol-Free, 6 & 12 ml",
      seo_description: "Jannatul Firdaus attar, alcohol-free perfume oil with a soft floral fragrance in a gold crown bottle with gift box. 6 ml ₹252, 12 ml ₹514, COD in India.",
    },
  },
  {
    id: "2026-11-26-white-oudh-attar",
    product: {
      slug: OUDH, category: "beauty",
      name: "White Oudh Attar, Alcohol-Free Concentrated Perfume Oil in Gold Crown Roll-On Bottle with Gift Box, 6 ml & 12 ml",
      description: [
        "White Oudh is a smooth, elegant attar: the rich, woody warmth of oud softened with clean white florals, for a fragrance that feels both royal and gentle.",
        "This is a pure, concentrated perfume oil with no alcohol, so it is gentle on the skin and suitable to wear for prayer and every day. A few dabs on the wrists, neck or behind the ears are enough, and the fragrance stays with you for hours.",
        "It comes in an elegant gold crown bottle with a gift box, in two sizes: 6 ml and 12 ml. A lovely gift for Eid, Ramadan, weddings and special occasions.",
        "Includes: 1 attar bottle (6 ml or 12 ml, as chosen) with gift box.",
      ].join("\n\n"),
      price: 252, mrp: 280, stock: 50,
      sizes: ["6 ml", "12 ml"],
      size_prices: [
        { size: "6 ml", price: 252, mrp: 280, image: img(OUDH, [`${OUDH}-6ml-2.webp`])[0] },
        { size: "12 ml", price: 514, mrp: 571, image: img(OUDH, [`${OUDH}-12ml-3.webp`])[0] },
      ],
      highlights: [
        "100% alcohol-free concentrated perfume oil",
        "Smooth woody oud with soft white florals",
        "Long-lasting: a few dabs are enough",
        "Gentle on skin, suitable for prayer",
        "Two sizes: 6 ml and 12 ml",
        "Elegant gold crown bottle with gift box",
        "Perfect gift for Eid, Ramadan and weddings",
      ],
      images: img(OUDH, [`${OUDH}-1.jpg`, `${OUDH}-6ml-2.webp`, `${OUDH}-12ml-3.webp`]),
      seo_title: "White Oudh Attar, Alcohol-Free, 6 ml & 12 ml",
      seo_description: "White Oudh attar, alcohol-free perfume oil: smooth woody oud with soft white florals, gold crown bottle with gift box. 6 ml ₹252, 12 ml ₹514, COD in India.",
    },
  },
  {
    // the name is the one on the owner's photos; the text names no perfume house
    id: "2026-11-26-khamrah-qahwa-attar",
    product: {
      slug: QAHWA, category: "beauty",
      name: "Khamrah Qahwa Attar, Alcohol-Free Concentrated Perfume Oil in Gold Crown Roll-On Bottle with Gift Box, 6 ml & 12 ml",
      description: [
        "Khamrah Qahwa is a warm, rich attar: roasted coffee and cinnamon spice wrapped in sweet amber and soft oud wood, with a light touch of white florals. Cosy, bold and perfect for evenings and winter.",
        "This is a pure, concentrated perfume oil with no alcohol, so it is gentle on the skin and suitable to wear for prayer and every day. A few dabs on the wrists, neck or behind the ears are enough, and the fragrance stays with you for hours.",
        "It comes in an elegant gold crown bottle with a gift box, in two sizes: 6 ml and 12 ml. A lovely gift for Eid, Ramadan, weddings and special occasions.",
        "Includes: 1 attar bottle (6 ml or 12 ml, as chosen) with gift box.",
      ].join("\n\n"),
      price: 252, mrp: 280, stock: 50,
      sizes: ["6 ml", "12 ml"],
      size_prices: [
        { size: "6 ml", price: 252, mrp: 280, image: img(QAHWA, [`${QAHWA}-6ml-2.webp`])[0] },
        { size: "12 ml", price: 514, mrp: 571, image: img(QAHWA, [`${QAHWA}-12ml-3.webp`])[0] },
      ],
      highlights: [
        "100% alcohol-free concentrated perfume oil",
        "Warm coffee, cinnamon, sweet amber and oud",
        "Long-lasting: a few dabs are enough",
        "Gentle on skin, suitable for prayer",
        "Two sizes: 6 ml and 12 ml",
        "Elegant gold crown bottle with gift box",
        "Perfect gift for Eid, Ramadan and weddings",
      ],
      images: img(QAHWA, [`${QAHWA}-1.jpg`, `${QAHWA}-6ml-2.webp`, `${QAHWA}-12ml-3.webp`]),
      seo_title: "Khamrah Qahwa Attar, Alcohol-Free, 6 & 12 ml",
      seo_description: "Khamrah Qahwa attar, alcohol-free perfume oil: warm coffee, cinnamon, amber and oud in a gold crown bottle with gift box. 6 ml ₹252, 12 ml ₹514, COD.",
    },
  },
  {
    // an inspired fragrance: the photos name the perfume it is modelled on, so the text says plainly it is not that house's product
    id: "2026-11-26-aventus-inspired-attar",
    product: {
      slug: AVENTUS, category: "beauty",
      name: "Aventus Attar, Inspired by Creed Aventus, Alcohol-Free Concentrated Perfume Oil in Gold Crown Roll-On Bottle with Gift Box, 6 ml & 12 ml",
      description: [
        "A bold, fresh and elegant attar inspired by the famous Creed Aventus: juicy pineapple and blackcurrant up top, a soft floral heart, and a smoky base of birch, warm woods and amber. Confident, classy and loved for every occasion.",
        "This is a pure, concentrated perfume oil with no alcohol, so it is gentle on the skin and suitable to wear for prayer and every day. A few dabs on the wrists, neck or behind the ears are enough, and the fragrance stays with you for hours.",
        "It comes in an elegant gold crown bottle with a gift box, in two sizes: 6 ml and 12 ml. A lovely gift for Eid, weddings, birthdays and special occasions.",
        "Please note: this is a Nawara Trend attar inspired by the Creed Aventus fragrance. It is not made by or connected with Creed; the name is used only to describe the scent.",
        "Includes: 1 attar bottle (6 ml or 12 ml, as chosen) with gift box.",
      ].join("\n\n"),
      price: 252, mrp: 280, stock: 50,
      sizes: ["6 ml", "12 ml"],
      size_prices: [
        { size: "6 ml", price: 252, mrp: 280, image: img(AVENTUS, [`${AVENTUS}-6ml-2.webp`])[0] },
        { size: "12 ml", price: 514, mrp: 571, image: img(AVENTUS, [`${AVENTUS}-12ml-3.webp`])[0] },
      ],
      highlights: [
        "Inspired fragrance: modelled on Creed Aventus",
        "100% alcohol-free concentrated perfume oil",
        "Fresh pineapple and blackcurrant, smoky birch and woods",
        "Bold, elegant and long-lasting",
        "Two sizes: 6 ml and 12 ml",
        "Elegant gold crown bottle with gift box",
        "Perfect gift for Eid, weddings and birthdays",
      ],
      images: img(AVENTUS, [`${AVENTUS}-1.jpg`, `${AVENTUS}-6ml-2.webp`, `${AVENTUS}-12ml-3.webp`]),
      seo_title: "Aventus Attar, Inspired by Creed Aventus",
      seo_description: "Alcohol-free attar inspired by Creed Aventus: pineapple, blackcurrant, smoky birch and woods, gold crown bottle with gift box. 6 ml ₹252, 12 ml ₹514, COD.",
    },
  },
];

async function done(id) {
  const [[r]] = await pool.query("SELECT 1 AS x FROM settings WHERE `key` = ?", [`content.${id}`]);
  return !!r;
}

const json = (v) => (v ? JSON.stringify(v) : null);

/** Turns an existing product into p (keeping its id, code, stock and sales) and archives the ones it replaces.
    False when the product to turn isn't there, so p is added as new instead. */
async function mergeProduct({ from, archive = [] }, p) {
  const [[old]] = await pool.query("SELECT id FROM products WHERE slug = ?", [from]);
  if (archive.length) await pool.query("UPDATE products SET status = 'archived' WHERE slug IN (?)", [archive]);
  if (!old) return false;
  await pool.query(
    `UPDATE products SET slug = ?, name = ?, description = ?, price = ?, mrp = ?, highlights = ?, sizes = ?, size_prices = ?, images = ?,
       seo_title = ?, seo_description = ? WHERE id = ?`,
    [p.slug, p.name, p.description, p.price, p.mrp, JSON.stringify(p.highlights), json(p.sizes), json(p.size_prices),
     JSON.stringify(p.images), p.seo_title, p.seo_description, old.id]);
  return true;
}

async function addProduct(p) {
  const [[exists]] = await pool.query("SELECT id FROM products WHERE slug = ?", [p.slug]);
  if (exists) return false;
  const [[cat]] = await pool.query("SELECT id FROM categories WHERE slug = ?", [p.category]);
  if (!cat) return false;   // a database without this category (e.g. a fresh demo) doesn't get the product
  const [[{ next }]] = await pool.query("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM products");
  await pool.query(
    `INSERT INTO products (slug, category_id, name, description, price, mrp, stock, highlights, sizes, size_prices, images, status, sort_order, seo_title, seo_description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
    [p.slug, cat.id, p.name, p.description, p.price, p.mrp, p.stock, JSON.stringify(p.highlights), json(p.sizes), json(p.size_prices),
     JSON.stringify(p.images), next, p.seo_title, p.seo_description]);
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
    if (u.merge && await mergeProduct(u.merge, u.product)) console.log(`Merged into one product: ${u.product.slug}`);
    else if (u.product && await addProduct(u.product)) console.log(`Added product: ${u.product.slug}`);
    if (u.seo) { const n = await updateSeo(u.seo); if (n) console.log(`Updated SEO titles for ${n} products`); }
    if (u.fields) { const n = await updateFields(u.fields); if (n) console.log(`Updated ${n} product fields`); }
    if (u.images) { const n = await updateImages(u.images); if (n) console.log(`Updated photos for ${n} products`); }
    await pool.query("INSERT INTO settings (`key`, value) VALUES (?, ?)", [`content.${u.id}`, new Date().toISOString()]);
  }
}
