/* Customer accounts, orders and the contact form: the storefront's connection to the backend.
   Server routes live in server/src/routes/account.js and store.js:
     POST /api/store/auth/register → { session } then /auth/register/verify { session, otp }   (mobile OTP sign-up)
     POST /api/store/auth/login { mobile, password, remember } | logout | logout-everywhere,  GET /api/store/auth/me
     POST /api/store/auth/forgot { mobile } → /auth/forgot/verify { session, otp } → /auth/forgot/reset
     POST /api/store/auth/otp/resend { session, purpose }
     PUT  /api/store/account/profile | password | avatar,  DELETE /api/store/account/avatar
     GET  /api/store/orders/mine?status=&q=&page=,  GET /api/store/orders/mine/:number,  POST /api/store/orders/track
     POST /api/store/orders, POST /api/store/contact
   Sign-in is an HttpOnly cookie the page can't read (so it can't be stolen by a script). Every change also
   sends the CSRF token from the nt_csrf cookie. Only the customer's name/contact is cached here, for display. */

import { BASE_URL } from "./api.js";

// Kept so pages can show demo wording if this is ever switched back to an offline blueprint.
export const MOCK = false;

const CUSTOMER_KEY = "nt_customer";

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode: stay signed in for this visit only */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
store.del("nt_customer_token");   // from the old sign-in, which kept a token in the browser

const readCookie = (name) => {
  const m = document.cookie.split("; ").find((c) => c.startsWith(name + "="));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : "";
};
let csrfPromise = null;
async function csrfToken() {
  const t = readCookie("nt_csrf");
  if (t) return t;
  csrfPromise = csrfPromise || fetch(`${BASE_URL}/store/auth/csrf`, { credentials: "include" }).then((r) => r.json()).then((d) => d.csrf).finally(() => { csrfPromise = null; });
  return (await csrfPromise) || readCookie("nt_csrf");
}

async function request(path, options = {}, retried = false) {
  const method = (options.method || "GET").toUpperCase();
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(method !== "GET" ? { "X-CSRF-Token": await csrfToken() } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error("We couldn't reach our server. Please check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  // CSRF cookie missing or out of date (e.g. cleared): get a fresh one and try once more
  if (res.status === 403 && data.code === "csrf" && !retried) {
    document.cookie = "nt_csrf=; Max-Age=0; Path=/";
    return request(path, options, true);
  }
  if (res.status === 401 && currentCustomer() && !path.startsWith("/store/auth/login")) store.del(CUSTOMER_KEY);   // session ended
  if (!res.ok) {
    const err = new Error(data.message || "Something went wrong. Please try again.");
    Object.assign(err, { field: data.field, status: res.status, code: data.code, data });
    throw err;
  }
  return data;
}

function saveCustomer({ customer }) {
  store.set(CUSTOMER_KEY, JSON.stringify(customer));
  return customer;
}

/** Full address for something the server serves, e.g. a profile photo ("/api/store/avatars/…"). */
export const assetUrl = (path) => (path && path.startsWith("/") ? BASE_URL.replace(/\/api\/?$/, "") + path : path || "");

/** The signed-in customer ({ id, name, contact, email, phone }) or null. Read from the browser, so it's instant. */
export function currentCustomer() {
  try { return JSON.parse(store.get(CUSTOMER_KEY)) || null; } catch { return null; }
}

const send = (method, path, body) => request(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

/* ---------- sign in / sign up ---------- */
export const login = async ({ mobile, password, remember }) => saveCustomer(await send("POST", "/store/auth/login", { mobile, password, remember }));

/** Step 1 of sign-up: returns the OTP session { session, mobile, length, expiresIn, resendIn, resendsLeft, sent }. */
export const register = (data) => send("POST", "/store/auth/register", data);
/** Step 2: the code from the text message. Creates the account and signs in. */
export const verifyRegistration = async (session, otp, remember) => saveCustomer(await send("POST", "/store/auth/register/verify", { session, otp, remember }));
export const resendOtp = (session, purpose) => send("POST", "/store/auth/otp/resend", { session, purpose });

/* ---------- forgotten password ---------- */
export const forgotPassword = (mobile) => send("POST", "/store/auth/forgot", { mobile });
export const verifyResetCode = (session, otp) => send("POST", "/store/auth/forgot/verify", { session, otp });
export const resetPassword = async (session, resetToken, password, confirmPassword) =>
  saveCustomer(await send("POST", "/store/auth/forgot/reset", { session, resetToken, password, confirmPassword }));

/** Signs out on this device (the server ends the session). */
export async function logout() {
  store.del(CUSTOMER_KEY);
  try { await send("POST", "/store/auth/logout"); } catch { /* signed out locally anyway */ }
}

/** Checks the session with the server; forgets the saved name if it's no longer valid. */
export async function refreshCustomer() {
  try {
    const { customer } = await request("/store/auth/me");
    store.set(CUSTOMER_KEY, JSON.stringify(customer));
    return customer;
  } catch (err) {
    if (err.status === 401) { store.del(CUSTOMER_KEY); return null; }
    return currentCustomer();   // server unreachable: keep showing the saved name
  }
}

/* ---------- account ---------- */
export const updateProfile = async (data) => saveCustomer(await send("PUT", "/store/account/profile", data));
/** Signs out other devices; this one gets a fresh session. */
export const changePassword = async (currentPassword, newPassword, confirmPassword) =>
  saveCustomer(await send("PUT", "/store/account/password", { currentPassword, newPassword, confirmPassword }));
export const uploadAvatar = async (image) => saveCustomer(await send("PUT", "/store/account/avatar", { image }));
export const removeAvatar = async () => saveCustomer(await send("DELETE", "/store/account/avatar"));
export async function logoutEverywhere() {
  try { await send("POST", "/store/auth/logout-everywhere"); } finally { store.del(CUSTOMER_KEY); }
}

/* ---------- orders ---------- */
const qs = (p) => { const s = new URLSearchParams(Object.entries(p).filter(([, v]) => v)).toString(); return s ? `?${s}` : ""; };
/** { orders, total, page, pages, counts } — filter: status ("active" | "delivered" | "closed"), q (order number or product), page */
export const myOrders = (params = {}) => request(`/store/orders/mine${qs(params)}`);
export const myOrder = async (number) => (await request(`/store/orders/mine/${encodeURIComponent(number)}`)).order;
export const trackOrder = (order, phone) => send("POST", "/store/orders/track", { order, phone });

/** order = { items:[{productId, qty, size, color}], address:{...}, payment:"upi"|"card"|"cod" } */
export const placeOrder = (order) => request("/store/orders", { method: "POST", body: JSON.stringify(order) });

export const sendContact = (msg) => request("/store/contact", { method: "POST", body: JSON.stringify(msg) });
