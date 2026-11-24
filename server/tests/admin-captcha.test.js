/* Admin sign-in math question. Run: npm test (needs the local MySQL). */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { close, base, solveCaptcha } from "./helpers.js";

after(close);

const ip = () => "10.251.0." + Math.floor(Math.random() * 250 + 1);
const challenge = async () => (await fetch(base + "/admin/auth/captcha")).json();
const login = async (body) => {
  const r = await fetch(base + "/admin/auth/login", { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": ip() }, body: JSON.stringify(body) });
  return { status: r.status, data: await r.json() };
};
const owner = { email: "admin@nawaratrend.com", password: "Admin@123" };

test("the question is small sums and differences, and the reply never holds the answer", async () => {
  const c = await challenge();
  assert.match(c.question, /^\d{1,2} [+−] \d{1,2}$/);
  assert.ok(solveCaptcha(c.question) >= 0);
  assert.ok(!c.token.split(".").includes(String(solveCaptcha(c.question))));
});

test("sign-in needs the right answer, and each question works once", async () => {
  assert.equal((await login(owner)).status, 400);
  const c = await challenge();
  const wrong = await login({ ...owner, captchaToken: c.token, captchaAnswer: solveCaptcha(c.question) + 1 });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.data.field, "captcha");
  assert.equal((await login({ ...owner, captchaToken: c.token, captchaAnswer: solveCaptcha(c.question) })).status, 400, "a used question can't be retried");
  const d = await challenge();
  const ok = await login({ ...owner, captchaToken: d.token, captchaAnswer: String(solveCaptcha(d.question)) });
  assert.equal(ok.status, 200);
  assert.ok(ok.data.token);
  assert.equal((await login({ ...owner, captchaToken: d.token, captchaAnswer: solveCaptcha(d.question) })).status, 400, "no replay after success");
});

test("a tampered token is refused", async () => {
  const c = await challenge();
  const t = c.token.split("."); t[1] = String(Date.now() + 1e9);
  assert.equal((await login({ ...owner, captchaToken: t.join("."), captchaAnswer: solveCaptcha(c.question) })).status, 400);
});
