/* Admin sign-in, own profile and password. */
import express from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { pool } from "../../config/db.js";
import { ah, HttpError, str, EMAIL, password, clientIp } from "../../lib/http.js";
import { audit } from "../../lib/store.js";
import { permissionsFor } from "../../lib/permissions.js";
import { requireAdmin, signAdminToken } from "../../middleware/auth.js";
import { newCaptcha, checkCaptcha } from "../../lib/captcha.js";

const router = express.Router();
const MAX_FAILS = 5, LOCK_MINUTES = 15;
const DUMMY_HASH = bcrypt.hashSync("no-admin-placeholder", 12);

const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10, skipSuccessfulRequests: true, standardHeaders: true, legacyHeaders: false,
  message: { message: "Too many sign-in attempts from this connection. Please wait 15 minutes." },
});

const safe = ({ password: _p, failed_attempts, locked_until, token_version, ...a }) => a;

router.get("/captcha", (req, res) => { res.set("Cache-Control", "no-store"); res.json(newCaptcha()); });

router.post("/login", loginLimit, ah(async (req, res) => {
  checkCaptcha(req.body?.captchaToken, req.body?.captchaAnswer);
  const email = str(req.body?.email, "email", { max: 150 }).toLowerCase();
  const pw = typeof req.body?.password === "string" ? req.body.password : "";
  const [rows] = await pool.query("SELECT * FROM admins WHERE email = ?", [email]);
  const admin = rows[0];
  const fail = new HttpError(401, "Wrong email or password");
  if (!admin) { await bcrypt.compare(pw, DUMMY_HASH); throw fail; }
  if (!admin.is_active) throw new HttpError(403, "This admin account has been disabled");
  if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
    throw new HttpError(429, `Account locked after too many wrong passwords. Try again after ${LOCK_MINUTES} minutes.`);
  }
  if (!(await bcrypt.compare(pw, admin.password))) {
    const fails = admin.failed_attempts + 1;
    await pool.query("UPDATE admins SET failed_attempts = ?, locked_until = ? WHERE id = ?",
      [fails >= MAX_FAILS ? 0 : fails, fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MINUTES * 60000) : null, admin.id]);
    await audit({ ...req, admin: { id: admin.id } }, fails >= MAX_FAILS ? "login.locked" : "login.failed", "admin", admin.id);
    throw fails >= MAX_FAILS ? new HttpError(429, `Too many wrong passwords. The account is locked for ${LOCK_MINUTES} minutes.`) : fail;
  }
  await pool.query("UPDATE admins SET failed_attempts = 0, locked_until = NULL, last_login_at = NOW(), last_login_ip = ? WHERE id = ?", [clientIp(req), admin.id]);
  req.admin = admin;
  await audit(req, "login", "admin", admin.id);
  res.json({ token: signAdminToken(admin), admin: { ...safe(admin), permissions: permissionsFor(admin) } });
}));

router.use(requireAdmin);

router.get("/me", ah(async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM admins WHERE id = ?", [req.admin.id]);
  res.json({ ...safe(rows[0]), permissions: permissionsFor(rows[0]) });
}));

router.put("/profile", ah(async (req, res) => {
  const name = str(req.body?.name, "name", { min: 2, max: 100 });
  const email = str(req.body?.email, "email", { max: 150, pattern: EMAIL, msg: "Enter a valid email" }).toLowerCase();
  const [dupe] = await pool.query("SELECT id FROM admins WHERE email = ? AND id <> ?", [email, req.admin.id]);
  if (dupe.length) throw new HttpError(409, "Another admin already uses this email");
  await pool.query("UPDATE admins SET name = ?, email = ? WHERE id = ?", [name, email, req.admin.id]);
  await audit(req, "profile.update", "admin", req.admin.id, { name, email });
  const [rows] = await pool.query("SELECT * FROM admins WHERE id = ?", [req.admin.id]);
  res.json({ ...safe(rows[0]), permissions: permissionsFor(rows[0]) });
}));

// Changing the password signs out every other session (token_version goes up) and returns a fresh token.
router.put("/password", ah(async (req, res) => {
  const current = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
  const next = password(req.body?.newPassword, "newPassword");
  const [rows] = await pool.query("SELECT * FROM admins WHERE id = ?", [req.admin.id]);
  if (!(await bcrypt.compare(current, rows[0].password))) throw new HttpError(400, "Your current password is wrong", { field: "currentPassword" });
  if (current === next) throw new HttpError(400, "Choose a password different from the current one", { field: "newPassword" });
  await pool.query("UPDATE admins SET password = ?, must_change_password = 0, token_version = token_version + 1 WHERE id = ?",
    [await bcrypt.hash(next, 12), req.admin.id]);
  await audit(req, "password.change", "admin", req.admin.id);
  const [fresh] = await pool.query("SELECT * FROM admins WHERE id = ?", [req.admin.id]);
  res.json({ token: signAdminToken(fresh[0]), admin: { ...safe(fresh[0]), permissions: permissionsFor(fresh[0]) } });
}));

router.post("/logout-everywhere", ah(async (req, res) => {
  await pool.query("UPDATE admins SET token_version = token_version + 1 WHERE id = ?", [req.admin.id]);
  await audit(req, "logout.all", "admin", req.admin.id);
  res.json({ ok: true });
}));

export default router;
