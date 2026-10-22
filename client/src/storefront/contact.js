/* Contact page: copy buttons and the contact form (saved to the database, read in the admin panel). Returns a cleanup function. */
import { sendContact } from "../services/customerApi.js";
const $ = id => document.getElementById(id);

export function initContact(){
  let alive = true;
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };

  /* ---------- Copy buttons ---------- */
  document.querySelectorAll("[data-copy]").forEach(b => b.addEventListener("click", () => {
    const done = () => { b.textContent = "Copied ✓"; later(() => b.textContent = "Copy", 1600); };
    if(navigator.clipboard) navigator.clipboard.writeText(b.dataset.copy).then(done).catch(() => b.previousElementSibling && getSelection().selectAllChildren(b.previousElementSibling));
    else getSelection().selectAllChildren(b.previousElementSibling);
  }));

  /* ---------- Contact form: smart validation ---------- */
  const form = $("contactForm"), out = $("cMsgOut"), send = $("cSend"), of = $("orderField");
  const MAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
  // Indian mobile: optional +91 / 91 / 0, then 10 digits starting 6-9
  const mobileDigits = v => { let d = v.replace(/[^\d]/g,""); if(d.length===12 && d.startsWith("91")) d = d.slice(2); else if(d.length===11 && d.startsWith("0")) d = d.slice(1); return d; };
  const fmtMobile = d => `+91 ${d.slice(0,5)} ${d.slice(5)}`;
  const looksMail = v => /[@a-z]/i.test(v);

  const rules = {
    name: v => {
      v = v.trim();
      if(!v) return "Please enter your name.";
      if(v.length < 2) return "Name looks too short.";
      if(!/^[\p{L} .'-]+$/u.test(v)) return "Use letters only, without numbers or symbols.";
      return "";
    },
    contact: v => {
      v = v.trim();
      if(!v) return "Add a mobile number or email so we can reply.";
      if(looksMail(v)){
        if(!v.includes("@")) return "That doesn't look like an email. It needs an @.";
        if(!MAIL.test(v)) return "Check the email address, for example name@gmail.com.";
        return "";
      }
      const d = mobileDigits(v);
      if(d.length < 10) return `Mobile number needs 10 digits. You've entered ${d.length}.`;
      if(d.length > 10) return "Mobile number has too many digits.";
      if(!/^[6-9]/.test(d)) return "Indian mobile numbers start with 6, 7, 8 or 9.";
      return "";
    },
    order: v => {
      v = v.trim().replace(/^#/,"");
      if(!v) return "";
      if(!/^[A-Za-z0-9-]{3,12}$/.test(v)) return "Order numbers use letters and digits only, like 10245.";
      return "";
    },
    msg: v => {
      v = v.trim();
      if(!v) return "Tell us how we can help.";
      if(v.length < 10) return `A little more detail please. At least 10 characters (${v.length} so far).`;
      return "";
    }
  };
  const map = {name:"cName", contact:"cContact", order:"cOrder", msg:"cMsg"};
  const touched = new Set();

  function check(key, show){
    const el = $(map[key]), field = el.closest(".field"), msg = rules[key](el.value);
    const optionalEmpty = key==="order" && !el.value.trim();
    if(show){
      field.classList.toggle("invalid", !!msg);
      field.classList.toggle("valid", !msg && !optionalEmpty);
      field.querySelector(".f-err span").textContent = msg;
      el.setAttribute("aria-invalid", !!msg);
      if(out.textContent){ // keep the summary banner in step with the fields
        const n = form.querySelectorAll(".field.invalid").length;
        out.textContent = n === 0 ? "" : n === 1 ? "Please fix the highlighted field." : `Please fix the ${n} highlighted fields.`;
      }
    }
    return !msg;
  }

  // phone or email: show what we detected
  const kind = $("cKind");
  function detect(){
    const v = $("cContact").value.trim();
    if(!v){ kind.hidden = true; return; }
    const mail = looksMail(v);
    kind.hidden = false;
    kind.textContent = mail ? "Email" : "Mobile";
    kind.classList.toggle("mail", mail);
  }

  Object.entries(map).forEach(([key,id]) => {
    const el = $(id);
    el.addEventListener("blur", () => {
      if(!el.value.trim() && key!=="order" && !touched.has(key)) return; // don't nag on an untouched empty field
      touched.add(key);
      if(key==="contact" && !looksMail(el.value) && check("contact", false)) el.value = fmtMobile(mobileDigits(el.value));
      if(key==="contact" && looksMail(el.value)) el.value = el.value.trim().toLowerCase();
      if(key==="name") el.value = el.value.trim().replace(/\s+/g," ").replace(/\b\p{L}/gu, c => c.toUpperCase());
      check(key, true);
    });
    el.addEventListener("input", () => {
      if(key==="contact") detect();
      if(key==="msg") counter();
      if(touched.has(key)) check(key, true);
      else if(rules[key](el.value)==="" && el.value.trim()) el.closest(".field").classList.add("valid");
      else el.closest(".field").classList.remove("valid");
    });
  });

  const cnt = $("cCount");
  function counter(){
    const n = $("cMsg").value.length;
    cnt.textContent = `${n} / 500`;
    cnt.classList.toggle("warn", n > 450);
    cnt.classList.toggle("good", n >= 10 && n <= 450);
  }

  document.querySelectorAll('input[name="topic"]').forEach(r => r.addEventListener("change", () => {
    of.hidden = !["order","return"].includes(r.value);
    if(of.hidden){ $("cOrder").value = ""; of.classList.remove("invalid","valid"); }
  }));

  form.addEventListener("submit", e => {
    e.preventDefault();
    if(send.classList.contains("loading")) return;
    const keys = ["name","contact"].concat(of.hidden ? [] : ["order"]).concat(["msg"]);
    keys.forEach(k => touched.add(k));
    const bad = keys.filter(k => !check(k, true));
    if(bad.length){
      out.textContent = bad.length === 1 ? "Please fix the highlighted field." : `Please fix the ${bad.length} highlighted fields.`;
      const first = $(map[bad[0]]); first.focus();
      const box = first.closest(".box"); box.classList.remove("shake"); void box.offsetWidth; box.classList.add("shake");
      return;
    }
    out.textContent = "";
    send.classList.add("loading"); send.querySelector(".lbl").textContent = "Sending…";
    const topicVal = document.querySelector('input[name="topic"]:checked').value;
    const orderVal = of.hidden ? "" : $("cOrder").value.trim();
    sendContact({ topic: topicVal, name: $("cName").value.trim(), contact: $("cContact").value.trim(), order: orderVal || undefined, message: $("cMsg").value.trim() })
      .then(() => {
        if(!alive) return;
        const name = $("cName").value.trim().split(" ")[0];
        const topic = document.querySelector('input[name="topic"]:checked + span').textContent;
        const c = $("cContact").value.trim(), viaMail = looksMail(c);
        const order = orderVal.replace(/^#/,"");
        $("cDoneTitle").textContent = `Thanks, ${name}!`;
        $("cDoneText").textContent = `We've received your message and will reply ${viaMail ? "by email" : "on your mobile"} soon.`;
        const rows = [["Topic", topic], [viaMail ? "Email" : "Mobile", c]].concat(order ? [["Order", "#" + order]] : []);
        const sum = $("cDoneSum"); sum.textContent = "";
        rows.forEach(([k,v]) => {
          const row = document.createElement("div"), a = document.createElement("span"), b = document.createElement("b");
          a.textContent = k; b.textContent = v; row.append(a, b); sum.appendChild(row);
        });
        form.hidden = true; $("cDone").hidden = false; $("cDone").focus();
      })
      .catch(err => { if(alive) out.textContent = err.message; })
      .finally(() => { if(alive){ send.classList.remove("loading"); send.querySelector(".lbl").textContent = "Send message →"; } });
  });

  $("cAgain").onclick = () => {
    form.reset(); touched.clear(); of.hidden = false; kind.hidden = true; counter();
    form.querySelectorAll(".field").forEach(f => f.classList.remove("valid","invalid"));
    $("cDone").hidden = true; form.hidden = false; $("cName").focus();
  };

  return () => { alive = false; timers.forEach(clearTimeout); };
}
