/* Shop page: category tabs, filters, sorting and grid/list view. Call after initStorefront; returns a cleanup function. */
import { ordered, used, svg, inr, off, catName } from "./storefront.js";
import { productCard } from "./card.js";
import { applySeo } from "./seo.js";

const $ = id => document.getElementById(id);

export function initShop(){
  const ac = new AbortController(), sig = {signal: ac.signal};
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  $("shopBtn").classList.add("on");

  const state = {cat:"all", off:0, rate:0, free:false, low:false, sort:"featured", view:"grid"};
  try { const v = localStorage.getItem("nt-view"); if(v==="list"||v==="grid") state.view = v; } catch(e){}

  /* ---------- Category tabs ---------- */
  const allIc = `<span class="ic" style="background:var(--marigold-soft);color:var(--gold-text)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg></span>`;
  $("sCats").innerHTML = [{k:"all", n:"All"}].concat(used).map(c => {
    const ic = c.k==="all" ? allIc : `<span class="ic" style="background:var(--${c.k}-bg);color:var(--${c.k})">${svg(c.k,1.9)}</span>`;
    return `<button class="s-cat" role="tab" id="cat-${c.k}" data-cat="${c.k}" aria-selected="false">${ic}${c.n}</button>`;
  }).join("");
  $("sCats").addEventListener("click", e => { const b = e.target.closest(".s-cat"); if(!b) return; setCat(b.dataset.cat, true); });

  function setCat(k, push){
    state.cat = used.some(c=>c.k===k) ? k : "all";
    // keep the router's history state so back/forward still work
    // each category has its own address (/shop/fashion) that search engines can index; refresh the SEO tags to match
    const want = state.cat==="all" ? "/shop" : `/shop/${state.cat}`;
    if(push || location.pathname !== want || location.hash){
      try { history.replaceState(history.state, "", want); } catch(e){}
      if(push) applySeo();
    }
    render();
  }
  // old links (/shop#fashion) still work: they open the category and switch to its new address
  addEventListener("hashchange", () => { if(location.hash.length > 1) setCat(location.hash.slice(1), true); }, sig);

  /* ---------- Filters ---------- */
  const radios = name => document.querySelectorAll(`input[name="${name}"]`);
  radios("off").forEach(r => r.addEventListener("change", () => { state.off = +r.value; render(); }));
  radios("rate").forEach(r => r.addEventListener("change", () => { state.rate = +r.value; render(); }));
  $("fFree").addEventListener("change", e => { state.free = e.target.checked; render(); });
  $("fLow").addEventListener("change", e => { state.low = e.target.checked; render(); });
  $("sortBy").addEventListener("change", e => { state.sort = e.target.value; render(); });

  function clearAll(){
    Object.assign(state, {off:0, rate:0, free:false, low:false});
    radios("off")[0].checked = true; radios("rate")[0].checked = true;
    $("fFree").checked = false; $("fLow").checked = false;
  }
  $("fClearAll").onclick = () => { clearAll(); render(); };
  $("eClear").onclick = () => { clearAll(); setCat("all", true); };

  /* ---------- View toggle ---------- */
  document.querySelectorAll("[data-view]").forEach(b => b.onclick = () => {
    state.view = b.dataset.view;
    try { localStorage.setItem("nt-view", state.view); } catch(e){}
    render();
  });

  /* ---------- Mobile filter sheet ---------- */
  const sheet = $("filters"), fs = $("fScrim");
  const openSheet = o => { sheet.classList.toggle("open", o); fs.classList.toggle("open", o); document.body.classList.toggle("lock", o); if(o) sheet.querySelector(".f-head h2").focus(); };
  $("fOpen").onclick = () => openSheet(true);
  $("fApply").onclick = () => openSheet(false);
  fs.onclick = () => openSheet(false);
  document.addEventListener("keydown", e => { if(e.key==="Escape" && sheet.classList.contains("open")) openSheet(false); }, sig);

  /* ---------- Filtering + sorting ---------- */
  function results(){
    let list = ordered.filter(p =>
      (state.cat==="all" || p.cat===state.cat) &&
      off(p) >= state.off && p.rate >= state.rate &&
      (!state.free || p.price >= 999) && (!state.low || p.left));
    const s = state.sort;
    if(s==="low") list = list.slice().sort((a,b)=>a.price-b.price);
    if(s==="high") list = list.slice().sort((a,b)=>b.price-a.price);
    if(s==="off") list = list.slice().sort((a,b)=>off(b)-off(a));
    if(s==="rate") list = list.slice().sort((a,b)=>b.rate-a.rate || b.reviews-a.reviews);
    return list;
  }

  function activeChips(){
    const chips = [];
    if(state.off) chips.push(["off", `${state.off}%+ off`]);
    if(state.rate) chips.push(["rate", `★ ${state.rate}+`]);
    if(state.free) chips.push(["free", "Free delivery"]);
    if(state.low) chips.push(["low", "Selling fast"]);
    $("activeChips").innerHTML = chips.map(([k,l]) => `<button type="button" class="chip-x" data-x="${k}">${l}<i aria-hidden="true">✕</i><span class="sr-only">Remove filter</span></button>`).join("")
      + (chips.length > 1 ? `<button type="button" class="chip-x all" data-x="all">Clear all</button>` : "");
    const b = $("fBadge"); b.hidden = !chips.length; b.textContent = chips.length;
  }
  $("activeChips").addEventListener("click", e => {
    const c = e.target.closest("[data-x]"); if(!c) return;
    const k = c.dataset.x;
    if(k==="all"){ clearAll(); }
    if(k==="off"){ state.off=0; radios("off")[0].checked = true; }
    if(k==="rate"){ state.rate=0; radios("rate")[0].checked = true; }
    if(k==="free"){ state.free=false; $("fFree").checked = false; }
    if(k==="low"){ state.low=false; $("fLow").checked = false; }
    render();
  });


  function render(){
    document.querySelectorAll(".s-cat").forEach(b => b.setAttribute("aria-selected", b.dataset.cat===state.cat));
    const name = state.cat==="all" ? "All products" : catName(state.cat);
    $("crumbNow").textContent = state.cat==="all" ? "Shop" : name;
    $("shopTitle").innerHTML = state.cat==="all" ? "Shop <span>all products</span>" : `Shop <span>${name}</span>`;
    document.querySelectorAll("[data-view]").forEach(b => b.setAttribute("aria-pressed", b.dataset.view===state.view));
    const list = results(), grid = $("pGrid");
    grid.classList.toggle("list", state.view==="list");
    grid.innerHTML = "";
    list.forEach((p,i) => grid.appendChild(productCard(p, {later, delay: reduce ? 0 : Math.min(i*40, 300)})));
    $("sEmpty").hidden = list.length > 0;
    $("rCount").innerHTML = `Showing <b>${list.length}</b> of ${ordered.length} product${ordered.length>1?"s":""}`;
    $("fApply").textContent = list.length ? `Show ${list.length} product${list.length>1?"s":""}` : "No matches – adjust filters";
    activeChips();
  }

  setCat(decodeURIComponent(location.pathname.split("/")[2] || "") || location.hash.slice(1), false);

  return () => { ac.abort(); timers.forEach(clearTimeout); document.body.classList.remove("lock"); };
}
