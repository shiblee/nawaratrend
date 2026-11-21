/* My account: orders (with tracking), profile and photo, password and sign-out.
   /account                     orders
   /account/orders/NT…          one order with its tracking timeline
   /account/profile             name, email, mobile, photo
   /account/security            change password, sign out of all devices
   Signed-out visitors are sent to /login and brought back here afterwards. */
import { currentCustomer, refreshCustomer, logout, logoutEverywhere, myOrders, myOrder, updateProfile, changePassword,
  uploadAvatar, removeAvatar, assetUrl } from "../services/customerApi.js";
import { inr, syncContacts, syncAccountIcon } from "./storefront.js";
import { orderHtml, wireOrder, esc, chip, thumb, dateLong } from "./orderview.js";
import { fieldError, wirePasswordToggles, busy, passwordProblem, emailProblem, mobileProblem, mobileDigits, passwordField } from "./forms.js";

const $ = id => document.getElementById(id);
const PROGRESS = ["pending", "confirmed", "packed", "shipped", "out_for_delivery", "delivered"];
const FILTERS = [["", "All orders"], ["active", "In progress"], ["delivered", "Delivered"], ["closed", "Cancelled & returned"]];
const initials = n => String(n || "").split(" ").map(p => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";

export function initAccount({ navigate }){
  let alive = true;
  if(!currentCustomer()){ navigate(`/login?next=${encodeURIComponent(location.pathname)}`, { replace: true }); return; }

  const path = location.pathname.replace(/\/+$/, "") || "/account";
  const orderNo = (path.match(/^\/account\/orders\/([A-Za-z0-9-]+)$/) || [])[1];
  const view = orderNo ? "order" : { "/account/profile": "profile", "/account/security": "security" }[path] || "orders";
  ({ orders: $("tabOrders"), order: $("tabOrders"), profile: $("tabProfile"), security: $("tabSecurity") })[view].setAttribute("aria-current", "page");
  const box = $("acView");

  /* ---------- header: photo, name, member since ---------- */
  function renderHero(c){
    const av = $("acAv");
    av.innerHTML = c.avatar ? `<img src="${esc(assetUrl(c.avatar))}" alt="">` : esc(initials(c.name));
    av.classList.toggle("has-photo", !!c.avatar);
    const first = c.name.split(" ")[0];
    $("acName").innerHTML = `Hi, <span>${esc(first)}</span>`;
    // each part stays on one line (no phone number broken in the middle)
    $("acMeta").innerHTML = [c.since && `Member since ${new Date(c.since).toLocaleDateString("en-IN", {month:"long", year:"numeric"})}`, c.email, c.phone && `+91 ${c.phone.slice(0, 5)} ${c.phone.slice(5)}`]
      .filter(Boolean).map(t => `<span>${esc(t)}</span>`).join(" · ");
    if(view === "profile") renderPhotoCard(c);
    syncAccountIcon();
  }
  renderHero(currentCustomer());
  // the saved copy may be stale or the session may have ended (password changed elsewhere)
  refreshCustomer().then(c => {
    if(!alive) return;
    if(!c){ navigate(`/login?next=${encodeURIComponent(location.pathname)}`, { replace: true }); return; }
    renderHero(c);
  });

  $("acOut").onclick = async () => { await logout(); navigate("/login"); };

  /* ---------- profile photo: cropped to a square and shrunk in the browser, so uploads are small ---------- */
  const photoMsg = $("acPhotoMsg");
  $("acFile").addEventListener("change", async e => {
    const file = e.target.files[0];
    e.target.value = "";
    if(!file) return;
    photoMsg.textContent = "";
    if(!/^image\/(jpeg|png|webp)$/.test(file.type)){ photoMsg.textContent = "Please choose a JPG, PNG or WebP photo."; return; }
    if(file.size > 5 * 1024 * 1024){ photoMsg.textContent = "That photo is larger than 5 MB. Please choose a smaller one."; return; }
    const holder = document.querySelector(".ac-photo");
    holder.classList.add("busy");
    try {
      const image = await squareJpeg(file, 320);
      const c = await uploadAvatar(image);
      if(alive) renderHero(c);
    } catch(err){
      photoMsg.textContent = err.message || "We couldn't update your photo. Please try again.";
    } finally { holder.classList.remove("busy"); }
  });

  /* ---------- views ---------- */
  if(view === "orders") ordersView();
  if(view === "order") orderView(orderNo);
  if(view === "profile") profileView();
  if(view === "security") securityView();

  function ordersView(){
    let filter = new URLSearchParams(location.search).get("status") || "", q = "", page = 1, loaded = [];
    box.innerHTML = `
      <div class="ac-bar">
        <div class="ac-chips" role="group" aria-label="Show">${FILTERS.map(([k, l]) => `<button type="button" data-f="${k}" aria-pressed="${k === filter}">${l} <span data-count="${k || "all"}"></span></button>`).join("")}</div>
        <form class="ac-search" role="search"><input type="search" id="ordQ" placeholder="Search order number or product" aria-label="Search your orders" maxlength="60"></form>
      </div>
      <div id="ordList" class="ac-orders"><div class="card ac-loading">Loading your orders…</div></div>
      <div class="ac-more"><button type="button" class="btn btn-line" id="ordMore" hidden><span class="lbl">Show more orders</span><span class="spin" aria-hidden="true"></span></button></div>`;
    const list = $("ordList"), more = $("ordMore");
    box.querySelectorAll("[data-f]").forEach(b => b.onclick = () => {
      filter = b.dataset.f; box.querySelectorAll("[data-f]").forEach(x => x.setAttribute("aria-pressed", x === b)); load(true);
    });
    let t;
    $("ordQ").addEventListener("input", e => { clearTimeout(t); t = setTimeout(() => { q = e.target.value.trim(); load(true); }, 300); });
    box.querySelector(".ac-search").onsubmit = e => { e.preventDefault(); q = $("ordQ").value.trim(); load(true); };
    more.onclick = () => busy(more, () => load(false));

    async function load(reset){
      if(reset){ page = 1; loaded = []; }
      try {
        const d = await myOrders({ status: filter, q, page });
        if(!alive) return;
        loaded = reset ? d.orders : loaded.concat(d.orders);
        Object.entries(d.counts).forEach(([k, n]) => { const el = box.querySelector(`[data-count="${k}"]`); if(el) el.textContent = n ? `(${n})` : ""; });
        list.innerHTML = loaded.length ? loaded.map(orderCard).join("")
          : d.counts.all === 0
            ? `<div class="card ac-empty"><h2>No orders yet</h2><p class="sub">When you place an order while signed in, you'll be able to follow it here, step by step.</p><a class="btn btn-ink" href="/shop">Start shopping</a></div>`
            : `<div class="card ac-empty"><h2>No orders match</h2><p class="sub">Try a different search or filter.</p></div>`;
        more.hidden = d.page >= d.pages;
        page = d.page + 1;
      } catch(err){
        if(alive) list.innerHTML = `<div class="card ac-empty"><p class="sub">${esc(err.message)}</p><button type="button" class="btn btn-line" id="ordRetry">Try again</button></div>`;
        $("ordRetry")?.addEventListener("click", () => load(true));
      }
    }
    load(true);
  }

  function orderCard(o){
    const step = PROGRESS.indexOf(o.status);
    const pct = step < 0 ? null : Math.round((step / (PROGRESS.length - 1)) * 100);
    const names = o.items.slice(0, 2).map(i => esc(i.name)).join(", ") + (o.items.length > 2 ? ` and ${o.items.length - 2} more` : "");
    const extra = o.status === "delivered" || pct === null ? "" : o.expected_delivery ? ` · Arriving by ${esc(dateLong(o.expected_delivery))}` : "";
    return `<article class="card oc">
      <header class="oc-top"><div><b>Order #${esc(o.order_number)}</b><small>Placed ${esc(dateLong(o.created_at))}</small></div>${chip(o.status, o.status_label)}</header>
      <div class="oc-body">
        <div class="oc-thumbs">${o.items.slice(0, 3).map(i => thumb(i, "oc-thumb")).join("")}${o.items.length > 3 ? `<span class="oc-thumb oc-more">+${o.items.length - 3}</span>` : ""}</div>
        <div class="oc-info"><p>${names}</p><p class="sub">${inr(o.total)} · ${esc(o.payment_method_label)}${o.payment_status === "paid" ? " (paid)" : ""}${extra}</p></div>
        <a class="btn ${pct !== null && o.status !== "delivered" ? "btn-ink" : "btn-line"} oc-go" href="/account/orders/${esc(o.order_number)}">${pct !== null && o.status !== "delivered" ? "Track order" : "View details"}</a>
      </div>
      ${pct !== null && o.status !== "delivered" ? `<div class="oc-bar" role="img" aria-label="${esc(o.status_label)}"><span style="width:${Math.max(6, pct)}%"></span></div>` : ""}
    </article>`;
  }

  async function orderView(num){
    $("acCrumbs").innerHTML = `<a href="/">Home</a><span aria-hidden="true">/</span><a href="/account">My account</a><span aria-hidden="true">/</span><span aria-current="page">Order #${esc(num)}</span>`;
    box.innerHTML = `<div class="card ac-loading">Loading your order…</div>`;
    try {
      const o = await myOrder(num);
      if(!alive) return;
      box.innerHTML = `<a class="ac-back" href="/account">← All orders</a><div class="ov">${orderHtml(o)}</div>`;
      wireOrder(box); syncContacts(box);
    } catch(err){
      if(alive) box.innerHTML = `<a class="ac-back" href="/account">← All orders</a><div class="card ac-empty"><h2>Order not found</h2><p class="sub">${esc(err.message)}</p></div>`;
    }
  }

  function renderPhotoCard(c){
    const card = $("pfPhoto");
    if(!card) return;
    card.querySelector(".av").innerHTML = c.avatar ? `<img src="${esc(assetUrl(c.avatar))}" alt="Your profile photo">` : esc(initials(c.name));
    $("pfRemove").hidden = !c.avatar;
  }

  function profileView(){
    const c = currentCustomer();
    box.innerHTML = `
      <div class="ac-grid">
        <div class="card ac-photo-card" id="pfPhoto">
          <h2>Profile photo</h2>
          <span class="av av-lg" aria-hidden="true"></span>
          <div class="btns"><label class="btn btn-ink" for="acFile">Upload new photo</label><button type="button" class="btn btn-line" id="pfRemove" hidden><span class="lbl">Remove</span><span class="spin" aria-hidden="true"></span></button></div>
          <p class="sub">JPG, PNG or WebP, up to 5 MB. We crop it to a square.</p>
        </div>
        <form class="card" id="pfForm" novalidate>
          <h2>Your details</h2>
          <div class="fields">
            <div class="fld full"><label for="pfName">Full name</label><input id="pfName" autocomplete="name" maxlength="100" value="${esc(c.name)}"><p class="err"></p></div>
            <div class="fld"><label for="pfEmail">Email <small>(for order updates)</small></label><input id="pfEmail" type="email" autocomplete="email" maxlength="150" value="${esc(c.email || "")}"><p class="err"></p></div>
            <div class="fld"><label for="pfPhone">Mobile number <small>${c.phoneVerified ? "(verified)" : ""}</small></label><div class="tel"><span aria-hidden="true">+91</span><input id="pfPhone" type="tel" value="${esc(c.phone || "")}" readonly aria-readonly="true"></div><p class="err"></p></div>
            <div class="full" id="pfPwRow" hidden>${passwordField("pfPw", "Current password", "current-password", "(needed to change your email)")}</div>
          </div>
          <p class="sub">You sign in with your mobile number. To change it, please <a class="link" href="/contact">contact us</a>.</p>
          <p class="form-msg" role="alert"></p>
          <p class="ok-msg" role="status"></p>
          <button type="submit" class="btn btn-ink"><span class="lbl">Save changes</span><span class="spin" aria-hidden="true"></span></button>
        </form>
      </div>`;
    renderPhotoCard(c);
    wirePasswordToggles(box);
    $("pfRemove").onclick = () => busy($("pfRemove"), async () => {
      try { renderHero(await removeAvatar()); } catch(err){ photoMsg.textContent = err.message; }
    });

    const form = $("pfForm"), name = $("pfName"), email = $("pfEmail"), phone = $("pfPhone"), pw = $("pfPw");
    const contactChanged = () => {
      const cur = currentCustomer();
      return email.value.trim().toLowerCase() !== (cur.email || "");
    };
    const syncPw = () => { $("pfPwRow").hidden = !contactChanged(); };
    email.addEventListener("input", syncPw);
    form.addEventListener("submit", e => {
      e.preventDefault();
      const msg = form.querySelector(".form-msg"), ok = form.querySelector(".ok-msg");
      msg.textContent = ok.textContent = "";
      const checks = [
        fieldError(name, name.value.trim().length < 2 ? "Please enter your name." : ""),
        fieldError(email, emailProblem(email.value.trim())),
        contactChanged() ? fieldError(pw, pw.value ? "" : "Enter your current password to change your email.") : true,
      ];
      if(checks.includes(false)){ form.querySelector(".invalid input")?.focus(); return; }
      busy(form.querySelector("button[type=submit]"), async () => {
        try {
          const c2 = await updateProfile({ name: name.value.trim(), email: email.value.trim(), currentPassword: pw.value });
          if(!alive) return;
          renderHero(c2); pw.value = ""; syncPw();
          ok.textContent = "Saved. Your details are up to date.";
        } catch(err){
          const field = { currentPassword: pw, email, phone, name }[err.field];
          if(field) fieldError(field, err.message); else msg.textContent = err.message;
        }
      });
    });
  }

  function securityView(){
    box.innerHTML = `
      <div class="ac-grid">
        <form class="card" id="pwForm" novalidate>
          <h2>Change password</h2>
          <div class="fields one">
            ${passwordField("pwCur", "Current password", "current-password")}
            ${passwordField("pwNew", "New password", "new-password", "(8+ characters, with a letter and a number)")}
            ${passwordField("pwAgain", "New password again", "new-password")}
          </div>
          <p class="sub">Changing your password signs you out on your other devices.</p>
          <p class="form-msg" role="alert"></p>
          <p class="ok-msg" role="status"></p>
          <button type="submit" class="btn btn-ink"><span class="lbl">Change password</span><span class="spin" aria-hidden="true"></span></button>
          <p class="lg-alt">Forgot your current password? <a class="link" href="/reset-password">Reset it with a code by SMS</a></p>
        </form>
        <div class="ac-stack">
          <div class="card">
            <h2>Sign out everywhere</h2>
            <p class="sub">Signed in on a shared or lost device? This signs you out on every phone and computer, including this one.</p>
            <button type="button" class="btn btn-line" id="outAll"><span class="lbl">Sign out of all devices</span><span class="spin" aria-hidden="true"></span></button>
          </div>
          <div class="card">
            <h2>Sign out</h2>
            <p class="sub">Sign out on this device only.</p>
            <button type="button" class="btn btn-line" id="outHere">Sign out</button>
          </div>
        </div>
      </div>`;
    wirePasswordToggles(box);
    $("outHere").onclick = () => busy($("outHere"), async () => { await logout(); navigate("/login"); });
    $("outAll").onclick = () => {
      if(!window.confirm("Sign out of NawaraTrend on all your devices, including this one?")) return;
      busy($("outAll"), async () => { try { await logoutEverywhere(); } catch { /* signed out locally anyway */ } navigate("/login"); });
    };
    const form = $("pwForm"), cur = $("pwCur"), nw = $("pwNew"), again = $("pwAgain");
    form.addEventListener("submit", e => {
      e.preventDefault();
      const msg = form.querySelector(".form-msg"), ok = form.querySelector(".ok-msg");
      msg.textContent = ok.textContent = "";
      const checks = [
        fieldError(cur, cur.value ? "" : "Enter your current password."),
        fieldError(nw, passwordProblem(nw.value) || (nw.value && nw.value === cur.value ? "Choose a password different from the current one." : "")),
        fieldError(again, again.value !== nw.value ? "The two new passwords don't match." : ""),
      ];
      if(checks.includes(false)){ form.querySelector(".invalid input")?.focus(); return; }
      busy(form.querySelector("button[type=submit]"), async () => {
        try {
          await changePassword(cur.value, nw.value, again.value);
          if(!alive) return;
          form.reset();
          ok.textContent = "Password changed. You've been signed out on your other devices.";
        } catch(err){
          const field = { currentPassword: cur, newPassword: nw, confirmPassword: again }[err.field];
          if(field) fieldError(field, err.message); else msg.textContent = err.message;
        }
      });
    });
  }

  return () => { alive = false; };
}

/** Reads an image file, crops the middle square and returns it as a size×size JPEG data URL. */
function squareJpeg(file, size){
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      if(img.naturalWidth < 64 || img.naturalHeight < 64) return reject(new Error("That photo is too small. Please choose one at least 64 pixels wide."));
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const canvas = Object.assign(document.createElement("canvas"), { width: size, height: size });
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size);   // transparent PNGs get a white background
      ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
      resolve(canvas.toDataURL("image/jpeg", 0.86));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("We couldn't read that photo. Please choose a JPG, PNG or WebP image.")); };
    img.src = url;
  });
}
