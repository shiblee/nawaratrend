import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminAuth } from "../../context/AdminAuthContext.jsx";
import { adminApi } from "../../services/adminApi.js";
import { Alert, Button, Card, CardHeader, Field, Input, PageHeader, dateTime, initials, useConfirm, useToast } from "../../components/admin/ui.jsx";

const ROLE = { owner: "Owner", manager: "Manager", staff: "Staff" };
const checks = (p) => [["At least 8 characters", p.length >= 8], ["A letter", /[a-z]/i.test(p)], ["A number", /\d/.test(p)]];

export default function Profile() {
  const { admin, setAdmin, setSessionToken, logout } = useAdminAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [p, setP] = useState({ name: "", email: "" });
  const [pw, setPw] = useState({ current: "", next: "", again: "" });
  const [msg, setMsg] = useState({ profile: "", password: "" });
  const [busy, setBusy] = useState("");
  useEffect(() => { if (admin) setP({ name: admin.name, email: admin.email }); }, [admin]);

  const saveProfile = async (e) => {
    e.preventDefault(); setBusy("profile"); setMsg({ ...msg, profile: "" });
    try { setAdmin(await adminApi.updateProfile(p)); toast("Profile saved"); }
    catch (e2) { setMsg({ ...msg, profile: e2.message }); } finally { setBusy(""); }
  };
  const savePassword = async (e) => {
    e.preventDefault(); setMsg({ ...msg, password: "" });
    if (pw.next !== pw.again) return setMsg({ ...msg, password: "The two new passwords don't match." });
    setBusy("password");
    try {
      const { token, admin: a } = await adminApi.changePassword({ currentPassword: pw.current, newPassword: pw.next });
      setSessionToken(token); setAdmin(a); setPw({ current: "", next: "", again: "" });
      toast("Password changed. Other devices have been signed out.");
    } catch (e2) { setMsg({ ...msg, password: e2.message }); } finally { setBusy(""); }
  };
  const everywhere = async () => {
    if (!(await confirm({ title: "Sign out everywhere?", text: "Every device signed in to your account, including this one, will be signed out.", ok: "Sign out everywhere" }))) return;
    try { await adminApi.logoutEverywhere(); } finally { logout(); navigate("/admin/login", { replace: true }); }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="My profile" sub="Your own details and password." />
      {admin?.must_change_password && <Alert type="warn"><b>Please choose your own password.</b> You're signed in with a temporary one.</Alert>}

      <Card>
        <div className="flex items-center gap-4 p-5">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F4A300] text-lg font-semibold text-[#15203B]">{initials(admin?.name)}</span>
          <div className="text-sm">
            <div className="text-base font-semibold">{admin?.name}</div>
            <div className="text-slate-500">{ROLE[admin?.role]} · {admin?.email}</div>
            <div className="text-xs text-slate-400">Last sign-in {dateTime(admin?.last_login_at)}{admin?.last_login_ip ? ` from ${admin.last_login_ip}` : ""}</div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Details" />
        <form onSubmit={saveProfile} className="space-y-4 p-5">
          <Alert>{msg.profile}</Alert>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><Input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} required /></Field>
            <Field label="Email" hint="(used to sign in)"><Input type="email" value={p.email} onChange={(e) => setP({ ...p, email: e.target.value })} required /></Field>
          </div>
          <Button loading={busy === "profile"}>Save details</Button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Change password" sub="Changing it signs you out on every other device." />
        <form onSubmit={savePassword} className="space-y-4 p-5">
          <Alert>{msg.password}</Alert>
          <Field label="Current password"><Input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="New password"><Input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required /></Field>
            <Field label="New password again"><Input type="password" autoComplete="new-password" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} required /></Field>
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {checks(pw.next).map(([l, ok]) => <li key={l} className={ok ? "text-emerald-700" : "text-slate-400"}>{ok ? "✓" : "○"} {l}</li>)}
          </ul>
          <Button loading={busy === "password"} disabled={!checks(pw.next).every(([, ok]) => ok)}>Change password</Button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Security" />
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm">
          <p className="text-slate-600">Lost a phone or used a shared computer? Sign out of every session at once.</p>
          <Button variant="outline" onClick={everywhere}>Sign out everywhere</Button>
        </div>
      </Card>
    </div>
  );
}
