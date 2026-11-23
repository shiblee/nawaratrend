/* Shared storefront behaviour (header, cart, wishlist, footer) plus the homepage sections.
   Call after the page markup is in the DOM; returns a cleanup function that removes global
   listeners, timers and observers (needed when React unmounts the page). */

import { BASE_URL } from "../services/api.js";
import { initConsent } from "./consent.js";
import { currentCustomer, assetUrl } from "../services/customerApi.js";

/* The catalogue comes from the database (GET /api/store/catalog). These sample values are only
   used if the server can't be reached, so the shop still opens. Edit products in the admin panel. */
let FREE_SHIP = 999;
let DELIVERY_FEE = 49;
let COD_ENABLED = true;
let BANNER = null;   // home page banner from the admin Settings page
// contact numbers and the WhatsApp button come from the admin Settings page
const CONTACT = { phone: "+91 89608 88231", whatsapp: "+91 98075 62620", whatsappEnabled: true, whatsappMessage: "" };
const categories = [
  {k:"electronics", n:"Electronics"},
  {k:"fashion", n:"Fashion"},
  {k:"home", n:"Home & Kitchen"},
  {k:"beauty", n:"Beauty & Care"},
  {k:"kids", n:"Kids & Toys"},
  {k:"accessories", n:"Accessories"},
  {k:"school-essentials", n:"School Essentials"}
];
const products = [
  {id:"mens-premium-black-shirt", cat:"fashion", name:"Men's Premium Black Shirt, Full Sleeve with Embroidered Emblem", price:499, mrp:713, rate:0, reviews:0, stock:50, sizes:["M","L","XL"],
   desc:"A classic black shirt that goes from office meetings to evening plans, with a crisp spread collar, buttoned cuffs and an embroidered horse-rider emblem.",
   points:["Crisp spread collar that holds its shape","Embroidered horse-rider emblem on the chest","Comfortable fit for office, occasions and everyday wear"],
   img:"https://nawaratrend.com/products/mens-black-shirt/1.jpg"},
  {id:"mens-premium-sage-green-shirt", cat:"fashion", name:"Men's Premium Sage Green Shirt, Full Sleeve with Embroidered Emblem", price:499, mrp:713, rate:0, reviews:0, stock:50, sizes:["M","L","XL"],
   desc:"A fresh sage green shirt with a sharp spread collar, breathable fabric and an embroidered horse-rider emblem, for workdays and weekends alike.",
   points:["Soft sage green shade that suits every season","Embroidered horse-rider emblem on the chest","Breathable fabric for all-day comfort"],
   img:"https://nawaratrend.com/products/mens-sage-green-shirt/1.jpg"},
  {id:"mens-premium-coffee-brown-shirt", cat:"fashion", name:"Men's Premium Coffee Brown Shirt, Full Sleeve with Gold NT Crown Embroidery", price:499, mrp:713, rate:0, reviews:0, stock:50, sizes:["M","L","XL"],
   desc:"A rich coffee brown shirt with our signature gold Nawara Trend crown embroidery, tan buttons and a sharp spread collar.",
   points:["Rich coffee brown shade with tan buttons","Signature gold Nawara Trend crown embroidery on the chest","Woven Nawara Trend label at the neck"],
   img:"https://nawaratrend.com/products/mens-coffee-brown-shirt/1.jpg"},
  {id:"mens-premium-navy-blue-shirt", cat:"fashion", name:"Men's Premium Navy Blue Shirt, Full Sleeve with Gold NT Crown Embroidery", price:499, mrp:713, rate:0, reviews:0, stock:50, sizes:["M","L","XL"],
   desc:"A deep navy blue shirt with our signature gold Nawara Trend crown embroidery, a premium spread collar and tonal navy buttons.",
   points:["Deep navy blue shade with tonal navy buttons","Signature gold Nawara Trend crown embroidery on the chest","Premium spread collar with woven Nawara Trend label"],
   img:"https://nawaratrend.com/products/mens-navy-blue-shirt/1.jpg"},
  {id:"kids-puppy-water-bottle-500ml-blue", cat:"school-essentials", name:"Kids Water Bottle 500 ml, Fashion Double Drinking Cup with Cute Puppy Topper, 2-in-1 Straw & Sip Lid, Lock and Carry Strap, Sky Blue", price:649, mrp:927, rate:0, reviews:0, stock:50,
   desc:"A cute and sturdy 500 ml water bottle for kids, a Fashion Double Drinking Cup with a 3D puppy topper, a 2-in-1 lid for straw or direct drinking, a push-button lock against spills and a carry strap for school, sports and trips.",
   points:["500 ml capacity, about 21 cm tall and 7.5 cm wide","2-in-1 lid: drink with the straw or sip directly","Push-button flip lid with secure lock: no spills, no leaks","BPA-free, lightweight and durable with a carry strap"],
   img:"https://nawaratrend.com/products/kids-puppy-water-bottle/1.jpg"},
  {id:"kids-blue-alien-water-bottle-500ml", cat:"school-essentials", name:"Kids Water Bottle 500 ml, Fashion Double Drinking Cup with Cute Blue Alien Topper, 2-in-1 Straw & Sip Lid, Lock and Carry Strap", price:649, mrp:927, rate:0, reviews:0, stock:50,
   desc:"A fun 500 ml kids water bottle, a Fashion Double Drinking Cup with a cheeky 3D blue alien topper, a 2-in-1 lid for straw or direct drinking, a push-button lock against spills and a carry strap.",
   points:["500 ml capacity, just right for a school day","2-in-1 lid: drink with the straw or sip directly","Flip-open lid with push-button lock: no spills, no leaks","BPA-free, lightweight and durable with a carry strap"],
   img:"https://nawaratrend.com/products/kids-blue-alien-water-bottle/1.jpg"},
  {id:"kids-pink-bunny-water-bottle-500ml", cat:"school-essentials", name:"Kids Water Bottle 500 ml, Fashion Double Drinking Cup with Cute Pink Bunny Topper, 2-in-1 Straw & Sip Lid, Lock and Carry Strap, Pink", price:649, mrp:927, rate:0, reviews:0, stock:50,
   desc:"A pretty pink 500 ml kids water bottle, a Fashion Double Drinking Cup with a cute 3D bunny topper, a 2-in-1 lid for straw or direct drinking, a leak-proof push-button lock and a printed carry strap.",
   points:["500 ml capacity, about 22 cm tall and 7.5 cm wide","2-in-1 lid: drink with the straw or sip directly","Push-button flip lid with secure lock and silicone seal: leak-proof","BPA-free, food-grade, lightweight with a carry strap"],
   img:"https://nawaratrend.com/products/kids-pink-bunny-water-bottle/4.webp"},
  {id:"kids-pink-kitty-water-bottle-500ml", cat:"school-essentials", name:"Kids Water Bottle 500 ml, Fashion Double Drinking Cup with Cute Kitty Topper, 2-in-1 Straw & Sip Lid, Lock and Carry Strap, Pink", price:649, mrp:927, rate:0, reviews:0, stock:50,
   desc:"A cute pink 500 ml kids water bottle, a Fashion Double Drinking Cup with a 3D kitty topper, a dual drinking lid for straw or direct sipping, a push-button lock and a printed carry strap.",
   points:["500 ml capacity, just right for a school day","Dual drinking design: straw or direct sip","Flip-open lid with push-button secure lock: no spills","Lightweight and durable with a printed carry strap"],
   img:"https://nawaratrend.com/products/kids-pink-kitty-water-bottle/1.jpg"},
  {id:"cute-panda-3d-puffy-stickers", cat:"school-essentials", name:"Cute Panda 3D Puffy Stickers for Kids, Easy-Peel Water Resistant Sticker Paste Sheet for Notebooks, Water Bottles & Phone Cases", price:149, mrp:213, rate:0, reviews:0, stock:50,
   desc:"A sheet of adorable panda 3D puffy stickers that are easy to peel and water resistant, for notebooks, water bottles, phone cases and gifting.",
   points:["3D puffy design that stands out","Easy to peel and water resistant","For notebooks, water bottles and phone cases","Great for birthday and return gifts"],
   img:"https://nawaratrend.com/products/cute-panda-3d-puffy-stickers/2.webp"},
  {id:"cute-food-veggie-3d-puffy-stickers", cat:"school-essentials", name:"Cute Food & Veggie 3D Puffy Stickers for Kids, Easy-Peel Water Resistant Sticker Paste Sheet for Notebooks, Water Bottles & Phone Cases", price:149, mrp:213, rate:0, reviews:0, stock:50,
   desc:"A sheet of cute food and veggie 3D puffy stickers that are easy to peel and water resistant, for notebooks, water bottles, phone cases and gifting.",
   points:["3D puffy design that stands out","Easy to peel and water resistant","For notebooks, water bottles and phone cases","Great for birthday and return gifts"],
   img:"https://nawaratrend.com/products/cute-food-veggie-3d-puffy-stickers/1.jpg"},
  {id:"kids-backpack-pencil-pouch", cat:"school-essentials", name:"Kids Backpack Shape Pencil Pouch, Multi-Zip Stationery Bag with Transparent Round Pocket, Water Resistant, 5 Colours", price:299, mrp:427, rate:0, reviews:0, stock:50,
   colors:[{name:"Yellow",hex:"#F5C518",image:"https://nawaratrend.com/products/kids-backpack-pencil-pouch/2.webp"},{name:"Green",hex:"#8DBB8F",image:"https://nawaratrend.com/products/kids-backpack-pencil-pouch/1.jpg"},{name:"Purple",hex:"#8B5FBF",image:"https://nawaratrend.com/products/kids-backpack-pencil-pouch/3.webp"},{name:"Blue",hex:"#1E73D2",image:"https://nawaratrend.com/products/kids-backpack-pencil-pouch/4.webp"},{name:"Grey",hex:"#8A8D93",image:"https://nawaratrend.com/products/kids-backpack-pencil-pouch/5.webp"}],
   desc:"A mini school bag shaped pencil pouch with multiple zip compartments, a transparent round pocket and a fun cartoon print, in five colours.",
   points:["Mini school bag shape with cartoon print","Multiple zips and a transparent round pocket","Water resistant, easy to clean","Five colours: choose one or mix several"],
   images:["https://nawaratrend.com/products/kids-backpack-pencil-pouch/1.jpg","https://nawaratrend.com/products/kids-backpack-pencil-pouch/2.webp","https://nawaratrend.com/products/kids-backpack-pencil-pouch/3.webp","https://nawaratrend.com/products/kids-backpack-pencil-pouch/4.webp","https://nawaratrend.com/products/kids-backpack-pencil-pouch/5.webp","https://nawaratrend.com/products/kids-backpack-pencil-pouch/6.webp","https://nawaratrend.com/products/kids-backpack-pencil-pouch/7.webp"],
   img:"https://nawaratrend.com/products/kids-backpack-pencil-pouch/1.jpg"},
  {id:"burger-panda-keychain-pouch", cat:"accessories", name:"Cute Burger Keychain Pouch with 3D Panda, Soft Silicone Mini Storage Pouch & Bag Charm for Coins, Earbuds & Keys", price:199, mrp:284, rate:0, reviews:0, stock:50,
   desc:"A burger-shaped soft silicone keychain pouch with an adorable 3D panda on top: a keychain, bag charm and mini pouch for coins and earbuds in one.",
   points:["Adorable 3D panda on top","Mini pouch for coins and earbuds","Soft, durable and flexible silicone","Keychain and bag charm in one"],
   img:"https://nawaratrend.com/products/burger-panda-keychain-pouch/1.jpg"}
];

const ICON = {
  electronics:'<rect x="5" y="2" width="14" height="20" rx="3"/><path d="M10 18h4"/>',
  fashion:'<path d="M8 3 4 6l2 4 2-1v12h8V9l2 1 2-4-4-3c-.5 1.7-2 3-4 3S8.5 4.7 8 3z"/>',
  home:'<path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  beauty:'<rect x="9" y="9" width="6" height="12" rx="1.5"/><path d="M10 9V6l4-3v6"/>',
  kids:'<circle cx="12" cy="13" r="7"/><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M10 16c1.2 1 2.8 1 4 0"/>',
  accessories:'<rect x="5" y="7" width="14" height="14" rx="3"/><path d="M9 7V5a3 3 0 0 1 6 0v2M5 13h14"/>',
  "school-essentials":'<path d="M8 6V5a4 4 0 0 1 8 0v1"/><rect x="5" y="6" width="14" height="16" rx="4"/><path d="M9 14h6v4H9z"/><path d="M5 12h14"/>'
};
const svg = (k, sw=1.6) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]||ICON.home}</svg>`;
const check = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4.5 4.5L19 7"/></svg>';
const heart = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.6 3.3 5 6.8 5c2 0 3.4 1.1 5.2 3 1.8-1.9 3.2-3 5.2-3 3.5 0 5.6 3.6 4.3 6.8C19.5 16.4 12 21 12 21z"/></svg>';
const inr = n => "₹" + n.toLocaleString("en-IN");
const off = p => Math.round((1 - p.price/p.mrp)*100);
const pad = n => String(n).padStart(2,"0");
const catName = k => (categories.find(c => c.k===k)||{}).n || k;
const stars = r => "★★★★★".slice(0, Math.round(r)) + "☆☆☆☆☆".slice(0, 5 - Math.round(r));
const $ = id => document.getElementById(id);

// keep catalogue order grouped by category, and number products in that order (refilled in place by loadCatalog)
const ordered = [], used = [];
function regroup(){
  ordered.splice(0, ordered.length, ...categories.flatMap(c => products.filter(p => p.cat===c.k)));
  ordered.forEach((p,i) => p.no = i+1);
  used.splice(0, used.length, ...categories.filter(c => ordered.some(p => p.cat===c.k)));
}
regroup();

// Product text is inserted as HTML across the shop, so neutralise tags coming from the database.
const safe = v => String(v ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

let catalogAt = 0, catalogPromise = null;
/** Loads products, categories and delivery rules from the server (cached for a minute). */
export function loadCatalog(){
  if(catalogPromise && Date.now() - catalogAt < 60000) return catalogPromise;
  catalogAt = Date.now();
  catalogPromise = fetch(`${BASE_URL}/store/catalog`)
    .then(r => { if(!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(d => {
      FREE_SHIP = d.settings.freeShipping; DELIVERY_FEE = d.settings.deliveryFee; COD_ENABLED = d.settings.codEnabled;
      Object.assign(CONTACT, { phone: d.settings.phone || CONTACT.phone, whatsapp: d.settings.whatsapp || CONTACT.whatsapp,
        whatsappEnabled: d.settings.whatsappEnabled !== false, whatsappMessage: d.settings.whatsappMessage || "" });
      BANNER = d.settings.banner && /^https?:\/\//i.test(d.settings.banner.image) ? d.settings.banner : null;
      categories.splice(0, categories.length, ...d.categories.map(c => ({k: safe(c.k), n: safe(c.n)})));
      products.splice(0, products.length, ...d.products.map(p => ({...p, id: safe(p.id), cat: safe(p.cat), name: safe(p.name), desc: safe(p.desc),
        points: (p.points || []).map(safe), sizes: p.sizes && p.sizes.map(safe),
        colors: p.colors && p.colors.map(c => ({...c, name: safe(c.name)}))})));
      regroup();
      restoreSaved();
      return "live";
    })
    .catch(err => {
      console.warn("Couldn't load the catalogue from the server, showing sample products instead:", err.message);
      catalogAt = 0;   // try again on the next page
      restoreSaved();
      return "sample";
    });
  return catalogPromise;
}

/** The "add" control for a product: a size or colour picker link, a disabled "Out of stock" button, or a real add button. */
export const buyControl = (p, cls, label = "Add to cart") =>
  p.stock === 0 ? `<button type="button" class="btn btn-ink ${cls}" disabled>Out of stock</button>`
  : p.sizes || p.colors ? `<a class="btn btn-ink ${cls}" href="/product/${p.id}">Choose ${p.sizes && p.colors ? "options" : p.sizes ? "size" : "colour"}</a>`
  : `<button type="button" class="btn btn-ink ${cls}" data-buy>${label}</button>`;

// a real photo fills the frame (over a blurred copy of itself, so any shape fits); otherwise the category icon on a plinth
const cssUrl = u => `url("${String(u).replace(/["\\\n]/g, "")}")`;
const art = p => p.img
  ? `<div class="art has-photo" style="--ph:${cssUrl(p.img)}"><img src="${p.img}" alt="${p.alt ?? p.name}" decoding="async"></div>`
  : `<div class="art" style="background:var(--${p.cat}-bg);color:var(--${p.cat})">${svg(p.cat)}<span class="no" aria-hidden="true">${pad(p.no)}</span></div>`;
/** Star rating, or a "New" label while a product has no reviews yet (never show 0 stars). */
export const ratingHtml = (p, long) => p.reviews > 0 && p.rate > 0
  ? null : `<span class="new-badge">New${long ? " arrival" : ""}</span>`;

// Cart and wishlist live at module level so they survive moving between pages, and are saved in the
// browser so they survive a refresh. Cart keys are "productId", "productId|size" or "productId|size|colour"
// (the size is empty for a product that only has colours: "productId||Yellow").
const cart = {}; // key -> qty
const wish = new Set();
export const cartKey = (id, size, color) => color ? `${id}|${size || ""}|${color}` : size ? `${id}|${size}` : id;
export const parseKey = key => { const [id, size, color] = key.split("|"); return {id, size: size || null, color: color || null}; };
/** "Size M · Yellow · " in front of a price or quantity; empty when the product has no options. */
export const optsText = ({size, color}) => [size && `Size ${size}`, color].filter(Boolean).map(x => x + " · ").join("");
/** The small picture on a cart line: the photo of the colour chosen, otherwise the category icon. */
export const lineThumb = (p, color) => {
  const img = p.colors?.find(c => c.name === color)?.image;
  return `<span class="thumb" style="background:var(--${p.cat}-bg);color:var(--${p.cat})">${img ? `<img src="${img}" alt="">` : svg(p.cat, 1.8)}</span>`;
};
const store = {
  get(k){ try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: keep for this visit only */ } },
};
function restoreSaved(){
  const known = id => products.some(p => p.id === id);
  // a colour that's no longer sold (or a product that gained or lost its colours) can't stay in the cart
  const colorOk = ({id, color}) => { const cs = products.find(p => p.id === id)?.colors; return cs ? cs.some(c => c.name === color) : !color; };
  Object.keys(cart).forEach(k => delete cart[k]);
  Object.entries(store.get("nt_cart") || {}).forEach(([k, q]) => { const l = parseKey(k); if(known(l.id) && colorOk(l) && q > 0) cart[k] = Math.min(10, q|0); });
  wish.clear();
  (store.get("nt_wish") || []).forEach(id => known(id) && wish.add(id));
}
const saveCart = () => store.set("nt_cart", cart);
const saveWish = () => store.set("nt_wish", [...wish]);

// Shared with page scripts (e.g. the Shop page). `actions` is filled in by initStorefront.
export const actions = {};
export { ordered, used, svg, inr, off, art, catName, check, stars, pad, wish, cart, FREE_SHIP, DELIVERY_FEE, COD_ENABLED };

/* ---------- contact numbers ----------
   The page markup is written with the original numbers; this swaps in the ones from the admin
   Settings page everywhere: WhatsApp links, tel: links, copy buttons and the numbers as text. */
const SAMPLE_WA = "919807562620", SAMPLE_PHONE = "918960888231";
const digits91 = v => { const d = String(v || "").replace(/\D/g, ""); return d.length === 10 ? "91" + d : d; };
const pretty = d => d.length === 12 && d.startsWith("91") ? `+91 ${d.slice(2, 7)} ${d.slice(7)}` : "+" + d;
export function syncContacts(root = document.body){
  const wa = digits91(CONTACT.whatsapp), tel = digits91(CONTACT.phone);
  root.querySelectorAll('a[href*="wa.me/"]').forEach(a => {
    const url = new URL(a.href);
    url.pathname = "/" + wa;
    // links without their own message (header, footer, floating button) start with the shop's greeting
    if (!url.searchParams.has("text") && CONTACT.whatsappMessage) url.searchParams.set("text", CONTACT.whatsappMessage);
    a.href = url.toString();
  });
  root.querySelectorAll(`a[href^="tel:"]`).forEach(a => { if(a.getAttribute("href").replace(/\D/g, "") === SAMPLE_PHONE) a.href = "tel:+" + tel; });
  root.querySelectorAll("[data-copy]").forEach(b => {
    const d = b.dataset.copy.replace(/\D/g, "");
    if(d === SAMPLE_WA) b.dataset.copy = pretty(wa); else if(d === SAMPLE_PHONE) b.dataset.copy = pretty(tel);
  });
  const swap = { [pretty(SAMPLE_WA)]: pretty(wa), [pretty(SAMPLE_PHONE)]: pretty(tel) };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for(let n; (n = walker.nextNode());){
    let t = n.nodeValue;
    for(const [from, to] of Object.entries(swap)) if(from !== to && t.includes(from)) t = t.split(from).join(to);
    if(t !== n.nodeValue) n.nodeValue = t;
  }
  root.querySelectorAll("a[title]").forEach(a => { for(const [from, to] of Object.entries(swap)) a.title = a.title.split(from).join(to); });
  const float = root.querySelector(".wa");
  if(float) float.hidden = !CONTACT.whatsappEnabled;
}

/** Header account icon: the customer's photo (or initial) once signed in. Called again when the profile changes. */
export function syncAccountIcon(){
  const me = currentCustomer(), acct = document.querySelector(".acct-btn");
  if(!me || !acct) return;
  acct.setAttribute("aria-label", `My account (${me.name})`);
  acct.dataset.tip = "My account";
  const pic = document.createElement("span");
  pic.className = "acct-pic";
  if(me.avatar){ const img = document.createElement("img"); img.src = assetUrl(me.avatar); img.alt = ""; pic.append(img); }
  else pic.textContent = (me.name || "?").trim().charAt(0).toUpperCase();
  acct.replaceChildren(pic);
}

export function initStorefront(){
  const ac = new AbortController();
  const sig = {signal: ac.signal};
  const stopConsent = initConsent();
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };

  syncAccountIcon();

  /* ---------- Toast ---------- */
  let tt; const say = m => { const t=$("toast"); t.textContent=m; t.classList.add("show"); clearTimeout(tt); timers.delete(tt); tt=later(()=>t.classList.remove("show"),2200); };
  const bump = (el,n) => { el.textContent=n; el.dataset.n=n; el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); };

  /* ---------- Cart ---------- */
  const inCart = id => Object.keys(cart).filter(k => parseKey(k).id === id).reduce((s, k) => s + cart[k], 0);
  const addToCart = (p, q=1, size=null) => addLines(p, [{q, size, color: null}]);
  /** Adds several options of one product together, e.g. two yellow and one green: lines = [{q, size, color}].
      Returns false (and explains why) if they can't all be added. */
  function addLines(p, lines){
    if(p.sizes && lines.some(l => !l.size)){ say("Please choose a size on the product page"); return false; }
    if(p.colors && (!lines.length || lines.some(l => !l.color))){ say("Please choose a colour on the product page"); return false; }
    const q = lines.reduce((s, l) => s + l.q, 0);
    if(p.stock === 0){ say(`Sorry, ${p.name} is out of stock`); return false; }
    if(p.stock != null && inCart(p.id) + q > p.stock){ say(`Only ${p.stock} of this item in stock`); return false; }
    lines.forEach(l => { const k = cartKey(p.id, l.size, l.color); cart[k] = Math.min(10, (cart[k]||0) + l.q); });
    renderCart();
    const [one] = lines, opts = [one.size && `Size ${one.size}`, lines.length > 1 ? `${lines.length} colours` : one.color].filter(Boolean).join(", ");
    say(`Added to cart: ${p.name}${opts ? ` (${opts})` : ""}`);
    return true;
  }
  function renderCart(){
    const keys = Object.keys(cart).filter(k => cart[k] > 0 && products.some(p => p.id === parseKey(k).id));
    const line = k => ({...parseKey(k), p: products.find(p => p.id === parseKey(k).id), q: cart[k]});
    const count = keys.reduce((s,k)=>s+cart[k],0);
    const total = keys.map(line).reduce((s,l)=>s+l.q*l.p.price,0);
    bump($("cartCount"), count);
    $("dTotal").textContent = inr(total);
    const left = Math.max(0, FREE_SHIP - total);
    $("ship").innerHTML = (left > 0 ? `Add <b>${inr(left)}</b> more for free delivery` : `🎉 You've unlocked <b>free delivery</b>`) +
      `<div class="bar"><i style="width:${Math.min(100, total/FREE_SHIP*100)}%"></i></div>`;
    $("checkout").hidden = count === 0;
    $("dItems").innerHTML = count ? keys.map(k => {
      const {p, size, color, q} = line(k);
      return `<div class="d-item" data-key="${k}">
        ${lineThumb(p, color)}
        <div><b>${p.name}</b><span class="sm">${optsText({size, color})}${inr(p.price)} each</span>
          <div class="qty"><button data-d="-1" aria-label="Decrease">−</button><output>${q}</output><button data-d="1" aria-label="Increase">+</button></div></div>
        <div style="text-align:right"><b style="font-variant-numeric:tabular-nums">${inr(p.price*q)}</b><button class="rm" data-rm>Remove</button></div>
      </div>`;
    }).join("") : `<div class="d-empty">Your cart is empty.<br>Browse the catalogue to add something.</div>`;
    saveCart();
    dispatchEvent(new Event("nt:cart"));   // lets a page (e.g. checkout) refresh its own view of the cart
  }
  $("dItems").addEventListener("click", e => {
    const row = e.target.closest(".d-item"); if(!row) return;
    const k = row.dataset.key, p = products.find(x => x.id === parseKey(k).id);
    if(e.target.closest("[data-rm]")) delete cart[k];
    const d = e.target.closest("[data-d]");
    if(d){
      if(+d.dataset.d > 0 && p.stock != null && inCart(p.id) >= p.stock) say(`Only ${p.stock} of this item in stock`);
      else if(+d.dataset.d > 0 && cart[k] >= 10) say("Maximum 10 per order");
      else cart[k] = Math.max(0, cart[k] + +d.dataset.d);
    }
    renderCart();
  });
  const scrim=$("scrim");
  let lastFocus;
  function panel(el, o){
    document.querySelectorAll(".drawer.open").forEach(d => { if(d!==el){ d.classList.remove("open"); d.setAttribute("aria-hidden","true"); } });
    if(o) lastFocus = document.activeElement;
    el.classList.toggle("open",o); el.setAttribute("aria-hidden",!o);
    scrim.classList.toggle("open",o); document.body.classList.toggle("lock",o);
    if(o) el.querySelector(".d-head .icon-btn").focus(); else if(lastFocus) lastFocus.focus();
  }
  const openCart = o => panel($("drawer"), o);
  const openWish = o => { if(o) renderWish(); panel($("wDrawer"), o); };
  $("cartBtn").onclick = () => openCart(true);
  $("cartClose").onclick = () => openCart(false);
  $("wishBtn").onclick = () => openWish(true);
  $("wishClose").onclick = () => openWish(false);
  scrim.onclick = () => document.querySelectorAll(".drawer.open").forEach(d => panel(d,false));
  document.addEventListener("keydown", e => { if(e.key==="Escape") document.querySelectorAll(".drawer.open").forEach(d => panel(d,false)); }, sig);

  function toggleWish(p){
    const on = !wish.has(p.id);
    on ? wish.add(p.id) : wish.delete(p.id);
    document.querySelectorAll(`[data-wish="${p.id}"]`).forEach(b => b.setAttribute("aria-pressed", on));
    bump($("wishCount"), wish.size);
    saveWish();
    say(on ? "Saved to wishlist" : "Removed from wishlist");
    if($("wDrawer").classList.contains("open")) renderWish();
  }
  function renderWish(){
    $("wItems").innerHTML = wish.size ? [...wish].map(id => {
      const p = products.find(x=>x.id===id);
      return `<div class="d-item" data-id="${id}">
        <span class="thumb" style="background:var(--${p.cat}-bg);color:var(--${p.cat})">${svg(p.cat,1.8)}</span>
        <div><b>${p.name}</b><span class="sm">${inr(p.price)} <s>${inr(p.mrp)}</s></span>
          <div class="w-actions">${buyControl(p, "", "Move to cart").replace("data-buy", "data-move")}<button class="rm" data-unwish>Remove</button></div></div>
        <span></span></div>`;
    }).join("") : `<div class="d-empty">Your wishlist is empty.<br>Tap ♡ on any product to save it for later.</div>`;
  }
  $("wItems").addEventListener("click", e => {
    const row = e.target.closest(".d-item"); if(!row) return;
    const p = products.find(x=>x.id===row.dataset.id);
    if(e.target.closest("[data-move]")){ if(addToCart(p)) toggleWish(p); }
    else if(e.target.closest("[data-unwish]")) toggleWish(p);
  });

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Home banner (homepage only) ----------
     When an image is set in Admin → Settings → Home page banner, it replaces the welcome section. */
  if($("hero") && BANNER){
    const pic = document.createElement("picture");
    if(BANNER.mobile){ const src = document.createElement("source"); src.media = "(max-width:640px)"; src.srcset = BANNER.mobile; pic.append(src); }
    const img = Object.assign(document.createElement("img"), { src: BANNER.image, alt: BANNER.alt || "", decoding: "async", fetchPriority: "high" });
    img.onerror = () => { $("hero")?.classList.remove("has-banner"); $("heroBanner")?.replaceChildren(); };   // broken link: keep the welcome section
    pic.append(img);
    let box = pic;
    if(BANNER.link){ box = Object.assign(document.createElement("a"), { href: BANNER.link, className: "hb-link" }); if(!BANNER.alt) box.setAttribute("aria-label", "View offer"); box.append(pic); }
    $("heroBanner").replaceChildren(box);
    $("hero").classList.add("has-banner");
  }

  /* ---------- Category links (all pages) ---------- */
  const catLink = (c, cls) => { const n = ordered.filter(p=>p.cat===c.k).length;
    return `<a class="${cls}" href="/shop/${c.k}"><span class="ic" style="background:var(--${c.k}-bg);color:var(--${c.k})">${svg(c.k,1.9)}</span><span><b>${c.n}</b><small>${n} item${n>1?"s":""}</small></span></a>`; };
  $("ddCats").innerHTML = used.map(c => catLink(c,"dd-cat")).join("");
  $("mCats").innerHTML = used.map(c => catLink(c,"")).join("");
  $("footCats").innerHTML = used.map(c => `<li><a href="/shop/${c.k}">${c.n}</a></li>`).join("");
  // About page: category tiles and the "shelf" illustration
  if($("aboutCats")) $("aboutCats").innerHTML = used.map(c => `<a href="/shop/${c.k}"><span class="ic" style="background:var(--${c.k}-bg);color:var(--${c.k})">${svg(c.k,1.8)}</span><b>${c.n}</b></a>`).join("");
  if($("shelfArt")) $("shelfArt").innerHTML = used.map(c => `<span class="tile" style="background:var(--${c.k}-bg);color:var(--${c.k})">${svg(c.k,1.6)}</span>`).join("");
  document.querySelectorAll("nav.main .nav-link[href]").forEach(a => {
    if(a.getAttribute("href")===location.pathname) a.setAttribute("aria-current","page"); else a.removeAttribute("aria-current");
  });

  /* ---------- Catalogue (homepage only) ---------- */
  let spy = null;
  if($("groups")){
  $("index").innerHTML = used.map(c => {
    const items = ordered.filter(p => p.cat===c.k);
    return `<li><a class="ix-cat" href="#g-${c.k}"><span class="ic" style="background:var(--${c.k}-bg);color:var(--${c.k})">${svg(c.k,1.9)}</span>${c.n}</a>
      <ul class="ix-items">${items.map(p => `<li><a href="#p-${p.id}" data-ix="${p.id}"><span>${p.name}</span><span>${inr(p.price)}</span></a></li>`).join("")}</ul></li>`;
  }).join("");
  $("chipbar").innerHTML = used.map(c => `<a href="#g-${c.k}" data-chip="${c.k}">${c.n}</a>`).join("");

  const groups = $("groups");
  used.forEach(c => {
    const items = ordered.filter(p => p.cat===c.k);
    const g = document.createElement("section");
    g.className = "group"; g.id = `g-${c.k}`; g.dataset.cat = c.k;
    g.innerHTML = `<div class="group-head"><span class="ic" style="background:var(--${c.k}-bg);color:var(--${c.k})">${svg(c.k,1.8)}</span><h3>${c.n}</h3><span class="rule"></span></div>`;
    items.forEach(p => {
      const el = document.createElement("article");
      el.className = "spread"; el.id = `p-${p.id}`; el.dataset.id = p.id;
      el.innerHTML = `
        <div class="stage">${art(p)}<span class="off">−${off(p)}%</span><button class="wish" data-wish="${p.id}" aria-pressed="false" aria-label="Save ${p.name} to wishlist">${heart}</button></div>
        <div class="info">
          <div class="info-top"><span class="tag" style="background:var(--${c.k}-bg);color:var(--${c.k})">${c.n}</span></div>
          <h4><a href="/product/${p.id}" class="pd-link">${p.name}</a></h4>
          <p class="desc">${p.desc}</p>
          <ul>${p.points.slice(0,2).map(x => `<li><span class="ck">${check}</span><span>${x}</span></li>`).join("")}</ul>
          <div class="meta">${ratingHtml(p, true) || `<div class="rating"><span class="stars" aria-hidden="true">${stars(p.rate)}</span><b>${p.rate}</b><span>(${p.reviews} reviews)</span></div>`}
          ${p.left ? `<span class="stock">Only ${p.left} left</span>` : ""}</div>
          <div class="buy">
            <div class="price"><b>${inr(p.price)}</b><s>${inr(p.mrp)}</s><span class="save">Save ${inr(p.mrp-p.price)}</span></div>
            <div class="actions">
              ${p.sizes || p.colors || p.stock === 0 ? "" : `<div class="qty"><button data-q="-1" aria-label="Decrease quantity">−</button><output>1</output><button data-q="1" aria-label="Increase quantity">+</button></div>`}
              ${buyControl(p, "add")}
            </div>
          </div>
        </div>`;
      const out = el.querySelector("output");
      el.querySelectorAll("[data-q]").forEach(b => b.onclick = () => out.textContent = Math.max(1, Math.min(10, +out.textContent + +b.dataset.q)));
      const add = el.querySelector("[data-buy]");
      if(add) add.onclick = () => {
        if(!addToCart(p, +out.textContent)) return;
        out.textContent = 1;
        add.textContent = "✓ Added"; add.classList.add("added");
        later(()=>{ add.textContent = "Add to cart"; add.classList.remove("added"); }, 1500);
      };
      el.querySelector(".wish").onclick = () => toggleWish(p);
      g.appendChild(el);
    });
    groups.appendChild(g);
  });

  /* Scrollspy: highlight the product in view */
  spy = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if(!en.isIntersecting) return;
      const id = en.target.dataset.id, cat = products.find(p=>p.id===id).cat;
      document.querySelectorAll("[data-ix]").forEach(a => a.classList.toggle("on", a.dataset.ix===id));
      const pos = ordered.findIndex(p => p.id===id) + 1;
      $("ixCount").innerHTML = `<b>${pad(pos)}</b> / ${pad(ordered.length)}`;
      $("ixBar").style.width = (pos/ordered.length*100) + "%";
      document.querySelectorAll("[data-chip]").forEach(a => {
        const on = a.dataset.chip===cat; a.classList.toggle("on", on);
        if(on) a.scrollIntoView({block:"nearest", inline:"center", behavior: reduce ? "auto" : "smooth"});
      });
    });
  }, {rootMargin:"-45% 0px -50% 0px"});
  document.querySelectorAll(".spread").forEach(s => spy.observe(s));
  $("ixCount").innerHTML = `<b>00</b> / ${pad(ordered.length)}`;
  }

  const clearCart = () => { Object.keys(cart).forEach(id => delete cart[id]); renderCart(); };
  Object.assign(actions, {addToCart, addLines, toggleWish, say, openCart, renderCart, clearCart});
  renderCart();
  wish.forEach(id => document.querySelectorAll(`[data-wish="${id}"]`).forEach(b => b.setAttribute("aria-pressed", true)));
  $("wishCount").textContent = wish.size; $("wishCount").dataset.n = wish.size;

  /* ---------- Reviews slider (phones, homepage only) ---------- */
  if($("reviews")){
  const revs = $("reviews");
  const revStep = d => revs.scrollBy({left: d * revs.querySelector(".review").offsetWidth, behavior: reduce ? "auto" : "smooth"});
  $("revPrev").onclick = () => revStep(-1);
  $("revNext").onclick = () => revStep(1);
  }

  /* ---------- Top bar messages ---------- */
  const msgs = [...document.querySelectorAll(".tb-msg")]; let mi = 0;
  const msgTimer = (!reduce && msgs.length > 1) ? setInterval(() => { msgs[mi].classList.remove("on"); mi = (mi+1) % msgs.length; msgs[mi].classList.add("on"); }, 3500) : null;

  /* ---------- Shop dropdown ---------- */
  const dd=$("shopDD"), shopBtn=$("shopBtn"), shopMenu=$("shopMenu");
  const setDD = o => { shopMenu.hidden = !o; shopBtn.setAttribute("aria-expanded", o); };
  const canHover = matchMedia("(hover:hover)").matches;
  shopBtn.onclick = () => setDD(canHover ? true : shopMenu.hidden);
  if(canHover){
    let ht; dd.addEventListener("mouseenter", () => { clearTimeout(ht); setDD(true); });
    dd.addEventListener("mouseleave", () => { ht = later(() => setDD(false), 150); });
  }
  shopMenu.addEventListener("click", e => { if(e.target.closest("a")) setDD(false); });
  document.addEventListener("click", e => { if(!dd.contains(e.target)) setDD(false); }, sig);
  document.addEventListener("keydown", e => { if(e.key==="Escape" && !shopMenu.hidden){ setDD(false); shopBtn.focus(); } }, sig);

  /* ---------- Header: shadow on scroll, active section ---------- */
  const hdr = document.querySelector("header.site");
  const onScroll = () => hdr.classList.toggle("scrolled", scrollY > 8);
  addEventListener("scroll", onScroll, {passive:true, signal: ac.signal}); onScroll();
  const secObs = new IntersectionObserver(es => es.forEach(en => {
    shopBtn.classList.toggle("on", en.isIntersecting);
  }), {rootMargin:"-40% 0px -55% 0px"});
  if($("catalogue")) secObs.observe($("catalogue"));

  /* ---------- Mobile menu ---------- */
  const mb=$("menuBtn"), mn=$("mobileNav");
  mb.onclick = () => { mn.hidden = !mn.hidden; mb.setAttribute("aria-expanded", !mn.hidden); };
  mn.querySelectorAll("a").forEach(a => a.addEventListener("click", () => { mn.hidden = true; mb.setAttribute("aria-expanded","false"); }));

  return () => {
    ac.abort();
    timers.forEach(clearTimeout);
    if(msgTimer) clearInterval(msgTimer);
    if(spy) spy.disconnect(); secObs.disconnect();
    stopConsent();
    document.body.classList.remove("lock");
  };
}
