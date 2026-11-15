/* Customer sign-in / create-account page. Opened with ?next=/path to return there afterwards (e.g. checkout);
   otherwise a signed-in customer goes to My account. */
import { currentCustomer, login, register, MOCK } from "../services/customerApi.js";

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

  const done = () => navigate(next || "/account", { replace: true });
  // already signed in: nothing to do here
  if(currentCustomer()){ done(); return; }

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

  // "Show" button next to each password box
  document.querySelectorAll(".pw-show").forEach(b => b.addEventListener("click", () => {
    const input = $(b.getAttribute("aria-controls")), show = input.type === "password";
    input.type = show ? "text" : "password";
    b.textContent = show ? "Hide" : "Show"; b.setAttribute("aria-pressed", show);
  }));

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
        done();
      } catch(err){
        msg.textContent = err.message || "Something went wrong. Please try again.";
      } finally { btn.classList.remove("loading"); }
    });
  };
  wire("formIn", ["inContact","inPass"], () => login({ contact: $("inContact").value.trim(), password: $("inPass").value }));
  wire("formUp", ["upName","upContact","upPass"], () => register({ name: $("upName").value.trim(), contact: $("upContact").value.trim(), password: $("upPass").value }));

  return () => { alive = false; };
}
