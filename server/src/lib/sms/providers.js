/* How text messages leave the server. The rest of the app only calls sendOtpSms(); swapping provider means
   adding an entry here and setting SMS_PROVIDER in .env. API keys live in .env only, never in the database.

     SMS_PROVIDER=renflair   Renflair OTP API (RENFLAIR_API_KEY). Renflair sends its own DLT-approved wording:
                             "<code> is your verification code for <your registered app name>."
     SMS_PROVIDER=log        nothing is sent (default outside production). The code is printed to the server
                             console so you can test locally; this mode refuses to run in production.
     SMS_PROVIDER=memory     automated tests only (NODE_ENV=test): the last code is kept in memory.

   Every provider returns { ok, messageId, response, error } and never throws. */

const TIMEOUT_MS = 15000;

/** Text that is safe to store and show: the API key removed, whitespace squashed, length limited. */
export function scrub(s) {
  let out = String(s ?? "");
  for (const secret of [process.env.RENFLAIR_API_KEY].filter((x) => x && x.length > 3)) out = out.split(secret).join("***");
  return out.replace(/\s+/g, " ").trim().slice(0, 500);
}

/* Renflair: GET https://sms.renflair.in/V1.php?API=<key>&PHONE=<10 digits>&OTP=<code> → JSON.
   Their reply format isn't documented, so we read the common fields and keep the (scrubbed) reply for the log. */
async function renflair({ national, code }) {
  const key = process.env.RENFLAIR_API_KEY;
  if (!key) return { ok: false, error: "RENFLAIR_API_KEY is not set in the server's .env" };
  const url = `https://sms.renflair.in/V1.php?${new URLSearchParams({ API: key, PHONE: national, OTP: code })}`;
  let res, body;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    body = await res.text();
  } catch (err) {
    return { ok: false, error: scrub(err.name === "TimeoutError" ? "The SMS provider didn't answer in time" : `Couldn't reach the SMS provider: ${err.message}`) };
  }
  let data = null;
  try { data = JSON.parse(body); } catch { /* not JSON */ }
  const response = scrub(body) || `HTTP ${res.status}`;
  if (!res.ok) return { ok: false, response, error: `SMS provider error (HTTP ${res.status})` };
  if (data && typeof data === "object") {
    const flag = data.status ?? data.Status ?? data.success ?? data.return ?? data.type;
    const failed = flag === false || flag === 0 || /fail|error|invalid|insufficient|denied/i.test(String(flag ?? ""))
      || (data.error && data.error !== false) || /fail|error|invalid|insufficient/i.test(String(data.message ?? data.msg ?? ""));
    const messageId = data.id ?? data.message_id ?? data.msgid ?? data.request_id ?? data.requestId ?? null;
    if (failed) return { ok: false, response, error: scrub(data.message ?? data.msg ?? data.error ?? "The SMS provider refused the message") };
    return { ok: true, response, messageId: messageId == null ? null : String(messageId).slice(0, 120) };
  }
  // a non-JSON 200: count it as accepted, keep the reply so it can be checked in the log
  return { ok: true, response };
}

let lastTestCode = null;
/** Tests only: the most recent code "sent" by the memory provider. */
export const takeTestCode = () => { const c = lastTestCode; lastTestCode = null; return c; };

const PROVIDERS = {
  renflair: { label: "Renflair", send: renflair },
  log: {
    label: "Not sending: development mode (codes appear in the server console)",
    send: async ({ e164, code }) => {
      console.log(`[sms:log] code for ${e164}: ${code}   (SMS_PROVIDER=log, development only)`);
      return { ok: true, response: "Not sent: development mode (SMS_PROVIDER=log)" };
    },
  },
  memory: {
    label: "Test mode",
    send: async ({ code, national }) => {
      if (national === "6000000000") return { ok: false, error: "Simulated provider failure" };   // tests: SMS gateway down
      lastTestCode = code;
      return { ok: true, response: "Test mode", messageId: `test-${Date.now()}` };
    },
  },
};

export function smsProvider() {
  const prod = process.env.NODE_ENV === "production";
  let kind = process.env.SMS_PROVIDER || (prod ? "renflair" : "log");
  if (kind === "memory" && process.env.NODE_ENV !== "test") kind = "log";
  if (kind === "log" && prod) kind = "renflair";   // never print codes on the live server
  const p = PROVIDERS[kind] || PROVIDERS.renflair;
  return { kind: PROVIDERS[kind] ? kind : "renflair", label: p.label, send: p.send,
    configured: kind !== "renflair" || !!process.env.RENFLAIR_API_KEY };
}
