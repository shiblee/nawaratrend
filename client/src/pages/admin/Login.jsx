import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAdminAuth } from "../../context/AdminAuthContext.jsx";

export default function Login() {
  const { login, token, admin, loading } = useAdminAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // already signed in (or just signed in): people on a temporary password go straight to choosing their own
  if (!loading && token) return <Navigate to={admin?.must_change_password ? "/admin/profile" : "/admin/dashboard"} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setSubmitting(true);
    try {
      await login(email.trim(), password);   // the redirect above takes over once signed in
    } catch (err) {
      setError(err.message || "Sign-in failed");
      setPassword("");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#15203B] px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F4A300] text-xl font-bold text-[#15203B]">N</span>
          <div>
            <h1 className="text-2xl font-semibold text-white">NawaraTrend Admin</h1>
            <p className="mt-1 text-sm text-slate-400">Sign in to manage your store</p>
          </div>
        </div>

        <form onSubmit={submit} className="rounded-2xl bg-white p-8 shadow-2xl">
          {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Email</span>
            <input type="email" required autoFocus autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-slate-900 outline-none focus:border-[#15203B] focus:ring-2 focus:ring-[#F4A300]/30" />
          </label>
          <label className="mb-6 block">
            <span className="mb-1.5 flex justify-between text-sm font-medium text-slate-700">Password
              <button type="button" onClick={() => setShow(!show)} className="text-xs font-semibold text-slate-500 hover:text-slate-900">{show ? "Hide" : "Show"}</button>
            </span>
            <input type={show ? "text" : "password"} required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-slate-900 outline-none focus:border-[#15203B] focus:ring-2 focus:ring-[#F4A300]/30" />
          </label>
          <button type="submit" disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#15203B] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#22305A] disabled:opacity-60">
            {submitting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
            {submitting ? "Signing in…" : "Sign in"}
          </button>
          <p className="mt-5 text-center text-xs text-slate-500">After 5 wrong passwords the account locks for 15 minutes. Forgot your password? Ask the store owner to reset it.</p>
        </form>
        <p className="mt-6 text-center text-xs text-slate-500"><a href="/" className="hover:text-slate-300">← Back to the store</a></p>
      </div>
    </div>
  );
}
