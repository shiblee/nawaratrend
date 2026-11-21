/* Forgotten password (/reset-password), in three steps: the mobile number, the code texted to it, then a new
   password. The reply to step 1 is the same whether or not the number has an account. A successful reset
   signs the customer in here and signs out every other device. */
import { forgotPassword, verifyResetCode, resetPassword, resendOtp } from "../services/customerApi.js";
import { fieldError, wirePasswordToggles, busy, passwordProblem, mobileProblem, mobileDigits } from "./forms.js";
import { mountOtp, countdown, wireMeter } from "./otp.js";

const $ = id => document.getElementById(id);

export function initReset({ navigate }){
  let alive = true, stopTimer = () => {}, otp = null, session = null, resetToken = null;
  const step = n => {
    ["rsAsk", "rsCode", "rsSet"].forEach((id, i) => { $(id).hidden = i !== n - 1; });
    ["st1", "st2", "st3"].forEach((id, i) => { if(i === n - 1) $(id).setAttribute("aria-current", "step"); else $(id).removeAttribute("aria-current"); $(id).classList.toggle("done", i < n - 1); });
    $("rsTitle").innerHTML = ["Forgot your <span>password?</span>", "Check your <span>messages</span>", "Choose a new <span>password</span>"][n - 1];
    $("rsIntro").textContent = ["Enter the mobile number of your account and we'll text you a code to reset it.",
      "If an account uses this number, we've texted it a code.", "Pick a password you don't use anywhere else."][n - 1];
  };
  wirePasswordToggles(document.querySelector(".lg-wrap"));
  wireMeter($("rsNew"), $("rsMeter"));

  /* 1. mobile */
  const ask = $("rsAsk"), mobile = $("rsMobile");
  ask.addEventListener("submit", e => {
    e.preventDefault();
    ask.querySelector(".form-msg").textContent = "";
    if(!fieldError(mobile, !mobile.value.trim() ? "Enter your mobile number." : mobileProblem(mobile.value))) { mobile.focus(); return; }
    busy(ask.querySelector("button[type=submit]"), async () => {
      try {
        const r = await forgotPassword(mobileDigits(mobile.value));
        if(alive) openCode(r);
      } catch(err){ ask.querySelector(".form-msg").textContent = err.message; }
    });
  });

  /* 2. code */
  const codeForm = $("rsCode"), msg = codeForm.querySelector(".form-msg"), ok = codeForm.querySelector(".ok-msg");
  const timer = r => { stopTimer(); stopTimer = countdown($("rsResend"), r.resendIn, { none: r.resendsLeft <= 0 }); };
  function openCode(r){
    session = r.session;
    step(2);
    $("rsTo").innerHTML = `Enter the ${r.length}-digit code sent to <b>${r.mobile}</b>. It expires in ${Math.max(1, Math.round(r.expiresIn / 60))} minutes.`;
    otp = mountOtp($("rsBoxes"), { length: r.length, onComplete: () => codeForm.requestSubmit() });
    msg.textContent = ""; ok.textContent = r.message || "";
    timer(r);
    otp.focus();
  }
  codeForm.addEventListener("submit", e => {
    e.preventDefault();
    msg.textContent = "";
    const code = otp.value();
    if(code.length < $("rsBoxes").querySelectorAll("input").length){ msg.textContent = "Enter all the digits of the code."; otp.focus(); return; }
    busy(codeForm.querySelector("button[type=submit]"), async () => {
      otp.disable(true);
      try {
        const r = await verifyResetCode(session, code);
        if(!alive) return;
        resetToken = r.resetToken;
        stopTimer(); step(3); $("rsNew").focus();
      } catch(err){
        otp.disable(false); ok.textContent = "";
        msg.textContent = err.message;
        if(["otp_session_closed", "otp_locked"].includes(err.code)){ stopTimer(); $("rsResend").disabled = true; }
        else { otp.bad(); otp.clear(); }
      }
    });
  });
  $("rsResend").addEventListener("click", () => {
    msg.textContent = ok.textContent = "";
    busy($("rsResend"), async () => {
      try { const r = await resendOtp(session, "password_reset"); if(alive){ ok.textContent = r.message; otp.clear(); timer(r); } }
      catch(err){ msg.textContent = err.message; if(err.data?.resendIn) timer({ resendIn: err.data.resendIn, resendsLeft: 1 }); }
    });
  });
  $("rsBack").onclick = () => { stopTimer(); step(1); mobile.focus(); };

  /* 3. new password */
  const setForm = $("rsSet");
  setForm.addEventListener("submit", e => {
    e.preventDefault();
    const nw = $("rsNew"), again = $("rsAgain"), m = setForm.querySelector(".form-msg");
    m.textContent = "";
    const fine = [fieldError(nw, passwordProblem(nw.value)), fieldError(again, again.value !== nw.value ? "The two passwords don't match." : "")];
    if(fine.includes(false)) return;
    busy(setForm.querySelector("button[type=submit]"), async () => {
      try { await resetPassword(session, resetToken, nw.value, again.value); if(alive) navigate("/account"); }
      catch(err){
        m.innerHTML = err.code === "reset_expired" ? `${err.message} <a class="link" href="/reset-password">Start again</a>` : "";
        if(err.code !== "reset_expired") m.textContent = err.message;
      }
    });
  });

  mobile.focus({ preventScroll: true });
  return () => { alive = false; stopTimer(); };
}
