/* Forgotten password (/reset-password): ask for an emailed link, then (/reset-password?token=…) choose a new password.
   A successful reset signs the customer in and signs out every other device. */
import { forgotPassword, resetPassword } from "../services/customerApi.js";
import { fieldError, wirePasswordToggles, busy, passwordProblem, emailProblem, mobileProblem, passwordField } from "./forms.js";

const $ = id => document.getElementById(id);

export function initReset({ navigate }){
  let alive = true;
  const token = new URLSearchParams(location.search).get("token") || "";

  if(/^[a-f0-9]{64}$/.test(token)){
    // the link's token shouldn't stay in the address bar or browser history
    history.replaceState(history.state, "", "/reset-password");
    $("rsTitle").innerHTML = "Choose a new <span>password</span>";
    $("rsIntro").textContent = "Pick a password you don't use anywhere else. You'll be signed in straight away.";
    $("rsAsk").hidden = true; $("rsSet").hidden = false;
    $("rsFields").innerHTML = passwordField("rsNew", "New password", "new-password", "(8+ characters, with a letter and a number)") + passwordField("rsAgain", "New password again", "new-password");
    wirePasswordToggles($("rsSet"));
    $("rsNew").focus();
    const form = $("rsSet");
    form.addEventListener("submit", e => {
      e.preventDefault();
      const nw = $("rsNew"), again = $("rsAgain"), msg = form.querySelector(".form-msg");
      msg.textContent = "";
      const ok = [fieldError(nw, passwordProblem(nw.value)), fieldError(again, again.value !== nw.value ? "The two passwords don't match." : "")];
      if(ok.includes(false)) return;
      busy(form.querySelector("button[type=submit]"), async () => {
        try { await resetPassword(token, nw.value); if(alive) navigate("/account"); }
        catch(err){ msg.textContent = err.message; }
      });
    });
    return () => { alive = false; };
  }

  const form = $("rsAsk"), contact = $("rsContact");
  form.addEventListener("submit", e => {
    e.preventDefault();
    const msg = form.querySelector(".form-msg"), ok = form.querySelector(".ok-msg"), v = contact.value.trim();
    msg.textContent = ok.textContent = "";
    if(!fieldError(contact, !v ? "Enter your email or mobile number." : /[@a-z]/i.test(v) ? emailProblem(v) : mobileProblem(v))) return;
    busy(form.querySelector("button[type=submit]"), async () => {
      try { const r = await forgotPassword(v); if(alive) ok.textContent = r.message; }
      catch(err){ msg.textContent = err.message; }
    });
  });
  contact.focus({ preventScroll: true });
  return () => { alive = false; };
}
