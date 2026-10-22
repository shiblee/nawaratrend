/* Customer sign-in / create-account page. Opened with ?next=/path to return there afterwards (e.g. checkout). */
import { currentCustomer, refreshCustomer, login, register, logout, myOrders, MOCK } from "../services/customerApi.js";
import { inr } from "./storefront.js";

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const STATUS = {pending:"Order placed", confirmed:"Confirmed", packed:"Packed", shipped:"Shipped", delivered:"Delivered", cancelled:"Cancelled", returned:"Returned"};
const PAY = {upi:"UPI", card:"Card", cod:"Cash on Delivery"};

const $ = id => document.getElementById(id);

const contactErr = v => {
  v = v.trim();
  if(!v) return "Enter your mobile number or email.";
  if(/[@a-z]/i.test(v)) return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v) ? "" : "Check the email address, for example name@gmail.com.";
  return /^(\+?91|0)?[6-9]\d{9}$/.test(v.replace(/[\s-]/g, "")) ? "" : "Enter a 10-digit mobile number.";
};
const RULES = {
  inContact: contactErr,
  inPass: v => !v ? "Enter your password." : "",
  upName: v => v.trim().length < 2 ? "Please enter your name." : "",
  upContact: contactErr,
  upPass: v => v.length < 8 || !/[a-z]/i.test(v) || !/\d/.test(v) ? "Use at least 8 characters, with a letter and a number." : "",
};

export function initLogin({ navigate }){
  let alive = true;
  // only allow returning to a page on this site
  const raw = new URLSearchParams(location.search).get("next") || "";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "";
  $("lgDemo").hidden = !MOCK;
  $("lgGuest").hidden = next !== "/checkout";
  if(next === "/checkout") $("lgIntro").textContent = "Sign in to check out faster, or continue as a guest.";

  function renderSignedIn(){
    const c = currentCustomer();
    $("lgIn").hidden = !c; $("lgCard").hidden = !!c;
    if(!c) return;
    $("lgTitle").innerHTML = "My <span>account</span>";
    $("lgIntro").textContent = "You're signed in.";
    $("lgAv").textContent = c.name.charAt(0).toUpperCase();
    $("lgHello").textContent = `Hello, ${c.name}`;
    $("lgContact").textContent = c.contact;
    $("lgGo").textContent = next === "/checkout" ? "Continue to checkout" : "Continue shopping";
    $("lgGo").href = next || "/shop";
    $("lgGuest").hidden = true;
    loadOrders();
  }
  async function loadOrders(){
    const box = $("lgOrders"), list = $("ordList");
    box.hidden = false;
    try {
      const orders = await myOrders();
      if(!alive) return;
      list.innerHTML = orders.length ? orders.map(o => `<div class="ord">
        <div class="ord-top"><b>#${esc(o.order_number)}</b><span class="st st-${esc(o.status)}">${STATUS[o.status] || esc(o.status)}</span></div>
        <p class="sub">${new Date(o.created_at).toLocaleDateString("en-IN", {day:"numeric", month:"short", year:"numeric"})} · ${inr(o.total)} · ${PAY[o.payment_method]}${o.payment_status === "paid" ? " (paid)" : ""}</p>
        <ul>${o.items.map(i => `<li>${i.qty} × ${esc(i.product_name)}${i.size ? ` (Size ${esc(i.size)})` : ""}</li>`).join("")}</ul>
        ${o.tracking_number ? `<p class="sub">Tracking: <b>${esc(o.courier || "Courier")} ${esc(o.tracking_number)}</b></p>` : ""}
      </div>`).join("") : `<p class="sub">You haven't placed any orders yet. <a class="link" href="/shop">Start shopping</a></p>`;
    } catch(err){
      if(alive) list.innerHTML = `<p class="sub">${esc(err.message)}</p>`;
    }
  }
  $("lgOut").onclick = () => {
    logout(); setTab(false); renderSignedIn(); $("lgOrders").hidden = true;
    $("lgIntro").textContent = "You've signed out. Sign in again any time.";
    $("lgGuest").hidden = next !== "/checkout";
  };

  /* ---------- Tabs ---------- */
  const setTab = up => {
    $("tabIn").setAttribute("aria-selected", !up); $("tabUp").setAttribute("aria-selected", up);
    $("formIn").hidden = up; $("formUp").hidden = !up;
    $("lgTitle").innerHTML = up ? "Create an <span>account</span>" : "Welcome <span>back</span>";
  };
  $("tabIn").onclick = () => setTab(false);
  $("tabUp").onclick = () => setTab(true);

  /* ---------- Forms ---------- */
  const check = id => {
    const el = $(id), msg = RULES[id](el.value), fld = el.closest(".fld");
    fld.classList.toggle("invalid", !!msg); fld.querySelector(".err").textContent = msg; el.setAttribute("aria-invalid", !!msg);
    return !msg;
  };
  Object.keys(RULES).forEach(id => $(id).addEventListener("input", () => { if($(id).closest(".fld").classList.contains("invalid")) check(id); }));

  const wire = (formId, ids, call) => {
    const form = $(formId), btn = form.querySelector("button[type=submit]"), msg = form.querySelector(".form-msg");
    form.addEventListener("submit", async e => {
      e.preventDefault();
      if(btn.classList.contains("loading")) return;
      const bad = ids.filter(id => !check(id));
      if(bad.length){ $(bad[0]).focus(); return; }
      msg.textContent = ""; btn.classList.add("loading");
      try {
        await call();
        if(!alive) return;
        if(next) navigate(next); else renderSignedIn();
      } catch(err){
        msg.textContent = err.message || "Something went wrong. Please try again.";
      } finally { btn.classList.remove("loading"); }
    });
  };
  wire("formIn", ["inContact","inPass"], () => login({ contact: $("inContact").value.trim(), password: $("inPass").value }));
  wire("formUp", ["upName","upContact","upPass"], () => register({ name: $("upName").value.trim(), contact: $("upContact").value.trim(), password: $("upPass").value }));

  renderSignedIn();
  // make sure the saved session is still valid (it may have expired or been disabled)
  if(currentCustomer()) refreshCustomer().then(c => { if(alive && !c){ renderSignedIn(); $("lgOrders").hidden = true; } });
  return () => { alive = false; };
}
