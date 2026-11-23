/* Product card used on the Shop page and in "You may also like" on product pages.
   `later` is the page's tracked setTimeout (so timers are cleared when the page closes); `delay` staggers the fade-in. */
import { actions, inr, offBadge, art, catName, check, wish, buyControl, ratingHtml } from "./storefront.js";

const heart = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.6 3.3 5 6.8 5c2 0 3.4 1.1 5.2 3 1.8-1.9 3.2-3 5.2-3 3.5 0 5.6 3.6 4.3 6.8C19.5 16.4 12 21 12 21z"/></svg>';
const cartIc = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.5L21 8H6"/></svg>';

export function productCard(p, {later = setTimeout, delay = 0} = {}){
  const el = document.createElement("article");
  el.className = "pc"; el.style.animationDelay = delay + "ms";
  el.innerHTML = `
    <a class="pc-stage" href="/product/${p.id}" aria-label="${p.name}">${art(p)}</a>
    <div class="pc-body">
      <div class="pc-top"><span class="tag" style="background:var(--${p.cat}-bg);color:var(--${p.cat})">${catName(p.cat)}</span>${ratingHtml(p) || `<span class="pc-rate"><span class="st">★</span> <b>${p.rate}</b> (${p.reviews})</span>`}</div>
      <h3><a href="/product/${p.id}">${p.name}</a></h3>
      <p class="pc-desc">${p.desc}</p>
      <ul class="pc-points">${p.points.map(x => `<li><span class="ck">${check}</span>${x}</li>`).join("")}</ul>
      ${p.left ? `<span class="stock">Only ${p.left} left</span>` : ""}
      <div class="pc-buy">
        <div class="pc-price"><div class="pc-now"><b>${inr(p.price)}</b>${offBadge(p)}</div><span><s>${inr(p.mrp)}</s><em>Save ${inr(p.mrp-p.price)}</em></span></div>
        <div class="pc-act">${buyControl(p, "pc-add", cartIc + "Add")}<button class="wish" data-wish="${p.id}" aria-pressed="${wish.has(p.id)}" aria-label="Save ${p.name} to wishlist">${heart}</button></div>
      </div>
    </div>`;
  const add = el.querySelector("[data-buy]");
  if(add) add.onclick = () => {
    if(!actions.addToCart(p)) return;
    add.innerHTML = "✓ Added"; add.classList.add("added");
    later(() => { add.innerHTML = cartIc + "Add"; add.classList.remove("added"); }, 1400);
  };
  el.querySelector(".wish").onclick = () => actions.toggleWish(p);
  return el;
}
