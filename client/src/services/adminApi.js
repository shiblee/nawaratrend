/* Admin panel ↔ server. Every call sends the admin's token; if the server says the session has
   ended (expired, password changed, account disabled), the panel signs out automatically. */
import { BASE_URL } from "./api.js";

const TOKEN_KEY = "admin_token";
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

const qs = (params = {}) => {
  const s = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== "" && v != null))).toString();
  return s ? `?${s}` : "";
};

async function request(path, options = {}) {
  const token = getToken();
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
    });
  } catch {
    throw new Error("Can't reach the server. Is it running? (cd server && npm run dev)");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token && !path.startsWith("/admin/auth/login")) {
    setToken(null);
    window.dispatchEvent(new Event("admin:signed-out"));
  }
  if (!res.ok) {
    const err = new Error(data.message || "Something went wrong");
    err.status = res.status;
    err.field = data.field;
    throw err;
  }
  return data;
}

const send = (method, path, body) => request(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export const adminApi = {
  // session + own account
  login: (email, password) => send("POST", "/admin/auth/login", { email, password }),
  me: () => request("/admin/auth/me"),
  updateProfile: (data) => send("PUT", "/admin/auth/profile", data),
  changePassword: (data) => send("PUT", "/admin/auth/password", data),
  logoutEverywhere: () => send("POST", "/admin/auth/logout-everywhere"),

  getDashboard: () => request("/admin/dashboard"),

  getProducts: (p) => request(`/admin/products${qs(p)}`),
  getProduct: (id) => request(`/admin/products/${id}`),
  createProduct: (d) => send("POST", "/admin/products", d),
  updateProduct: (id, d) => send("PUT", `/admin/products/${id}`, d),
  updateStock: (id, stock) => send("PATCH", `/admin/products/${id}/stock`, { stock }),
  deleteProduct: (id) => send("DELETE", `/admin/products/${id}`),

  getCategories: () => request("/admin/categories"),
  createCategory: (d) => send("POST", "/admin/categories", d),
  updateCategory: (id, d) => send("PUT", `/admin/categories/${id}`, d),
  deleteCategory: (id) => send("DELETE", `/admin/categories/${id}`),

  getOrders: (p) => request(`/admin/orders${qs(p)}`),
  getOrder: (id) => request(`/admin/orders/${id}`),
  updateOrder: (id, d) => send("PATCH", `/admin/orders/${id}`, d),
  /** Downloads the filtered orders as a CSV file (the token can't go in a plain link, so fetch it). */
  async exportOrders(p) {
    const res = await fetch(`${BASE_URL}/admin/orders/export.csv${qs(p)}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) throw new Error("Export failed");
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement("a"), { href: url, download: `orders-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  getCustomers: (p) => request(`/admin/customers${qs(p)}`),
  getCustomer: (id) => request(`/admin/customers/${id}`),
  updateCustomer: (id, d) => send("PATCH", `/admin/customers/${id}`, d),

  getMessages: (p) => request(`/admin/messages${qs(p)}`),
  updateMessage: (id, status) => send("PATCH", `/admin/messages/${id}`, { status }),
  deleteMessage: (id) => send("DELETE", `/admin/messages/${id}`),

  getTeam: () => request("/admin/team"),
  addTeamMember: (d) => send("POST", "/admin/team", d),
  updateTeamMember: (id, d) => send("PATCH", `/admin/team/${id}`, d),

  getAudit: (p) => request(`/admin/audit${qs(p)}`),

  getSeo: () => request("/admin/seo"),
  updateSeoSettings: (d) => send("PUT", "/admin/seo/settings", d),
  updateSeoPage: (key, d) => send("PUT", `/admin/seo/pages/${key}`, d),
  updateSeoProduct: (id, d) => send("PUT", `/admin/seo/products/${id}`, d),

  getSettings: () => request("/admin/settings"),
  updateSettings: (d) => send("PUT", "/admin/settings", d),
};
