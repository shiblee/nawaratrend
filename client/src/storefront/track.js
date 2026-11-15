/* Track order (/track): anyone can follow an order with its number and the mobile number used at checkout.
   Opened as /track?order=NT… from emails, the order number is filled in already. */
import { trackOrder, currentCustomer } from "../services/customerApi.js";
import { syncContacts } from "./storefront.js";
import { orderHtml, wireOrder, esc } from "./orderview.js";
import { fieldError, busy, mobileDigits } from "./forms.js";

const $ = id => document.getElementById(id);

export function initTrack(){
  let alive = true;
  const form = $("trForm"), order = $("trOrder"), phone = $("trPhone"), out = $("trResult"), msg = form.querySelector(".form-msg");
  const pre = new URLSearchParams(location.search).get("order");
  if(pre) order.value = pre.replace(/[^A-Za-z0-9-]/g, "").toUpperCase();
  (pre ? phone : order).focus({ preventScroll: true });

  form.addEventListener("submit", e => {
    e.preventDefault();
    msg.textContent = "";
    const num = order.value.trim().replace(/^#/, "").toUpperCase();
    const ok = [
      fieldError(order, /^[A-Z0-9-]{4,30}$/.test(num) ? "" : "Enter your order number, e.g. NT26101234."),
      fieldError(phone, /^[6-9]\d{9}$/.test(mobileDigits(phone.value)) ? "" : "Enter the 10-digit mobile number used for the order."),
    ];
    if(ok.includes(false)){ form.querySelector(".invalid input")?.focus(); return; }
    busy(form.querySelector("button[type=submit]"), async () => {
      try {
        const { order: o, signInToSeeMore } = await trackOrder(num, mobileDigits(phone.value));
        if(!alive) return;
        const mine = signInToSeeMore && currentCustomer();
        out.innerHTML = orderHtml(o, { guest: true }) + (signInToSeeMore
          ? `<p class="lg-alt">${mine ? `<a class="link" href="/account/orders/${esc(o.order_number)}">Open this order in your account</a> for the full details.` : `This order belongs to an account. <a class="link" href="/login?next=/account/orders/${esc(o.order_number)}">Sign in</a> to see the full details.`}</p>` : "");
        wireOrder(out); syncContacts(out);
        out.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch(err){
        out.innerHTML = "";
        msg.textContent = err.message || "We couldn't look up that order. Please try again.";
      }
    });
  });
  return () => { alive = false; };
}
