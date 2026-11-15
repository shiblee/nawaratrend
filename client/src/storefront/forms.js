/* Small form helpers shared by the account, password reset and order tracking pages. */

/** Shows (or clears, with "") the error under a field; returns true when there's no error. */
export function fieldError(input, msg){
  const fld = input.closest(".fld");
  fld.classList.toggle("invalid", !!msg);
  fld.querySelector(".err").textContent = msg || "";
  input.setAttribute("aria-invalid", !!msg);
  return !msg;
}

/** "Show" / "Hide" buttons inside password boxes (<div class="pw"><input …><button class="pw-show" aria-controls="id">). */
export function wirePasswordToggles(root){
  root.querySelectorAll(".pw-show").forEach(b => b.addEventListener("click", () => {
    const input = root.querySelector("#" + b.getAttribute("aria-controls")), show = input.type === "password";
    input.type = show ? "text" : "password";
    b.textContent = show ? "Hide" : "Show"; b.setAttribute("aria-pressed", show);
  }));
}

/** Runs `fn` with the button in its loading state; returns false if it was already busy. */
export async function busy(btn, fn){
  if(btn.classList.contains("loading")) return false;
  btn.classList.add("loading");
  try { await fn(); } finally { btn.classList.remove("loading"); }
  return true;
}

export const passwordProblem = v => v.length < 8 || !/[a-z]/i.test(v) || !/\d/.test(v) ? "Use at least 8 characters, with a letter and a number." : "";
export const emailProblem = v => v && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v) ? "Check the email address, for example name@gmail.com." : "";
export const mobileDigits = v => { let d = String(v || "").replace(/\D/g, ""); if(d.length === 12 && d.startsWith("91")) d = d.slice(2); else if(d.length === 11 && d.startsWith("0")) d = d.slice(1); return d; };
export const mobileProblem = v => v && !/^[6-9]\d{9}$/.test(mobileDigits(v)) ? "Enter a 10-digit mobile number." : "";

/** A password field with a Show button, as HTML. */
export const passwordField = (id, label, autocomplete, hint = "") =>
  `<div class="fld"><label for="${id}">${label}${hint ? ` <small>${hint}</small>` : ""}</label><div class="pw"><input id="${id}" type="password" autocomplete="${autocomplete}" maxlength="128"><button type="button" class="pw-show" aria-controls="${id}" aria-pressed="false">Show</button></div><p class="err"></p></div>`;
