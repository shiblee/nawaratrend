/* Home page order: a fresh mix on every visit that still puts the likeliest picks first.
   - Each product gets a weight: featured, best-selling (pop, 0 to 1 from the server), new, and close to what this
     visitor has in the cart or wishlist or has recently viewed. Out-of-stock items go last.
   - A weighted shuffle turns weights into an order, so heavier items tend to come early but nothing is fixed.
   - Near-identical products (the cup keychains, the water bottles) are spread out rather than shown back to back.
   - Categories are ordered the same way, by the weight of what's in them.
   The shuffle is seeded once per browser session, so going back to the home page keeps the same order. */

const SEEN_KEY = "nt_seen", SEEN_MAX = 12, SEED_KEY = "nt_home_seed";

/** Remembers a product page visit (only with analytics consent: it's used to personalise the home page). */
export function rememberSeen(id, consent) {
  if (!consent?.analytics) return;
  try {
    const seen = JSON.parse(localStorage.getItem(SEEN_KEY)) || [];
    localStorage.setItem(SEEN_KEY, JSON.stringify([id, ...seen.filter((x) => x !== id)].slice(0, SEEN_MAX)));
  } catch { /* private mode: no personalisation */ }
}

function sessionSeed() {
  try {
    let s = Number(sessionStorage.getItem(SEED_KEY));
    if (!s) { s = Math.floor(Math.random() * 2 ** 31) + 1; sessionStorage.setItem(SEED_KEY, String(s)); }
    return s;
  } catch { return Math.floor(Math.random() * 2 ** 31) + 1; }
}

// small seeded random generator (mulberry32), so the same seed gives the same order
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// words that describe a product's look rather than what it is, so "red cup keychain" and "blue cup keychain" match
const NOISE = new Set(["cute", "with", "for", "and", "the", "a", "of", "in", "&", "kids", "soft", "premium", "3d", "mini",
  "red", "blue", "pink", "green", "black", "brown", "navy", "sage", "coffee", "yellow", "white", "sky", "gold-tone"]);
const words = (p) => new Set(String(p.name).toLowerCase().replace(/&amp;/g, "&").split(/[^a-z0-9&-]+/).filter((w) => w.length > 1 && !NOISE.has(w)));
function similarity(a, b) {
  let common = 0;
  a.forEach((w) => { if (b.has(w)) common++; });
  return common / (a.size + b.size - common || 1);
}

/**
 * @param products  the catalogue (each with id, cat, name, stock, featured, pop, isNew)
 * @param cats      categories in their admin order [{k, n}]
 * @param mine      ids in this visitor's cart and wishlist
 * @returns {cats, list} categories and products in home page order (products grouped by category)
 */
export function homeOrder(products, cats, mine = []) {
  const rand = rng(sessionSeed());
  let seen = [];
  try { seen = JSON.parse(localStorage.getItem(SEEN_KEY)) || []; } catch { /* none */ }
  const byId = new Map(products.map((p) => [p.id, p]));
  const w = new Map(products.map((p) => [p.id, words(p)]));
  const likes = [...new Set([...mine, ...seen])].map((id) => byId.get(id)).filter(Boolean);
  const likedCats = new Set(likes.map((p) => p.cat));

  const weight = (p) => {
    if (p.stock === 0) return 0;
    let x = 1;
    if (p.featured) x += 1.5;
    x += 2 * (p.pop || 0);
    if (p.isNew) x += 1;
    // like something the visitor showed interest in (but not the very item, which they already know)
    const close = Math.max(0, ...likes.filter((l) => l.id !== p.id).map((l) => similarity(w.get(p.id), w.get(l.id))));
    x += 2.5 * close;
    if (likedCats.has(p.cat)) x += 0.5;
    return x;
  };
  // weighted shuffle (Efraimidis–Spirakis): bigger weight, smaller key on average; out of stock always last
  const key = new Map(products.map((p) => {
    const wt = weight(p);
    return [p.id, wt > 0 ? -Math.log(rand()) / wt : 1e9 + rand()];
  }));
  const ranked = (list) => [...list].sort((a, b) => key.get(a.id) - key.get(b.id));

  // spread near-identical products: group look-alikes into families, then place them like "no two in a row":
  // the best-ranked item whose family differs from the last one, unless the biggest family must go now to fit
  const spread = (list) => {
    const left = ranked(list), fam = new Map();
    left.forEach((p, i) => {
      const twin = left.slice(0, i).find((q) => similarity(w.get(p.id), w.get(q.id)) >= 0.5);
      fam.set(p.id, twin ? fam.get(twin.id) : p.id);
    });
    const out = [];
    while (left.length) {
      const count = new Map();
      left.forEach((p) => count.set(fam.get(p.id), (count.get(fam.get(p.id)) || 0) + 1));
      const [bigFam, bigN] = [...count].sort((a, b) => b[1] - a[1])[0];
      const prevFam = out.length ? fam.get(out[out.length - 1].id) : null;
      let i;
      if (bigN > Math.ceil(left.length / 2) - (bigFam === prevFam ? 0 : 0.5) && bigFam !== prevFam) i = left.findIndex((p) => fam.get(p.id) === bigFam);
      else i = left.findIndex((p) => fam.get(p.id) !== prevFam);
      if (i < 0) i = 0;
      out.push(left.splice(i, 1)[0]);
    }
    return out;
  };

  const groups = cats.map((c) => ({ c, items: spread(products.filter((p) => p.cat === c.k)) })).filter((g) => g.items.length);
  // a category's key: the average of its three best keys (so a big category doesn't win just by size),
  // halved when the visitor showed interest in that category
  const catKey = (g) => {
    const k = g.items.map((p) => key.get(p.id)).sort((a, b) => a - b).slice(0, 3);
    return (k.reduce((s, x) => s + x, 0) / k.length) / (likedCats.has(g.c.k) ? 2 : 1);
  };
  groups.sort((a, b) => catKey(a) - catKey(b));
  return { cats: groups.map((g) => g.c), list: groups.flatMap((g) => g.items) };
}
