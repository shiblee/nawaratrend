/* The code-entry boxes used for sign-up and password reset, plus the resend countdown and password helpers.
   One box per digit: typing moves to the next box, Backspace goes back, pasting (or the phone's
   "From Messages" autofill) fills every box at once. */

/** Draws the boxes inside `el`. onComplete(code) runs when the last digit is entered. */
export function mountOtp(el, { length = 6, onComplete } = {}){
  el.innerHTML = `<div class="otp" role="group" aria-label="${length}-digit verification code">${
    Array.from({ length }, (_, i) => `<input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="${i === 0 ? length : 1}"
      ${i === 0 ? 'autocomplete="one-time-code"' : 'autocomplete="off"'} aria-label="Digit ${i + 1} of ${length}">`).join("")}</div>`;
  const boxes = [...el.querySelectorAll("input")];
  const value = () => boxes.map(b => b.value).join("");
  const done = () => { const v = value(); if(v.length === length && /^\d+$/.test(v)) onComplete?.(v); };

  const fill = (from, digits) => {
    digits.split("").slice(0, length - from).forEach((d, i) => { boxes[from + i].value = d; });
    const next = Math.min(from + digits.length, length - 1);
    boxes[next].focus(); boxes[next].select();
    done();
  };

  boxes.forEach((b, i) => {
    b.addEventListener("input", () => {
      const digits = b.value.replace(/\D/g, "");
      b.value = "";
      el.classList.remove("bad");
      if(digits) fill(i, digits); else b.value = "";
    });
    b.addEventListener("keydown", e => {
      if(e.key === "Backspace" && !b.value && i > 0){ e.preventDefault(); boxes[i - 1].value = ""; boxes[i - 1].focus(); }
      else if(e.key === "ArrowLeft" && i > 0){ e.preventDefault(); boxes[i - 1].focus(); }
      else if(e.key === "ArrowRight" && i < length - 1){ e.preventDefault(); boxes[i + 1].focus(); }
      else if(e.key === "Enter"){ done(); }
    });
    b.addEventListener("focus", () => b.select());
    b.addEventListener("paste", e => {
      const digits = (e.clipboardData?.getData("text") || "").replace(/\D/g, "");
      if(!digits) return;
      e.preventDefault();
      el.classList.remove("bad");
      fill(digits.length >= length ? 0 : i, digits);
    });
  });

  return {
    value,
    focus(){ (boxes.find(b => !b.value) || boxes[length - 1]).focus(); },
    clear(){ boxes.forEach(b => { b.value = ""; }); boxes[0].focus(); },
    bad(){ el.classList.remove("bad"); void el.offsetWidth; el.classList.add("bad"); },
    disable(on){ boxes.forEach(b => { b.disabled = on; }); },
  };
}

/** Runs a "Resend code in 0:45" countdown on a button; returns a stop function. */
export function countdown(btn, seconds, { ready = "Resend code", waiting = s => `Resend code in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`, none = false } = {}){
  let left = Math.max(0, Math.round(seconds)), timer = null;
  const paint = () => {
    if(none){ btn.disabled = true; btn.textContent = "No more new codes"; return; }
    btn.disabled = left > 0;
    btn.textContent = left > 0 ? waiting(left) : ready;
  };
  paint();
  if(left > 0 && !none) timer = setInterval(() => { left--; paint(); if(left <= 0) clearInterval(timer); }, 1000);
  return () => clearInterval(timer);
}

/** 0–4 password strength, with a word for it. The server's rule is 8+ characters with a letter and a number. */
export function strength(pw){
  if(!pw) return { score: 0, label: "" };
  let s = 0;
  if(pw.length >= 8) s++;
  if(pw.length >= 12) s++;
  if(/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if(/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  if(pw.length < 8 || !/[a-z]/i.test(pw) || !/\d/.test(pw)) s = Math.min(s, 1);
  return { score: Math.max(1, s), label: ["", "Weak", "Fair", "Good", "Strong"][Math.max(1, s)] };
}

/** Wires a strength meter (<div class="meter" id=…><i></i><span></span></div>) to a password input. */
export function wireMeter(input, meter){
  const bar = meter.querySelector("i"), word = meter.querySelector("span");
  const paint = () => {
    const { score, label } = strength(input.value);
    meter.dataset.score = score;
    bar.style.width = `${score * 25}%`;
    word.textContent = label ? `Password strength: ${label}` : "";
  };
  input.addEventListener("input", paint);
  paint();
}
