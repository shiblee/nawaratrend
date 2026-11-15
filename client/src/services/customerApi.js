/* Customer accounts, orders and the contact form: the storefront's connection to the backend.
   Server routes live in server/src/routes/account.js and store.js:
     POST /api/store/auth/register | login | forgot | reset | logout-everywhere,  GET /api/store/auth/me
     PUT  /api/store/account/profile | password | avatar,  DELETE /api/store/account/avatar
     GET  /api/store/orders/mine?status=&q=&page=,  GET /api/store/orders/mine/:number,  POST /api/store/orders/track
     POST /api/store/orders  { items:[{productId, qty, size}], address, payment } -> { orderId, total, ... }
     POST /api/store/contact { topic, name, contact, order, message }
   `contact` is a mobile number or an email. The server recalculates every price itself. */

import { BASE_URL } from "./api.js";

// Kept so pages can show demo wording if this is ever switched back to an offline blueprint.
export const MOCK = false;

const TOKEN_KEY = "nt_customer_token";
const CUSTOMER_KEY = "nt_customer";

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode: stay signed in for this visit only */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

async function request(path, options = {}) {
  const token = store.get(TOKEN_KEY);
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error("We couldn't reach our server. Please check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) logout();   // expired or revoked session
  if (!res.ok) {
    const err = new Error(data.message || "Something went wrong. Please try again.");
    err.field = data.field;
    err.status = res.status;
    throw err;
  }
  return data;
}

function saveSession({ token, customer }) {
  store.set(TOKEN_KEY, token);
  store.set(CUSTOMER_KEY, JSON.stringify(customer));
  return customer;
}

/** Full address for something the server serves, e.g. a profile photo ("/api/store/avatars/…"). */
export const assetUrl = (path) => (path && path.startsWith("/") ? BASE_URL.replace(/\/api\/?$/, "") + path : path || "");

/** The signed-in customer ({ id, name, contact, email, phone }) or null. Read from the browser, so it's instant. */
export function currentCustomer() {
  try { return JSON.parse(store.get(CUSTOMER_KEY)) || null; } catch { return null; }
}

export const login = async ({ contact, password }) =>
  saveSession(await request("/store/auth/login", { method: "POST", body: JSON.stringify({ contact, password }) }));

export const register = async ({ name, contact, password }) =>
  saveSession(await request("/store/auth/register", { method: "POST", body: JSON.stringify({ name, contact, password }) }));

export function logout() {
  store.del(TOKEN_KEY);
  store.del(CUSTOMER_KEY);
}

/** Checks the saved session with the server; signs out locally if it's no longer valid. */
export async function refreshCustomer() {
  if (!store.get(TOKEN_KEY)) return null;
  try {
    const { customer } = await request("/store/auth/me");
    store.set(CUSTOMER_KEY, JSON.stringify(customer));
    return customer;
  } catch (err) {
    if (err.status === 401) return null;
    return currentCustomer();   // server unreachable: keep showing the saved name
  }
}

const send = (method, path, body) => request(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
const keepCustomer = (data) => { if (data.token) saveSession(data); else store.set(CUSTOMER_KEY, JSON.stringify(data.customer)); return data.customer; };

/* ---------- account ---------- */
export const updateProfile = async (data) => keepCustomer(await send("PUT", "/store/account/profile", data));
/** Signs out other devices; this one gets a fresh session. */
export const changePassword = async (currentPassword, newPassword) => keepCustomer(await send("PUT", "/store/account/password", { currentPassword, newPassword }));
export const uploadAvatar = async (image) => keepCustomer(await send("PUT", "/store/account/avatar", { image }));
export const removeAvatar = async () => keepCustomer(await send("DELETE", "/store/account/avatar"));
export async function logoutEverywhere() {
  try { await send("POST", "/store/auth/logout-everywhere"); } finally { logout(); }
}
export const forgotPassword = (contact) => send("POST", "/store/auth/forgot", { contact });
export const resetPassword = async (token, password) => saveSession(await send("POST", "/store/auth/reset", { token, password }));

/* ---------- orders ---------- */
const qs = (p) => { const s = new URLSearchParams(Object.entries(p).filter(([, v]) => v)).toString(); return s ? `?${s}` : ""; };
/** { orders, total, page, pages, counts } — filter: status ("active" | "delivered" | "closed"), q (order number or product), page */
export const myOrders = (params = {}) => request(`/store/orders/mine${qs(params)}`);
export const myOrder = async (number) => (await request(`/store/orders/mine/${encodeURIComponent(number)}`)).order;
export const trackOrder = (order, phone) => send("POST", "/store/orders/track", { order, phone });

/** order = { items:[{productId, qty, size}], address:{...}, payment:"upi"|"card"|"cod" } */
export const placeOrder = (order) => request("/store/orders", { method: "POST", body: JSON.stringify(order) });

export const sendContact = (msg) => request("/store/contact", { method: "POST", body: JSON.stringify(msg) });
