/* Simple math captcha ("7 + 4 = ?") for the admin sign-in.
   The answer never leaves the server in plain form: the client gets a signed token holding a hash of it,
   and each token works once and only for 5 minutes. */
import crypto from "crypto";
import { HttpError } from "./http.js";

const TTL_MS = 5 * 60 * 1000;
const used = new Map();   // nonce -> expiry, so a solved challenge can't be replayed
const key = () => process.env.JWT_SECRET + ":captcha";
const sign = (data) => crypto.createHmac("sha256", key()).update(data).digest("base64url");
const answerHash = (nonce, answer) => sign(`${nonce}:${answer}`);

export function newCaptcha() {
  const plus = crypto.randomInt(2) === 0;
  let a = crypto.randomInt(1, 13), b = crypto.randomInt(1, 13);
  if (!plus && b > a) [a, b] = [b, a];   // keep answers positive
  const answer = plus ? a + b : a - b;
  const nonce = crypto.randomBytes(12).toString("base64url");
  const exp = Date.now() + TTL_MS;
  const body = `${nonce}.${exp}.${answerHash(nonce, answer)}`;
  return { question: `${a} ${plus ? "+" : "−"} ${b}`, token: `${body}.${sign(body)}` };
}

export function checkCaptcha(token, answer) {
  const bad = new HttpError(400, "The answer to the security question is wrong. Try the new one.", { field: "captcha" });
  const [nonce, exp, hash, mac] = typeof token === "string" ? token.split(".") : [];
  const body = `${nonce}.${exp}.${hash}`;
  if (!mac || mac.length !== 43 || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(sign(body)))) throw bad;
  const now = Date.now();
  for (const [n, e] of used) if (e < now) used.delete(n);
  if (Number(exp) < now) throw new HttpError(400, "The security question expired. Please answer the new one.", { field: "captcha" });
  if (used.has(nonce)) throw bad;
  used.set(nonce, Number(exp));   // one attempt per challenge, right or wrong
  const n = String(answer ?? "").trim();
  if (!/^-?\d{1,3}$/.test(n) || answerHash(nonce, Number(n)) !== hash) throw bad;
}
