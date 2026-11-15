/* One order, as the customer sees it: progress steps, courier tracking, the timeline of updates,
   items, totals, address and payment. Used by My account (/account/orders/NT…) and Track order (/track). */
import { inr } from "./storefront.js";
import { assetUrl } from "../services/customerApi.js";

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
// +919876543210 -> +91 98765 43210
const prettyPhone = p => { const d = String(p || "").replace(/\D/g, "").slice(-10); return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : p; };
const safeUrl = u => /^https?:\/\//i.test(u || "") ? u : "";

export const dateLong = v => new Date(v).toLocaleDateString("en-IN", {day:"numeric", month:"short", year:"numeric"});
export const dateTime = v => new Date(v).toLocaleString("en-IN", {day:"numeric", month:"short", hour:"numeric", minute:"2-digit"});
const dayOnly = v => new Date(v).toLocaleDateString("en-IN", {weekday:"short", day:"numeric", month:"short"});

// status → colour family for the chip (see .st-* in account.css)
export const statusTone = s => ({
  delivered:"ok", cancelled:"bad", returned:"bad", delivery_failed:"bad", on_hold:"warn", return_requested:"warn",
}[s] || (s === "pending" ? "new" : "go"));
export const chip = (status, label) => `<span class="st st-${statusTone(status)}">${esc(label)}</span>`;

const BOX = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 8 12 3 3 8m18 0-9 5m9-5v9l-9 5m0-9L3 8m9 5v9M3 8v9l9 5"/></svg>';
export const thumb = (i, cls = "ov-thumb") => `<span class="${cls}">${i.image ? `<img src="${esc(i.image)}" alt="" loading="lazy">` : BOX}</span>`;

const EXCEPTION_TEXT = {
  on_hold: "Your order is on hold for the moment. We'll be in touch if we need anything from you.",
  delivery_failed: "The courier couldn't deliver your order. They'll try again, or we'll contact you to arrange it.",
  cancelled: "This order has been cancelled.",
  return_requested: "We've received your return request and will arrange the pickup.",
  returned: "This order has been returned.",
};

/** Progress steps. Exceptions (cancelled, on hold…) show where the order got to, plus a notice. */
function progressHtml(o){
  const { steps, reached, exception } = o.progress;
  // when each step was reached (first time), from the timeline
  const at = {};
  [...o.timeline].reverse().forEach(t => { if(!at[t.status]) at[t.status] = t.at; });
  const stopped = exception === "cancelled" || exception === "returned";
  return `<ol class="ov-steps${stopped ? " stopped" : ""}" aria-label="Order progress">${steps.map((s, i) => {
    const state = i < reached || (i === reached && s.key === "delivered") ? "done" : i === reached ? (stopped ? "done" : "now") : "";
    return `<li class="${state}"${state === "now" ? ' aria-current="step"' : ""}><span class="dot" aria-hidden="true"></span><b>${esc(s.label)}</b>${at[s.key] ? `<small>${esc(dayOnly(at[s.key]))}</small>` : ""}</li>`;
  }).join("")}</ol>`;
}

function trackingHtml(o){
  if(!o.tracking_number && !o.expected_delivery && !o.courier) return "";
  const url = safeUrl(o.tracking_url);
  const done = ["delivered","returned","cancelled"].includes(o.status);
  return `<div class="card ov-track">
    <div class="ov-track-info">
      ${o.courier || o.tracking_number ? `<div><span class="mono">Courier</span><b>${esc(o.courier || "Courier")}</b></div>` : ""}
      ${o.tracking_number ? `<div><span class="mono">Tracking number</span><b class="ov-awb">${esc(o.tracking_number)} <button type="button" class="link ov-copy" data-copy-text="${esc(o.tracking_number)}">Copy</button></b></div>` : ""}
      ${o.expected_delivery && !done ? `<div><span class="mono">Expected delivery</span><b>${esc(dateLong(o.expected_delivery))}</b></div>` : ""}
    </div>
    ${url ? `<a class="btn btn-ink" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Track on courier website ↗</a>` : ""}
  </div>`;
}

/** The whole order page. guest = opened from Track order (no street address is shown). */
export function orderHtml(o, { guest = false } = {}){
  const a = o.address || {};
  const addr = guest
    ? `${esc(a.name)}<br>${esc(a.city)}, ${esc(a.state)} ${esc(a.pin)}`
    : [a.name, a.line1, a.line2, `${a.city}, ${a.state} ${a.pin}`, prettyPhone(a.phone)].filter(Boolean).map(esc).join("<br>");
  const exception = o.progress.exception;
  const waText = encodeURIComponent(`Hi NawaraTrend, I have a question about my order #${o.order_number}.`);
  return `
  <div class="card ov-head">
    <div>
      <p class="mono">Order #${esc(o.order_number)}</p>
      <h2>${esc(o.status_label)}</h2>
      <p class="sub">Placed ${esc(dateLong(o.created_at))} · ${inr(o.total)} · ${esc(o.payment_method_label)}</p>
    </div>
    ${chip(o.status, o.status_label)}
  </div>
  ${exception ? `<div class="ov-notice ov-${statusTone(exception)}" role="status">${esc(o.timeline[0]?.message || EXCEPTION_TEXT[exception] || "")}</div>` : ""}
  <div class="card">${progressHtml(o)}</div>
  ${trackingHtml(o)}
  <div class="ov-grid">
    <div class="card ov-updates">
      <h2>Updates</h2>
      <ol class="ov-timeline">${o.timeline.map((t, i) => `<li class="${i === 0 ? "latest" : ""}">
        <span class="dot" aria-hidden="true"></span>
        <div><b>${esc(t.label)}</b> <time datetime="${esc(t.at)}">${esc(dateTime(t.at))}</time></div>
        ${t.message ? `<p>${esc(t.message)}</p>` : ""}
      </li>`).join("")}</ol>
    </div>
    <div class="ov-side">
      <div class="card">
        <h2>Items</h2>
        <ul class="ov-items">${o.items.map(i => `<li>
          ${thumb(i)}
          <div><b>${i.slug ? `<a href="/product/${esc(i.slug)}">${esc(i.name)}</a>` : esc(i.name)}</b><small>${i.size ? `Size ${esc(i.size)} · ` : ""}Qty ${i.qty}</small></div>
          <span class="amt">${inr(i.line_total)}</span>
        </li>`).join("")}</ul>
        <div class="totals">
          <div><span>Subtotal</span><b>${inr(o.subtotal)}</b></div>
          <div><span>Delivery</span>${o.delivery_fee ? `<b>${inr(o.delivery_fee)}</b>` : '<b class="free">Free</b>'}</div>
          <div class="grand"><span>Total</span><b>${inr(o.total)}</b></div>
        </div>
      </div>
      <div class="card ov-facts">
        <div><h3>Delivering to</h3><p>${addr}</p></div>
        <div><h3>Payment</h3><p>${esc(o.payment_method_label)}<br><span class="pay-st pay-${esc(o.payment_status)}">${esc(o.payment_status_label)}</span></p></div>
      </div>
      <div class="card ov-help">
        <h3>Need help with this order?</h3>
        <p>Message us with your order number and we'll sort it out.</p>
        <div class="btns"><a class="btn btn-line" href="https://wa.me/919807562620?text=${waText}" target="_blank" rel="noopener">WhatsApp us</a><a class="link" href="/contact">Other ways to reach us</a></div>
      </div>
    </div>
  </div>`;
}

/** Wires the "Copy" buttons inside a rendered order. */
export function wireOrder(root){
  root.querySelectorAll("[data-copy-text]").forEach(b => b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(b.dataset.copyText); b.textContent = "Copied"; setTimeout(() => { b.textContent = "Copy"; }, 1500); }
    catch { /* clipboard blocked: the number is on screen to copy by hand */ }
  }));
}

export { assetUrl };
