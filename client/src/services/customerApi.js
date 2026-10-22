/* Customer accounts, orders and the contact form: the storefront's connection to the backend.
   Server routes live in server/src/routes/store.js:
     POST /api/store/auth/register  { name, contact, password }   -> { token, customer }
     POST /api/store/auth/login     { contact, password }         -> { token, customer }
     GET  /api/store/auth/me                                      -> { customer }
     GET  /api/store/orders/mine                                  -> { orders }
     POST /api/store/orders         { items:[{productId, qty, size}], address, payment } -> { orderId, total, ... }
     POST /api/store/contact        { topic, name, contact, order, message }
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

export const myOrders = async () => (await request("/store/orders/mine")).orders;

/** order = { items:[{productId, qty, size}], address:{...}, payment:"upi"|"card"|"cod" } */
export const placeOrder = (order) => request("/store/orders", { method: "POST", body: JSON.stringify(order) });

export const sendContact = (msg) => request("/store/contact", { method: "POST", body: JSON.stringify(msg) });
