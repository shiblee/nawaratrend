/* Customer sign-in / create-account page. Opened with ?next=/path to return there afterwards (e.g. checkout);
   otherwise a signed-in customer goes to My account. Opening /login?tab=register shows the sign-up form.
   Three ways in:
   - mobile + password, or mobile + a code by SMS (the "Password / Code by SMS" switch);
   - Sign in with Google: the first time, the customer confirms their mobile number once with a code, which links
     Google to that number's account (or creates one). Every account keeps one verified mobile number.
   Sign-up has two steps: the details, then the code texted to the mobile number. The account only exists
   once the code is verified. */
import { currentCustomer, login, register, verifyRegistration, resendOtp, MOCK, sendLoginCode, verifyLoginCode,
  googleConfig, googleSignIn, googleSendCode, googleVerify } from "../services/customerApi.js";
import { fieldError, wirePasswordToggles, busy, passwordProblem, emailProblem, mobileProblem, mobileDigits } from "./forms.js";
import { mountOtp, countdown, wireMeter } from "./otp.js";

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const RULES = {
  inMobile: v => !v.trim() ? "Enter your mobile number." : mobileProblem(v),
  inPass: v => !v ? "Enter your password." : "",
  upName: v => v.trim().length < 2 ? "Please enter your full name." : v.trim().length > 100 ? "Use at most 100 characters." : "",
  upMobile: v => !v.trim() ? "Enter your mobile number." : mobileProblem(v),
  upEmail: v => emailProblem(v.trim()),
  upPass: v => !v ? "Choose a password." : passwordProblem(v),
  upTerms: (v, el) => el.checked ? "" : "Please accept the Terms and Privacy Policy.",
  gMobile: v => !v.trim() ? "Enter your mobile number." : mobileProblem(v),
  gTerms: (v, el) => el.checked ? "" : "Please accept the Terms and Privacy Policy.",
};

// what the code screen is for: finishing sign-up, signing in, or confirming the mobile after Google
const OTP_MODES = {
  register: { purpose: "registration", label: "Verify & create account", title: "Almost <span>there</span>", intro: "One last step: confirm your mobile number." },
  login: { purpose: "login", label: "Verify & sign in", title: "Check your <span>phone</span>", intro: "Enter the code we texted you to sign in." },
  google: { purpose: "google_link", label: "Verify & continue", title: "Almost <span>there</span>", intro: "Confirm your mobile number to finish signing in with Google." },
};

/** Loads Google's sign-in script once. */
let gsiPromise = null;
const loadGsi = () => gsiPromise || (gsiPromise = new Promise((resolve, reject) => {
  if(window.google?.accounts?.id) return resolve(window.google);
  const s = Object.assign(document.createElement("script"), { src: "https://accounts.google.com/gsi/client", async: true });
  s.onload = () => resolve(window.google); s.onerror = () => { gsiPromise = null; reject(new Error("gsi")); };
  document.head.appendChild(s);
}));

export function initLogin({ navigate }){
  let alive = true, stopTimer = () => {}, otp = null, session = null, remember = false, mode = "register", method = "password", ticket = null, view = "in";
  // only allow returning to a page on this site
  const params = new URLSearchParams(location.search);
  const raw = params.get("next") || "";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "";
  $("lgDemo").hidden = !MOCK;
  $("lgGuest").hidden = next !== "/checkout";
  if(next === "/checkout") $("lgIntro").textContent = "Sign in to check out faster, or continue as a guest.";

  const done = () => navigate(next || "/account", { replace: true });
  // already signed in: nothing to do here
  if(currentCustomer()){ done(); return; }

  /* ---------- screens ---------- */
  let googleReady = false;
  const show = which => {
    view = which;
    const up = which === "up", tabs = which === "in" || up;
    $("lgTabs").hidden = !tabs;
    $("gBlock").hidden = !(tabs && googleReady);
    $("tabIn").setAttribute("aria-selected", !up); $("tabUp").setAttribute("aria-selected", up);
    $("formIn").hidden = which !== "in"; $("formUp").hidden = which !== "up"; $("formOtp").hidden = which !== "otp"; $("formGoogle").hidden = which !== "google";
    const m = OTP_MODES[mode];
    $("lgTitle").innerHTML = which === "in" ? "Welcome <span>back</span>" : up ? "Create an <span>account</span>" : which === "google" ? "One last <span>step</span>" : m.title;
    $("lgIntro").textContent = which === "otp" ? m.intro : which === "google" ? "Signed in with Google. Now confirm your mobile number." : up
      ? "Join Nawara Trend in a minute. Your mobile number is how you'll sign in." : next === "/checkout"
      ? "Sign in to check out faster, or continue as a guest." : "Sign in with your mobile number to check out faster and keep track of your orders.";
  };
  $("tabIn").onclick = () => show("in");
  $("tabUp").onclick = () => show("up");
  document.querySelectorAll("[data-tab]").forEach(b => { b.onclick = () => { show(b.dataset.tab); $(b.dataset.tab === "up" ? "upName" : "inMobile").focus(); }; });
  if(params.get("tab") === "register") show("up");

  /* ---------- fields ---------- */
  const check = id => { const el = $(id); return fieldError(el, RULES[id](el.value, el)); };
  Object.keys(RULES).forEach(id => $(id).addEventListener(/Terms$/.test(id) ? "change" : "input", () => { if($(id).closest(".fld").classList.contains("invalid")) check(id); }));
  wirePasswordToggles($("lgCard"));
  wireMeter($("upPass"), $("upMeter"));
  const firstBad = ids => { const bad = ids.filter(id => !check(id)); if(bad.length) $(bad[0]).focus(); return bad.length > 0; };
  // a server error about one field goes under that field
  const showErr = (form, err, fields) => {
    const el = fields[err.field];
    if(el) { fieldError(el, err.message); el.focus(); }
    else form.querySelector(".form-msg").textContent = err.message || "Something went wrong. Please try again.";
  };
  // "no account with this number": offer to create one with the number already filled in
  const offerSignUp = (form, mobileEl, message) => {
    fieldError(mobileEl, message);
    form.querySelector(".form-msg").innerHTML = `<button type="button" class="link" id="goUp">Create an account with this number</button>`;
    $("goUp").onclick = () => { $("upMobile").value = mobileEl.value; show("up"); $("upName").focus(); };
  };

  /* ---------- sign in: password or code by SMS ---------- */
  const setMethod = m => {
    method = m;
    $("mPass").setAttribute("aria-checked", m === "password"); $("mCode").setAttribute("aria-checked", m === "code");
    $("inPassFld").classList.toggle("gone", m === "code");
    $("inForgot").hidden = m === "code";
    $("inSubmit").textContent = m === "code" ? "Send me a code" : "Sign in";
    $("formIn").querySelector(".form-msg").textContent = "";
    fieldError($("inPass"), "");
  };
  $("mPass").onclick = () => { setMethod("password"); $("inPass").focus(); };
  $("mCode").onclick = () => { setMethod("code"); $("inMobile").focus(); };
  $("formIn").querySelector(".lg-method").addEventListener("keydown", e => {   // arrow keys move between the two choices
    if(!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault(); const to = method === "password" ? "code" : "password"; setMethod(to); $(to === "code" ? "mCode" : "mPass").focus();
  });

  const fIn = $("formIn");
  fIn.addEventListener("submit", e => {
    e.preventDefault();
    fIn.querySelector(".form-msg").textContent = "";
    if(firstBad(method === "code" ? ["inMobile"] : ["inMobile", "inPass"])) return;
    busy(fIn.querySelector("button[type=submit]"), async () => {
      try {
        if(method === "code"){
          const r = await sendLoginCode(mobileDigits($("inMobile").value));
          if(!alive) return;
          remember = $("inRemember").checked;
          openOtp("login", r);
          return;
        }
        await login({ mobile: mobileDigits($("inMobile").value), password: $("inPass").value, remember: $("inRemember").checked });
        if(alive) done();
      } catch(err){
        if(err.code === "no_account") return offerSignUp(fIn, $("inMobile"), err.message);
        showErr(fIn, err, { mobile: $("inMobile") });
        if(method === "password" && err.status === 401){
          fIn.querySelector(".form-msg").innerHTML = `${esc(err.message)}. <button type="button" class="link" id="tryCode">Sign in with a code by SMS instead</button>`;
          $("tryCode").onclick = () => { setMethod("code"); fIn.requestSubmit(); };
        }
      }
    });
  });

  /* ---------- create account ---------- */
  const fUp = $("formUp");
  fUp.addEventListener("submit", e => {
    e.preventDefault();
    fUp.querySelector(".form-msg").textContent = "";
    if(firstBad(["upName", "upMobile", "upEmail", "upPass", "upTerms"])) return;
    busy(fUp.querySelector("button[type=submit]"), async () => {
      try {
        const r = await register({ name: $("upName").value.trim(), mobile: mobileDigits($("upMobile").value), email: $("upEmail").value.trim(),
          password: $("upPass").value, acceptTerms: $("upTerms").checked });
        if(!alive) return;
        remember = true;
        openOtp("register", r);
      } catch(err){
        if(err.code === "mobile_taken"){
          fieldError($("upMobile"), err.message);
          fUp.querySelector(".form-msg").innerHTML = `This number already has an account. <button type="button" class="link" id="goIn">Sign in</button> or <a class="link" href="/reset-password">reset the password</a>.`;
          $("goIn").onclick = () => { $("inMobile").value = $("upMobile").value; show("in"); $("inPass").focus(); };
          return;
        }
        showErr(fUp, err, { name: $("upName"), mobile: $("upMobile"), email: $("upEmail"), password: $("upPass"), acceptTerms: $("upTerms") });
      }
    });
  });

  /* ---------- Sign in with Google ---------- */
  const gMsg = () => (view === "up" ? fUp : fIn).querySelector(".form-msg");
  async function onGoogle({ credential }){
    gMsg().textContent = "";
    try {
      const r = await googleSignIn(credential, true);
      if(!alive) return;
      if(r.customer) return done();
      ticket = r.ticket; remember = true;
      $("gHello").textContent = r.name ? `Hi ${r.name.split(" ")[0]}!` : "Hi there!";
      $("formGoogle").querySelector(".form-msg").textContent = "";
      const typed = $(view === "up" ? "upMobile" : "inMobile").value;
      if(typed && !$("gMobile").value) $("gMobile").value = typed;
      show("google");
      $("gMobile").focus();
    } catch(err){ gMsg().textContent = err.message; }
  }
  (async () => {
    try {
      const { clientId } = await googleConfig();
      if(!clientId || !alive) return;
      const google = await loadGsi();
      if(!alive) return;
      google.accounts.id.initialize({ client_id: clientId, callback: onGoogle, ux_mode: "popup", context: "signin", itp_support: true });
      const width = Math.min(400, $("lgCard").clientWidth - 48);
      google.accounts.id.renderButton($("gBtn"), { theme: "outline", size: "large", shape: "pill", text: "continue_with", logo_alignment: "center", width });
      googleReady = true;
      if(view === "in" || view === "up") $("gBlock").hidden = false;
    } catch { /* Google unavailable (blocked or offline): mobile sign-in still works */ }
  })();

  const fG = $("formGoogle");
  fG.addEventListener("submit", e => {
    e.preventDefault();
    fG.querySelector(".form-msg").textContent = "";
    if(firstBad(["gMobile", "gTerms"])) return;
    busy(fG.querySelector("button[type=submit]"), async () => {
      try {
        const r = await googleSendCode(ticket, mobileDigits($("gMobile").value), $("gTerms").checked);
        if(alive) openOtp("google", r);
      } catch(err){
        if(err.code === "google_ticket_expired"){ show("in"); gMsg().textContent = err.message; return; }
        showErr(fG, err, { mobile: $("gMobile"), acceptTerms: $("gTerms") });
      }
    });
  });
  $("gCancel").onclick = () => { ticket = null; show("in"); };

  /* ---------- verify the code ---------- */
  const fOtp = $("formOtp"), msg = fOtp.querySelector(".form-msg"), ok = fOtp.querySelector(".ok-msg");
  const timer = (r) => { stopTimer(); stopTimer = countdown($("otpResend"), r.resendIn, { none: r.resendsLeft <= 0 }); };
  const back = () => mode === "register" ? "up" : mode === "google" ? "google" : "in";
  function openOtp(m, r){
    mode = m; session = r.session;
    show("otp");
    $("otpSubmit").textContent = OTP_MODES[m].label;
    $("otpBack").textContent = m === "register" ? "Change details" : "Change number";
    $("otpTo").innerHTML = `Enter the ${r.length}-digit code we sent to <b>${esc(r.mobile)}</b>.`;
    otp = mountOtp($("otpBoxes"), { length: r.length, onComplete: () => fOtp.requestSubmit() });
    msg.textContent = r.sent === false ? r.message : ""; ok.textContent = r.sent === false ? "" : r.message || "";
    timer(r);
    otp.focus();
  }
  fOtp.addEventListener("submit", e => {
    e.preventDefault();
    msg.textContent = "";
    const code = otp.value();
    if(!/^\d+$/.test(code) || code.length < $("otpBoxes").querySelectorAll("input").length){ msg.textContent = "Enter all the digits of the code."; otp.focus(); return; }
    busy(fOtp.querySelector("button[type=submit]"), async () => {
      otp.disable(true);
      try {
        if(mode === "login") await verifyLoginCode(session, code, remember);
        else if(mode === "google") await googleVerify(ticket, session, code, remember);
        else await verifyRegistration(session, code, remember);
        if(alive) done();
      } catch(err){
        otp.disable(false);
        ok.textContent = "";
        msg.textContent = err.message;
        if(["otp_session_closed", "otp_locked", "registration_expired", "mobile_taken", "email_taken", "suspended", "google_taken", "google_other", "google_ticket_expired"].includes(err.code)){
          stopTimer(); $("otpResend").disabled = true;
          msg.innerHTML = `${esc(err.message)} <button type="button" class="link" id="otpRestart">Start again</button>`;
          $("otpRestart").onclick = () => { const to = err.code === "google_ticket_expired" ? "in" : back(); show(to); $({ up: "upMobile", google: "gMobile", in: "inMobile" }[to]).focus(); };
        } else { otp.bad(); otp.clear(); }
      }
    });
  });
  $("otpResend").addEventListener("click", () => {
    msg.textContent = ok.textContent = "";
    busy($("otpResend"), async () => {
      try {
        const r = await resendOtp(session, OTP_MODES[mode].purpose);
        if(!alive) return;
        (r.sent === false ? msg : ok).textContent = r.message;
        otp.clear(); timer(r);
      } catch(err){
        msg.textContent = err.message;
        if(err.data?.resendIn) timer({ resendIn: err.data.resendIn, resendsLeft: 1 });
      }
    });
  });
  $("otpBack").onclick = () => { stopTimer(); const to = back(); show(to); $({ up: "upMobile", google: "gMobile", in: "inMobile" }[to]).focus(); };

  return () => { alive = false; stopTimer(); try { window.google?.accounts?.id?.cancel(); } catch { /* ignore */ } };
}
