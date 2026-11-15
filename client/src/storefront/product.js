/* Product detail page. Call after initStorefront with the product id from the URL; returns a cleanup function. */
import { actions, ordered, inr, off, art, catName, check, stars, pad, wish, ratingHtml } from "./storefront.js";
import { productCard } from "./card.js";

const $ = id => document.getElementById(id);

/* ---------- Photo gallery ----------
   Real photos come from p.images (or a single p.img). Until a product has photos,
   four sample views of its illustration are shown and labelled as samples. */
const SAMPLE_VIEWS = [["Front",""],["Angle","v-angle"],["Close-up","v-close"],["In the box","v-box"]];

function gallery(p, reduce){
  const photos = p.images?.length ? p.images.map((src,i) => ({html: art({...p, img: src}), label: `Photo ${i+1}`}))
    : p.img ? [{html: art(p), label: "Photo 1"}]
    : SAMPLE_VIEWS.map(([label, cls]) => ({html: art(p).replace('class="art"', `class="art ${cls}"`), label: `${label} (sample)`}));
  const n = photos.length, gm = $("gMain"), th = $("gThumbs");
  let gi = 0;

  const show = i => {
    gi = (i + n) % n;
    gm.classList.remove("zoom");
    $("gArt").innerHTML = photos[gi].html;
    if(!reduce){ const a = $("gArt").firstElementChild; a.classList.add("fade"); }
    $("gCount").textContent = `${gi+1} / ${n} · ${photos[gi].label}`;
    th.querySelectorAll("button").forEach((b, j) => b.setAttribute("aria-current", j === gi));
  };

  if(n > 1){
    ["gPrev","gNext","gCount"].forEach(x => $(x).hidden = false);
    th.hidden = false;
    th.innerHTML = photos.map((ph, i) => `<button type="button" aria-label="${ph.label}" data-i="${i}">${ph.html}</button>`).join("");
    th.addEventListener("click", e => { const b = e.target.closest("button"); if(b) show(+b.dataset.i); });
    $("gPrev").onclick = e => { e.stopPropagation(); show(gi - 1); };
    $("gNext").onclick = e => { e.stopPropagation(); show(gi + 1); };
    gm.addEventListener("keydown", e => { if(e.key === "ArrowLeft") show(gi - 1); if(e.key === "ArrowRight") show(gi + 1); });
    let tx = null;
    gm.addEventListener("touchstart", e => tx = e.touches[0].clientX, {passive: true});
    gm.addEventListener("touchend", e => { if(tx === null) return; const dx = e.changedTouches[0].clientX - tx; if(Math.abs(dx) > 40) show(gi + (dx < 0 ? 1 : -1)); tx = null; });
  }
  // tap the picture to zoom in or out
  gm.addEventListener("click", e => { if(!e.target.closest(".g-tools,.g-arrow")) gm.classList.toggle("zoom"); });
  show(0);
}

export function initProduct(id){
  const ac = new AbortController(), sig = {signal: ac.signal};
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  const cleanup = () => { ac.abort(); timers.forEach(clearTimeout); document.body.classList.remove("has-sticky"); };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const { addToCart, toggleWish, say, openCart } = actions;
  $("shopBtn").classList.add("on");

  const p = ordered.find(x => x.id === id);
  if(!p){
    document.querySelectorAll(".pdp,.pd-info,.related").forEach(s => s.hidden = true);
    $("notFound").hidden = false;
    document.title = "Product not found | NawaraTrend";
    return cleanup;
  }

  /* ---------- Basic info ---------- */
  const cat = catName(p.cat);
  document.title = `${p.name} | NawaraTrend`;
  $("pCrumbs").insertAdjacentHTML("beforeend", `<span aria-hidden="true">/</span><a href="/shop#${p.cat}">${cat}</a><span aria-hidden="true">/</span><span aria-current="page"></span>`);
  $("pCrumbs").lastElementChild.textContent = p.name;
  $("gMain").style.background = `var(--${p.cat}-bg)`;
  $("gOff").textContent = `${off(p)}% OFF`;
  gallery(p, reduce);
  const catTag = $("pCat");
  catTag.textContent = cat; catTag.href = `/shop#${p.cat}`;
  catTag.style.background = `var(--${p.cat}-bg)`; catTag.style.color = `var(--${p.cat})`;
  $("pCode").textContent = `Product code NT-${pad(p.no)}`;
  $("pName").textContent = p.name;
  const fresh = !!ratingHtml(p);
  $("pRating").innerHTML = fresh ? `${ratingHtml(p, true)}<u>Be the first to review</u>`
    : `<span class="st" aria-hidden="true">${stars(p.rate)}</span><b>${p.rate}</b><u>${p.reviews} reviews</u>`;
  $("pPrice").textContent = inr(p.price);
  $("pMrp").textContent = inr(p.mrp);
  $("pSave").textContent = `Save ${inr(p.mrp - p.price)} (${off(p)}%)`;
  $("pDesc").textContent = p.desc;
  const st = $("pStock");
  const soldOut = p.stock === 0;
  if(soldOut){ st.className = "stock-line low"; st.textContent = "Out of stock. Message us on WhatsApp and we'll tell you when it's back."; }
  else if(p.left){ st.className = "stock-line low"; st.innerHTML = `Only ${p.left} left in stock<span class="bar"><i style="width:${Math.max(10, p.left*10)}%"></i></span>`; }
  else { st.className = "stock-line in"; st.textContent = "In stock, ready to ship"; }

  /* ---------- Wishlist + share ---------- */
  const gw = $("gWish"); gw.dataset.wish = p.id; gw.setAttribute("aria-pressed", wish.has(p.id));
  gw.onclick = () => toggleWish(p);
  $("gShare").onclick = () => {
    const url = location.href;
    if(navigator.clipboard) navigator.clipboard.writeText(url).then(() => say("Link copied. Share it with anyone!")).catch(() => say(url));
    else say(url);
  };

  /* ---------- Size ---------- */
  let size = null;
  if(p.sizes){
    $("sizeBox").hidden = false;
    $("sizes").innerHTML = p.sizes.map(s => `<button type="button" role="radio" aria-checked="false" data-s="${s}">${s}</button>`).join("");
    $("sizes").addEventListener("click", e => {
      const b = e.target.closest("[data-s]"); if(!b) return;
      size = b.dataset.s;
      $("sizes").querySelectorAll("button").forEach(x => x.setAttribute("aria-checked", x===b));
      const sel = $("sizeSel"); sel.textContent = `Selected: ${size}`; sel.classList.add("chosen");
      $("sizeErr").hidden = true; $("sizeBox").classList.remove("invalid");
    });
  }
  function needSize(){
    if(!p.sizes || size) return false;
    $("sizeErr").hidden = false; $("sizeBox").classList.add("invalid");
    $("sizeBox").scrollIntoView({block:"center", behavior: reduce ? "auto" : "smooth"});
    const s = $("sizes"); s.classList.remove("shake"); void s.offsetWidth; s.classList.add("shake");
    return true;
  }

  /* ---------- Quantity ---------- */
  const MAXQ = p.stock ? Math.min(p.stock, 10) : 10;
  let q = 1;
  const setQ = n => { q = Math.max(1, Math.min(MAXQ, n)); $("qOut").textContent = q; $("qMinus").disabled = q<=1; $("qPlus").disabled = q>=MAXQ; ship(); };
  $("qMinus").onclick = () => setQ(q-1);
  $("qPlus").onclick = () => { if(q>=MAXQ) say(p.stock != null && p.stock < 10 ? `Only ${p.stock} left in stock` : "Maximum 10 per order"); setQ(q+1); };

  /* ---------- Free delivery note ---------- */
  function ship(){
    const total = p.price * q, left = 999 - total, el = $("pShip");
    el.classList.toggle("free", left <= 0);
    el.innerHTML = left <= 0
      ? `✓ This order qualifies for free delivery`
      : `Add ${inr(left)} more for free delivery <span class="bar"><i style="width:${Math.min(100, total/999*100)}%"></i></span>`;
  }

  /* ---------- Buy ---------- */
  const add = $("pAdd"), addLbl = add.querySelector("span");
  function doAdd(){
    if(needSize()) return false;
    if(!addToCart(p, q, size)) return false;
    add.classList.add("added"); addLbl.textContent = "Added ✓";
    later(() => { add.classList.remove("added"); addLbl.textContent = "Add to cart"; }, 1500);
    return true;
  }
  add.onclick = doAdd;
  if(soldOut){ [add, $("pBuy"), $("sbAdd")].forEach(b => b.disabled = true); addLbl.textContent = "Out of stock"; }
  $("pBuy").onclick = () => { if(doAdd()) openCart(true); };
  $("sbAdd").onclick = doAdd;

  /* ---------- Ask on WhatsApp (prefilled message) ---------- */
  const msg = `Hi NawaraTrend, I have a question about "${p.name}" (NT-${pad(p.no)}).`;
  $("pAsk").href = "https://wa.me/919807562620?text=" + encodeURIComponent(msg);
  $("rvWrite").href = "https://wa.me/919807562620?text=" + encodeURIComponent(`Hi, I'd like to share a review for "${p.name}": `);

  /* ---------- Tabs ---------- */
  $("pPoints").innerHTML = p.points.map(x => `<li><span class="ck">${check}</span>${x}</li>`).join("");
  const rows = [["Product code", `NT-${pad(p.no)}`], ["Category", `<a href="/shop#${p.cat}">${cat}</a>`]]
    .concat(p.sizes ? [["Sizes", p.sizes.join(", ")]] : [])
    .concat([["MRP", inr(p.mrp)], ["Our price", `${inr(p.price)} (${off(p)}% off)`], ["Ships from", "Lucknow, Uttar Pradesh"],
             ["Delivery", p.price >= 999 ? "Free delivery" : "Free on orders above ₹999"], ["Returns", `<a href="/refund-policy">7-day returns, see our policy</a>`]]);
  $("pDetails").innerHTML = rows.map(([k,v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  if(fresh){ $("rvScore").textContent = "New"; $("rvStars").textContent = ""; $("rvCount").textContent = "No reviews yet"; }
  else { $("rvScore").textContent = p.rate; $("rvStars").textContent = stars(p.rate); $("rvCount").textContent = `Based on ${p.reviews} ratings`; }
  const tabs = [...document.querySelectorAll(".pd-tabs [role=tab]")];
  const showTab = t => tabs.forEach(x => { const on = x===t; x.setAttribute("aria-selected", on); $(x.getAttribute("aria-controls")).hidden = !on; });
  tabs.forEach(t => t.onclick = () => showTab(t));
  $("pRating").onclick = e => { e.preventDefault(); showTab($("tab-rv")); $("tab-rv").scrollIntoView({block:"center"}); };

  /* ---------- Related products: same category first, then the best deals ---------- */
  const same = ordered.filter(x => x.cat===p.cat && x.id!==p.id);
  const others = ordered.filter(x => x.cat!==p.cat).sort((a,b) => off(b)-off(a));
  same.concat(others).slice(0,4).forEach((r,i) => $("related").appendChild(productCard(r, {later, delay: reduce ? 0 : i*60})));

  /* ---------- Sticky buy bar (phones) ---------- */
  $("sbName").textContent = p.name; $("sbPrice").textContent = inr(p.price);
  const sb = $("stickyBuy"), ma = $("mainActions");
  let sbShown = null;
  const checkSticky = () => {
    const show = ma.getBoundingClientRect().bottom < 0;   // main buttons scrolled above the screen
    if(show === sbShown) return; sbShown = show;
    sb.classList.toggle("show", show); sb.setAttribute("aria-hidden", !show);
    $("sbAdd").tabIndex = show ? 0 : -1;
    document.body.classList.toggle("has-sticky", show);
  };
  addEventListener("scroll", checkSticky, {passive:true, signal: ac.signal});
  addEventListener("resize", checkSticky, sig);
  checkSticky();

  setQ(1);
  return cleanup;
}
