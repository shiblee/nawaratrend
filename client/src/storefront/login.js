/* Customer sign-in / create-account page. Opened with ?next=/path to return there afterwards (e.g. checkout);
   otherwise a signed-in customer goes to My account. Opening /login?tab=register shows the sign-up form.
   Sign-up has two steps: the details, then the code texted to the mobile number. The account only exists
   once the code is verified. */
import { currentCustomer, login, register, verifyRegistration, resendOtp, MOCK } from "../services/customerApi.js";
import { fieldError, wirePasswordToggles, busy, passwordProblem, emailProblem, mobileProblem, mobileDigits } from "./forms.js";
import { mountOtp, countdown, wireMeter } from "./otp.js";

const $ = id => document.getElementById(id);

const RULES = {
  inMobile: v => !v.trim() ? "Enter your mobile number." : mobileProblem(v),
  inPass: v => !v ? "Enter your password." : "",
  upName: v => v.trim().length < 2 ? "Please enter your full name." : v.trim().length > 100 ? "Use at most 100 characters." : "",
  upMobile: v => !v.trim() ? "Enter your mobile number." : mobileProblem(v),
  upEmail: v => emailProblem(v.trim()),
  upPass: v => !v ? "Choose a password." : passwordProblem(v),
  upTerms: (v, el) => el.checked ? "" : "Please accept the Terms and Privacy Policy.",
};

export function initLogin({ navigate }){
  let alive = true, stopTimer = () => {}, otp = null, session = null, remember = false;
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

  /* ---------- tabs ---------- */
  const show = which => {
    const up = which === "up";
    $("lgTabs").hidden = which === "otp";
    $("tabIn").setAttribute("aria-selected", !up); $("tabUp").setAttribute("aria-selected", up);
    $("formIn").hidden = which !== "in"; $("formUp").hidden = which !== "up"; $("formOtp").hidden = which !== "otp";
    $("lgTitle").innerHTML = which === "in" ? "Welcome <span>back</span>" : which === "up" ? "Create an <span>account</span>" : "Almost <span>there</span>";
    $("lgIntro").textContent = which === "otp" ? "One last step: confirm your mobile number." : which === "up"
      ? "Join Nawara Trend in a minute. Your mobile number is how you'll sign in." : next === "/checkout"
      ? "Sign in to check out faster, or continue as a guest." : "Sign in with your mobile number to check out faster and keep track of your orders.";
  };
  $("tabIn").onclick = () => show("in");
  $("tabUp").onclick = () => show("up");
  document.querySelectorAll("[data-tab]").forEach(b => { b.onclick = () => { show(b.dataset.tab); $(b.dataset.tab === "up" ? "upName" : "inMobile").focus(); }; });
  if(params.get("tab") === "register") show("up");

  /* ---------- fields ---------- */
  const check = id => { const el = $(id); return fieldError(el, RULES[id](el.value, el)); };
  Object.keys(RULES).forEach(id => $(id).addEventListener(id === "upTerms" ? "change" : "input", () => { if($(id).closest(".fld").classList.contains("invalid")) check(id); }));
  wirePasswordToggles($("lgCard"));
  wireMeter($("upPass"), $("upMeter"));
  const firstBad = ids => { const bad = ids.filter(id => !check(id)); if(bad.length) $(bad[0]).focus(); return bad.length > 0; };
  // a server error about one field goes under that field
  const showErr = (form, err, fields) => {
    const el = fields[err.field];
    if(el) { fieldError(el, err.message); el.focus(); }
    else form.querySelector(".form-msg").textContent = err.message || "Something went wrong. Please try again.";
  };

  /* ---------- sign in ---------- */
  const fIn = $("formIn");
  fIn.addEventListener("submit", e => {
    e.preventDefault();
    fIn.querySelector(".form-msg").textContent = "";
    if(firstBad(["inMobile", "inPass"])) return;
    busy(fIn.querySelector("button[type=submit]"), async () => {
      try {
        await login({ mobile: mobileDigits($("inMobile").value), password: $("inPass").value, remember: $("inRemember").checked });
        if(alive) done();
      } catch(err){ showErr(fIn, err, { mobile: $("inMobile") }); }
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
        openOtp(r);
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

  /* ---------- verify the code ---------- */
  const fOtp = $("formOtp"), msg = fOtp.querySelector(".form-msg"), ok = fOtp.querySelector(".ok-msg");
  const timer = (r) => { stopTimer(); stopTimer = countdown($("otpResend"), r.resendIn, { none: r.resendsLeft <= 0 }); };
  function openOtp(r){
    session = r.session;
    show("otp");
    $("otpTo").innerHTML = `Enter the ${r.length}-digit code we sent to <b>${r.mobile}</b>.`;
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
        await verifyRegistration(session, code, remember);
        if(alive) done();
      } catch(err){
        otp.disable(false);
        ok.textContent = "";
        msg.textContent = err.message;
        if(["otp_session_closed", "otp_locked", "registration_expired", "mobile_taken", "email_taken"].includes(err.code)){
          stopTimer(); $("otpResend").disabled = true;
          msg.innerHTML = `${err.message} <button type="button" class="link" id="otpRestart">Start again</button>`;
          $("otpRestart").onclick = () => { show("up"); $("upMobile").focus(); };
        } else { otp.bad(); otp.clear(); }
      }
    });
  });
  $("otpResend").addEventListener("click", () => {
    msg.textContent = ok.textContent = "";
    busy($("otpResend"), async () => {
      try {
        const r = await resendOtp(session, "registration");
        if(!alive) return;
        (r.sent === false ? msg : ok).textContent = r.message;
        otp.clear(); timer(r);
      } catch(err){
        msg.textContent = err.message;
        if(err.data?.resendIn) timer({ resendIn: err.data.resendIn, resendsLeft: 1 });
      }
    });
  });
  $("otpBack").onclick = () => { stopTimer(); show("up"); $("upMobile").focus(); };

  return () => { alive = false; stopTimer(); };
}
