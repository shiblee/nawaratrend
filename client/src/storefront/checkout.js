/* Checkout page: account step, delivery address, payment choice and order summary.
   Orders go through services/customerApi.js (a blueprint until the database is connected). */
import { actions, ordered, inr, cart, parseKey, optsText, lineThumb, FREE_SHIP, DELIVERY_FEE, COD_ENABLED } from "./storefront.js";
import { currentCustomer, logout, placeOrder, MOCK } from "../services/customerApi.js";

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

const STATES = ["Andaman and Nicobar Islands","Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chandigarh","Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu","Delhi","Goa","Gujarat","Haryana","Himachal Pradesh","Jammu and Kashmir","Jharkhand",
  "Karnataka","Kerala","Ladakh","Lakshadweep","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha",
  "Puducherry","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal"];
const PAY = {upi: "UPI", card: "Debit / credit card", cod: "Cash on Delivery"};

// Indian mobile: optional +91 / 91 / 0, then 10 digits starting 6-9
const mobileDigits = v => { let d = v.replace(/\D/g, ""); if(d.length === 12 && d.startsWith("91")) d = d.slice(2); else if(d.length === 11 && d.startsWith("0")) d = d.slice(1); return d; };

const RULES = {
  aName:  v => v.trim().length < 2 ? "Please enter the name of the person receiving the order." : "",
  aPhone: v => { const d = mobileDigits(v); return d.length !== 10 ? "Enter a 10-digit mobile number." : !/^[6-9]/.test(d) ? "Indian mobile numbers start with 6, 7, 8 or 9." : ""; },
  aEmail: v => v.trim() && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v.trim()) ? "Check the email address, for example name@gmail.com." : "",
  aLine1: v => v.trim().length < 3 ? "Add your house or flat number and building." : "",
  aLine2: v => v.trim().length < 3 ? "Add the area or street." : "",
  aPin:   v => !/^[1-9]\d{5}$/.test(v.trim()) ? "PIN code should be 6 digits." : "",
  aCity:  v => v.trim().length < 2 ? "Add your city." : "",
  aState: v => !v ? "Choose your state." : "",
};

export function initCheckout(){
  const ac = new AbortController();
  const lines = () => Object.keys(cart).filter(k => cart[k] > 0)
    .map(k => ({...parseKey(k), qty: cart[k]})).map(l => ({...l, p: ordered.find(x => x.id === l.id)})).filter(l => l.p);
  const totals = () => {
    const sub = lines().reduce((s, l) => s + l.p.price * l.qty, 0);
    const ship = sub >= FREE_SHIP ? 0 : DELIVERY_FEE;
    return {sub, ship, total: sub + ship};
  };
  let placed = false;

  if(!COD_ENABLED){ const cod = document.querySelector('input[name="pay"][value="cod"]'); cod.closest("label").remove(); }
  $("aState").insertAdjacentHTML("beforeend", STATES.map(s => `<option>${s}</option>`).join(""));

  /* ---------- Step 1: account ---------- */
  function renderWho(){
    const c = currentCustomer();
    $("whoBox").innerHTML = c
      ? `<div><b>Signed in as ${esc(c.name)}</b><span>${esc(c.contact)}</span></div><div class="btns"><button type="button" class="btn btn-line" id="whoOut">Sign out</button></div>`
      : `<div><b>Have an account?</b><span>Sign in to track this order later, or continue as a guest.</span></div><div class="btns"><a class="btn btn-ink" href="/login?next=/checkout">Sign in</a></div>`;
    const out = $("whoOut"); if(out) out.onclick = async () => { await logout(); renderWho(); };
    // fill in what we know about the customer, without overwriting anything typed
    if(c){
      if(!$("aName").value && c.name !== "Customer") $("aName").value = c.name;
      if(c.email && !$("aEmail").value) $("aEmail").value = c.email;
      if(c.phone && !$("aPhone").value) $("aPhone").value = c.phone;
    }
  }

  /* ---------- Summary ---------- */
  function renderSummary(){
    if(placed) return;
    const ls = lines();
    $("ckEmpty").hidden = ls.length > 0;
    $("ckForm").hidden = ls.length === 0;
    $("ckIntro").hidden = ls.length === 0;
    if(!ls.length) return;
    $("sumItems").innerHTML = ls.map(({p, qty, size, color}) => `<div class="sum-item">
      ${lineThumb(p, color)}
      <div><b>${p.name}</b><small>${optsText({size, color})}${qty} × ${inr(p.price)}</small></div><span class="amt">${inr(p.price * qty)}</span></div>`).join("");
    const t = totals();
    $("totals").innerHTML = `<div><span>Subtotal</span><b>${inr(t.sub)}</b></div>
      <div><span>Delivery</span>${t.ship ? `<b>${inr(t.ship)}</b>` : `<b class="free">Free</b>`}</div>
      <div class="grand"><span>Total</span><b>${inr(t.total)}</b></div>`;
    $("shipHint").hidden = !t.ship;
    $("shipHint").textContent = `Add ${inr(FREE_SHIP - t.sub)} more to get free delivery.`;
    $("placeBtn").querySelector(".lbl").textContent = `Place order · ${inr(t.total)}`;
  }
  addEventListener("nt:cart", renderSummary, {signal: ac.signal});
  $("editCart").onclick = () => actions.openCart(true);

  /* ---------- Validation ---------- */
  const check = (id, show) => {
    const el = $(id), msg = RULES[id](el.value), fld = el.closest(".fld");
    if(show){ fld.classList.toggle("invalid", !!msg); fld.querySelector(".err").textContent = msg; el.setAttribute("aria-invalid", !!msg); }
    return !msg;
  };
  Object.keys(RULES).forEach(id => {
    $(id).addEventListener("blur", () => { if($(id).value) check(id, true); });
    $(id).addEventListener("input", () => { if($(id).closest(".fld").classList.contains("invalid")) check(id, true); });
  });
  $("aPin").addEventListener("input", e => e.target.value = e.target.value.replace(/\D/g, ""));

  /* ---------- Place order ---------- */
  $("ckForm").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = $("placeBtn");
    if(btn.classList.contains("loading")) return;
    const bad = Object.keys(RULES).filter(id => !check(id, true));
    if(bad.length){
      $("ckMsg").textContent = bad.length === 1 ? "Please fix the highlighted field." : `Please fix the ${bad.length} highlighted fields.`;
      $(bad[0]).focus();
      return;
    }
    $("ckMsg").textContent = "";
    const payment = document.querySelector('input[name="pay"]:checked').value;
    const address = {
      name: $("aName").value.trim(), phone: "+91 " + mobileDigits($("aPhone").value), email: $("aEmail").value.trim(),
      line1: $("aLine1").value.trim(), line2: $("aLine2").value.trim(), pin: $("aPin").value.trim(),
      city: $("aCity").value.trim(), state: $("aState").value,
    };
    const ls = lines(), t = totals();
    btn.classList.add("loading");
    try {
      const res = await placeOrder({ items: ls.map(l => ({productId: l.p.id, qty: l.qty, size: l.size, color: l.color})), address, payment });
      if(ac.signal.aborted) return;   // left the page while the order was being placed
      placed = true;
      actions.clearCart();
      showDone(res, address, payment, ls.reduce((s, l) => s + l.qty, 0), res.total ?? t.total);
    } catch(err){
      $("ckMsg").textContent = err.message || "We couldn't place your order. Please try again.";
    } finally {
      btn.classList.remove("loading");
    }
  });

  function showDone(res, address, payment, count, total){
    $("ckForm").hidden = true; $("ckIntro").hidden = true; $("ckEmpty").hidden = true;
    const first = address.name.split(" ")[0];
    $("doneTitle").textContent = `Thank you, ${first}!`;
    const updates = address.email ? `We've emailed the details to ${address.email} and will email you at every step.` : "You can follow it step by step with Track order.";
    $("doneText").textContent = payment === "cod"
      ? `Your order is placed. Please keep the amount ready when it arrives. ${updates}`
      : MOCK
        ? "Your order is confirmed. (Demo: in the live store you'd now be taken to the secure payment page.)"
        : `Your order is placed. ${updates}`;
    // signed-in customers follow it in their account; guests on Track order with the number already filled in
    $("doneTrack").href = currentCustomer() ? `/account/orders/${encodeURIComponent(res.orderId)}` : `/track?order=${encodeURIComponent(res.orderId)}`;
    const rows = [["Order number", "#" + res.orderId], ["Items", String(count)], ["Total", inr(total)], ["Payment", PAY[payment]],
      ["Deliver to", `${address.name}, ${address.line1}, ${address.city} ${address.pin}`]];
    const dl = $("doneSum"); dl.textContent = "";
    rows.forEach(([k, v]) => { const d = document.createElement("div"), dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = k; dd.textContent = v; d.append(dt, dd); dl.appendChild(d); });
    $("ckDone").hidden = false; $("ckDone").focus();
    window.scrollTo({top: 0});
  }

  renderWho();
  renderSummary();
  return () => ac.abort();
}
