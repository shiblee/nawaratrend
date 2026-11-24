import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAdminAuth } from "../../context/AdminAuthContext.jsx";
import { adminApi } from "../../services/adminApi.js";

const display = { fontFamily: '"Playfair Display", Georgia, serif' };
const body = { fontFamily: '"Onest", "Segoe UI", system-ui, sans-serif' };

const css = `
@keyframes nt-float { 0%,100% { transform: translate(0,0) scale(1) } 50% { transform: translate(24px,-30px) scale(1.08) } }
@keyframes nt-rise { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
@keyframes nt-shake { 10%,90% { transform: translateX(-2px) } 20%,80% { transform: translateX(4px) } 30%,50%,70% { transform: translateX(-7px) } 40%,60% { transform: translateX(7px) } }
@keyframes nt-spin { to { transform: rotate(360deg) } }
@keyframes nt-pop { 0% { transform: scale(.6); opacity: 0 } 70% { transform: scale(1.1) } 100% { transform: scale(1); opacity: 1 } }
@keyframes nt-shine { from { background-position: -200% 0 } to { background-position: 200% 0 } }
.nt-rise { animation: nt-rise .6s cubic-bezier(.2,.7,.2,1) both }
.nt-shake { animation: nt-shake .5s both }
.nt-field { position: relative }
.nt-field input { padding-top: 1.35rem; padding-bottom: .45rem }
.nt-field label { position: absolute; left: 2.75rem; top: 50%; transform: translateY(-50%); transition: all .18s ease; pointer-events: none; color: #94a3b8; font-size: .925rem }
.nt-field input:focus + label, .nt-field input:not(:placeholder-shown) + label { top: .85rem; font-size: .7rem; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: #8a5a2b }
.nt-btn { background: linear-gradient(110deg, #410309 0%, #6b0f18 45%, #8a1a22 50%, #6b0f18 55%, #410309 100%); background-size: 200% 100% }
.nt-btn:not(:disabled):hover { animation: nt-shine 1.6s linear infinite }
@media (prefers-reduced-motion: reduce) { .nt-rise, .nt-shake, .nt-orb, .nt-btn:hover { animation: none !important } }
`;

const Icon = ({ d, className = "h-5 w-5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    {d.map((p, i) => <path key={i} d={p} />)}
  </svg>
);
const icons = {
  mail: ["M4 6h16v12H4z", "m4 7 8 6 8-6"],
  lock: ["M6 11h12v9H6z", "M8.5 11V8a3.5 3.5 0 0 1 7 0v3"],
  eye: ["M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"],
  eyeOff: ["M3 3l18 18", "M10.6 6.1A9.8 9.8 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.8M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7c1.6 0 3-.4 4.3-1", "M9.9 9.9a3 3 0 0 0 4.2 4.2"],
  refresh: ["M20 11a8 8 0 0 0-14.7-4.3L4 8", "M4 4v4h4", "M4 13a8 8 0 0 0 14.7 4.3L20 16", "M20 20v-4h-4"],
  shield: ["M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z", "m9 12 2 2 4-4"],
  check: ["m5 12 5 5 9-10"],
  alert: ["M12 9v4", "M12 17h.01", "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"],
};

export default function Login() {
  const { login, token, admin, loading } = useAdminAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [captcha, setCaptcha] = useState(null);      // { question, token }
  const [captchaLoading, setCaptchaLoading] = useState(true);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [spinKey, setSpinKey] = useState(0);
  const answerRef = useRef(null);
  const passwordRef = useRef(null);

  const loadCaptcha = useCallback(async () => {
    setCaptchaLoading(true); setAnswer("");
    try { setCaptcha(await adminApi.captcha()); }
    catch (err) { setCaptcha(null); setError(err.message); }
    finally { setCaptchaLoading(false); }
  }, []);
  useEffect(() => { loadCaptcha(); }, [loadCaptcha]);

  // already signed in (or just signed in): people on a temporary password go straight to choosing their own
  if (!loading && token) return <Navigate to={admin?.must_change_password ? "/admin/profile" : "/admin/dashboard"} replace />;

  const refresh = () => { setSpinKey((k) => k + 1); loadCaptcha(); answerRef.current?.focus(); };
  const solved = answer.trim() !== "" && /^-?\d+$/.test(answer.trim());

  const submit = async (e) => {
    e.preventDefault();
    if (!captcha) return;
    setError(""); setSubmitting(true);
    try {
      await login(email.trim(), password, { captchaToken: captcha.token, captchaAnswer: answer.trim() });   // the redirect above takes over
    } catch (err) {
      setError(err.message || "Sign-in failed");
      setShake((s) => s + 1);
      if (err.field !== "captcha") { setPassword(""); passwordRef.current?.focus(); } else answerRef.current?.focus();
      loadCaptcha();   // each question works once, so always offer a fresh one
    } finally { setSubmitting(false); }
  };

  const checkCaps = (e) => setCapsLock(e.getModifierState?.("CapsLock") ?? false);
  const year = new Date().getFullYear();
  const inputCls = "peer w-full rounded-2xl border border-slate-200 bg-slate-50/70 pl-11 pr-4 text-slate-900 outline-none transition focus:border-[#B8862F] focus:bg-white focus:ring-4 focus:ring-[#F2C12E]/20";

  return (
    <div style={body} className="relative min-h-screen overflow-hidden bg-[#2a0206] text-slate-800">
      <style>{css}</style>

      {/* soft moving glow behind everything */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="nt-orb absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-[#F2C12E]/20 blur-3xl" style={{ animation: "nt-float 14s ease-in-out infinite" }} />
        <div className="nt-orb absolute -bottom-40 right-[-8rem] h-[32rem] w-[32rem] rounded-full bg-[#8a1a22]/60 blur-3xl" style={{ animation: "nt-float 18s ease-in-out infinite reverse" }} />
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(#F2C12E 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center gap-10 px-4 py-10 lg:flex-row lg:gap-16 lg:px-8">
        {/* brand side */}
        <section className="nt-rise max-w-md text-center lg:flex-1 lg:text-left">
          <img src="/brand/logo-gold.png" alt="Nawara Trend" width="623" height="144" className="mx-auto h-12 w-auto sm:h-14 lg:mx-0" />
          <h1 style={display} className="mt-8 hidden text-5xl font-semibold leading-tight text-white lg:block">
            Welcome back to your <span className="italic text-[#F2C12E]">store</span>.
          </h1>
          <p className="mt-4 hidden text-base leading-relaxed text-[#EBD6CB]/75 lg:block">
            Manage products, orders and customers for Nawara Trend, all in one place.
          </p>
          <ul className="mt-8 hidden space-y-3 text-sm text-[#EBD6CB]/80 lg:block">
            {["Orders and stock at a glance", "Your team, with the right access for each person", "Every sign-in protected and logged"].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#F2C12E]/15 text-[#F2C12E]"><Icon d={icons.check} className="h-3.5 w-3.5" /></span>{t}
              </li>
            ))}
          </ul>
        </section>

        {/* form side */}
        <section className="nt-rise w-full max-w-md lg:flex-1" style={{ animationDelay: ".12s" }}>
          <form key={shake} onSubmit={submit}
            className={`rounded-[1.75rem] border border-white/40 bg-white/95 p-7 shadow-[0_30px_80px_-20px_rgba(0,0,0,.6)] backdrop-blur sm:p-9 ${shake ? "nt-shake" : ""}`}>
            <div className="mb-7">
              <h2 style={display} className="text-3xl font-semibold text-[#410309]">Admin sign in</h2>
              <p className="mt-1.5 text-sm text-slate-500">Enter your details to open the dashboard.</p>
            </div>

            {error && (
              <div role="alert" className="mb-5 flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <Icon d={icons.alert} className="mt-0.5 h-4 w-4 shrink-0" />{error}
              </div>
            )}

            <div className="nt-field mb-4">
              <span className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-slate-400"><Icon d={icons.mail} /></span>
              <input id="email" type="email" required autoFocus autoComplete="username" placeholder=" " value={email}
                onChange={(e) => setEmail(e.target.value)} className={inputCls} />
              <label htmlFor="email">Email address</label>
            </div>

            <div className="nt-field mb-1.5">
              <span className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-slate-400"><Icon d={icons.lock} /></span>
              <input id="password" ref={passwordRef} type={show ? "text" : "password"} required autoComplete="current-password" placeholder=" " value={password}
                onChange={(e) => setPassword(e.target.value)} onKeyUp={checkCaps} onKeyDown={checkCaps} onBlur={() => setCapsLock(false)}
                className={`${inputCls} pr-12`} />
              <label htmlFor="password">Password</label>
              <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-[#410309]">
                <Icon d={show ? icons.eyeOff : icons.eye} />
              </button>
            </div>
            <p className={`mb-3 h-4 text-xs font-medium text-amber-600 transition-opacity ${capsLock ? "opacity-100" : "opacity-0"}`} aria-live="polite">
              {capsLock ? "Caps Lock is on" : ""}
            </p>

            {/* math captcha */}
            <div className="mb-6 rounded-2xl border border-[#F2C12E]/40 bg-gradient-to-br from-[#fff8e6] to-[#fdf1ea] p-4">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#8a5a2b]">
                  <Icon d={icons.shield} className="h-4 w-4" /> Quick check
                </span>
                <button type="button" onClick={refresh} disabled={captchaLoading}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-[#8a5a2b] transition hover:bg-[#F2C12E]/20 disabled:opacity-50">
                  <span key={spinKey} style={spinKey ? { animation: "nt-spin .6s ease" } : undefined}><Icon d={icons.refresh} className="h-3.5 w-3.5" /></span>
                  New question
                </button>
              </div>
              <div className="flex items-center gap-3">
                <div aria-live="polite" style={{ ...display, fontVariantNumeric: "lining-nums tabular-nums" }}
                  className="flex h-12 min-w-[7.5rem] select-none items-center justify-center rounded-xl bg-[#410309] px-4 text-2xl font-semibold tracking-wide text-[#F2C12E] shadow-inner">
                  {captchaLoading ? <span className="h-5 w-5 rounded-full border-2 border-[#F2C12E]/30 border-t-[#F2C12E]" style={{ animation: "nt-spin .8s linear infinite" }} />
                    : captcha ? <span key={captcha.token} style={{ animation: "nt-pop .35s ease both" }}>{captcha.question}</span> : "—"}
                </div>
                <span className="text-2xl font-semibold text-[#410309]">=</span>
                <div className="relative flex-1">
                  <input ref={answerRef} type="text" inputMode="numeric" pattern="-?[0-9]*" maxLength={4} required autoComplete="off"
                    aria-label={captcha ? `What is ${captcha.question}?` : "Security question answer"} placeholder="?"
                    value={answer} onChange={(e) => setAnswer(e.target.value.replace(/[^\d-]/g, ""))}
                    className="h-12 w-full rounded-xl border border-[#F2C12E]/50 bg-white px-4 text-center text-xl font-semibold text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-[#B8862F] focus:ring-4 focus:ring-[#F2C12E]/25" />
                  {solved && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" style={{ animation: "nt-pop .3s ease both" }}><Icon d={icons.check} className="h-4 w-4" /></span>}
                </div>
              </div>
            </div>

            <button type="submit" disabled={submitting || captchaLoading || !captcha}
              className="nt-btn group flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-semibold tracking-wide text-white shadow-lg shadow-[#410309]/30 transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-60">
              {submitting && <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white" style={{ animation: "nt-spin .8s linear infinite" }} />}
              {submitting ? "Signing in…" : "Sign in"}
              {!submitting && <span aria-hidden="true" className="transition group-hover:translate-x-1">→</span>}
            </button>

            <p className="mt-5 text-center text-xs leading-relaxed text-slate-500" style={{ textWrap: "balance" }}>
              After 5 wrong passwords the account locks for 15 minutes. Forgot your password? Ask the store owner to reset it.
            </p>
          </form>

          <div className="mt-6 flex flex-col items-center gap-2 text-xs text-[#EBD6CB]/60">
            <a href="/" className="transition hover:text-[#F2C12E]">← Back to the store</a>
            <p>© {year} Nawara Trend. All rights reserved.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
