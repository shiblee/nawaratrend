/* "Sign in with Google": checks the ID token that Google's button gives the browser, and hands out a short-lived
   signed ticket so the customer can finish by confirming their mobile number.
   Needs GOOGLE_CLIENT_ID (from Google Cloud Console → APIs & Services → Credentials → OAuth client ID, type "Web").
   Tokens are checked with Google's tokeninfo endpoint, so no extra libraries are needed. */
import crypto from "crypto";
import { HttpError } from "./http.js";

export const googleClientId = () => (process.env.GOOGLE_CLIENT_ID || "").trim();
const TOKENINFO = () => process.env.GOOGLE_TOKENINFO_URL || "https://oauth2.googleapis.com/tokeninfo";
const TICKET_MINUTES = 15;

/** Returns { sub, email, emailVerified, name, picture } for a genuine, unexpired token issued for this site. */
export async function verifyGoogleCredential(credential) {
  const clientId = googleClientId();
  if (!clientId) throw new HttpError(503, "Google sign-in isn't available right now. Please use your mobile number.", { code: "google_disabled" });
  if (typeof credential !== "string" || credential.length < 20 || credential.length > 4096) throw new HttpError(400, "Google sign-in failed. Please try again.", { code: "google_invalid" });
  let info;
  try {
    const r = await fetch(`${TOKENINFO()}?id_token=${encodeURIComponent(credential)}`, { signal: AbortSignal.timeout(8000) });
    info = r.ok ? await r.json() : null;
  } catch {
    throw new HttpError(502, "We couldn't reach Google just now. Please try again, or use your mobile number.", { code: "google_unreachable" });
  }
  const ok = info && info.aud === clientId && ["accounts.google.com", "https://accounts.google.com"].includes(info.iss)
    && Number(info.exp) * 1000 > Date.now() && /^\d{1,64}$/.test(String(info.sub || ""));
  if (!ok) throw new HttpError(401, "Google sign-in failed. Please try again.", { code: "google_invalid" });
  const emailVerified = info.email_verified === true || info.email_verified === "true";
  return {
    sub: String(info.sub),
    email: emailVerified && info.email ? String(info.email).toLowerCase().slice(0, 150) : null,
    emailVerified,
    name: String(info.name || info.given_name || "").trim().slice(0, 100),
  };
}

/* The ticket proves "Google confirmed this person" between the Google step and the mobile code step. */
const sign = (data) => crypto.createHmac("sha256", `${process.env.JWT_SECRET}:google-ticket`).update(data).digest("base64url");

export function googleTicket(g) {
  const body = Buffer.from(JSON.stringify({ ...g, exp: Date.now() + TICKET_MINUTES * 60000 })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function readGoogleTicket(ticket) {
  const expired = new HttpError(410, "Your Google sign-in timed out. Please tap \"Continue with Google\" again.", { code: "google_ticket_expired" });
  const [body, mac] = typeof ticket === "string" ? ticket.split(".") : [];
  if (!body || !mac || mac.length !== 43 || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(sign(body)))) throw expired;
  const g = JSON.parse(Buffer.from(body, "base64url").toString());
  if (!(g.exp > Date.now())) throw expired;
  return g;
}
