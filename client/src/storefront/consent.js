/* Cookie consent: a banner with "Accept all", "Reject non-essential" and "Customise", and a
   preferences window (also opened from "Cookie settings" in the footer).
   Necessary storage (cart, wishlist, sign-in, this choice) is always on. Analytics (Google Analytics,
   if an ID is set on the admin SEO page) and marketing load only after the visitor agrees.
   The choice is kept for 6 months in localStorage and in a first-party cookie. */

const KEY = "nt_consent";
const VERSION = 1;               // bump to ask everyone again (e.g. after adding a new kind of cookie)
const MAX_AGE_DAYS = 180;

export function getConsent() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY));
    if (!c || c.v !== VERSION || Date.now() - c.at > MAX_AGE_DAYS * 864e5) return null;
    return c;
  } catch { return null; }
}

function saveConsent(analytics, marketing) {
  const c = { v: VERSION, necessary: true, analytics: !!analytics, marketing: !!marketing, at: Date.now() };
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* private mode: ask again next visit */ }
  document.cookie = `${KEY}=a${+c.analytics}m${+c.marketing}; Max-Age=${MAX_AGE_DAYS * 86400}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  applyConsent(c);
  return c;
}

/* ---------- Google Analytics 4 (only with analytics consent) ---------- */
let gaId = "", gaLoaded = false;
const gtag = (...args) => { window.dataLayer = window.dataLayer || []; window.dataLayer.push(args); };

function applyConsent(c) {
  // Google consent mode: everything denied until the visitor chooses
  gtag("consent", gaLoaded ? "update" : "default", {
    analytics_storage: c?.analytics ? "granted" : "denied",
    ad_storage: c?.marketing ? "granted" : "denied",
    ad_user_data: c?.marketing ? "granted" : "denied",
    ad_personalization: c?.marketing ? "granted" : "denied",
  });
  if (c?.analytics && gaId && !gaLoaded) {
    gaLoaded = true;
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
    document.head.appendChild(s);
    gtag("js", new Date());
    gtag("config", gaId, { send_page_view: false, anonymize_ip: true });
  }
}

/** Called after every page change: remembers the GA ID and reports the page view if allowed. */
export function trackPage(id, path, title) {
  if (id && id !== gaId) { gaId = id; applyConsent(getConsent()); }
  if (gaLoaded && getConsent()?.analytics) gtag("event", "page_view", { page_path: path, page_title: title, page_location: location.href });
}

/* ---------- banner + preferences ---------- */
export function initConsent() {
  const $ = (id) => document.getElementById(id);
  const banner = $("ckBanner"), prefs = $("ckPrefs");
  if (!banner || !prefs) return () => {};
  const ac = new AbortController();

  const close = () => { banner.hidden = true; prefs.hidden = true; document.body.classList.remove("ck-open"); };
  const decide = (a, m) => { saveConsent(a, m); close(); };
  const openPrefs = () => {
    const c = getConsent();
    $("ckAnalytics").checked = !!c?.analytics;
    $("ckMarketing").checked = !!c?.marketing;
    prefs.hidden = false; document.body.classList.add("ck-open");
    $("ckSave").focus();
  };

  banner.hidden = !!getConsent();
  $("ckAccept").onclick = () => decide(true, true);
  $("ckReject").onclick = () => decide(false, false);
  $("ckCustom").onclick = openPrefs;
  $("ckSave").onclick = () => decide($("ckAnalytics").checked, $("ckMarketing").checked);
  $("ckAcceptAll").onclick = () => decide(true, true);
  $("ckRejectAll").onclick = () => decide(false, false);
  $("ckClose").onclick = () => { prefs.hidden = true; document.body.classList.remove("ck-open"); };
  prefs.addEventListener("click", (e) => { if (e.target === prefs) $("ckClose").click(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !prefs.hidden) $("ckClose").click(); }, { signal: ac.signal });
  document.querySelectorAll("[data-cookie-settings]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); openPrefs(); }));

  applyConsent(getConsent());
  return () => { ac.abort(); document.body.classList.remove("ck-open"); };
}
