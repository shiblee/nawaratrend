/* Sign-in checks. Admin and customer tokens are separate (different "audience"), so a customer
   token can never open the admin API. Admin tokens are re-checked against the database on every
   request, so deactivating an admin or changing their password ends their sessions immediately. */
import jwt from "jsonwebtoken";
import { pool } from "../config/db.js";
import { HttpError } from "../lib/http.js";

const SECRET = () => process.env.JWT_SECRET;

export const signAdminToken = (admin) =>
  jwt.sign({ sub: admin.id, role: admin.role, tv: admin.token_version }, SECRET(), { audience: "admin", expiresIn: "8h" });

export const signCustomerToken = (customer) =>
  jwt.sign({ sub: customer.id }, SECRET(), { audience: "customer", expiresIn: "30d" });

const bearer = (req) => {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
};

export async function requireAdmin(req, res, next) {
  try {
    const token = bearer(req);
    if (!token) throw new HttpError(401, "Please sign in");
    let payload;
    try { payload = jwt.verify(token, SECRET(), { audience: "admin" }); }
    catch { throw new HttpError(401, "Your session has expired. Please sign in again."); }
    const [rows] = await pool.query(
      "SELECT id, name, email, role, is_active, token_version, must_change_password FROM admins WHERE id = ?", [payload.sub]
    );
    const admin = rows[0];
    if (!admin || !admin.is_active || admin.token_version !== payload.tv) {
      throw new HttpError(401, "Your session has ended. Please sign in again.");
    }
    req.admin = admin;
    next();
  } catch (err) { next(err); }
}

/** Use after requireAdmin: only these roles may continue. */
export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.admin?.role) ? next() : next(new HttpError(403, "You don't have permission to do this"));

/** Sets req.customer if a valid customer token was sent; guests continue without one. */
export async function optionalCustomer(req, res, next) {
  try {
    const token = bearer(req);
    if (token) {
      try {
        const { sub } = jwt.verify(token, SECRET(), { audience: "customer" });
        const [rows] = await pool.query("SELECT id, name, email, phone, is_active FROM customers WHERE id = ?", [sub]);
        if (rows[0]?.is_active) req.customer = rows[0];
      } catch { /* bad or expired token: treat as a guest */ }
    }
    next();
  } catch (err) { next(err); }
}

export function requireCustomer(req, res, next) {
  optionalCustomer(req, res, (err) => {
    if (err) return next(err);
    if (!req.customer) return next(new HttpError(401, "Please sign in"));
    next();
  });
}
