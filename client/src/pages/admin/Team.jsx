import { useState } from "react";
import { adminApi } from "../../services/adminApi.js";
import { useAdminAuth } from "../../context/AdminAuthContext.jsx";
import { Alert, Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Table, dateTime, timeAgo, useConfirm, useLoad, useToast } from "../../components/admin/ui.jsx";

const ROLES = {
  owner: ["Owner", "violet", "Everything, including the team and settings"],
  manager: ["Manager", "blue", "Products, categories, orders, customers, settings and the activity log"],
  staff: ["Staff", "gray", "Orders, customers, messages and stock levels"],
};
// a readable temporary password the new member changes at first sign-in
const tempPassword = () => {
  const words = ["Mango", "Lotus", "Tiger", "Kite", "Pearl", "Comet", "Maple", "Coral"];
  const a = new Uint32Array(2); crypto.getRandomValues(a);
  return `${words[a[0] % words.length]}-${1000 + (a[1] % 9000)}`;
};

export default function Team() {
  const { admin } = useAdminAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, error, loading, reload } = useLoad(() => adminApi.getTeam(), []);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: "", email: "", role: "staff", password: "" });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [issued, setIssued] = useState(null);   // { email, password } to show once

  const startAdd = () => { setF({ name: "", email: "", role: "staff", password: tempPassword() }); setErr(""); setAdding(true); };
  const add = async (e) => {
    e?.preventDefault(); setSaving(true); setErr("");
    try { await adminApi.addTeamMember(f); setAdding(false); setIssued({ email: f.email, password: f.password }); reload(); }
    catch (e2) { setErr(e2.message); } finally { setSaving(false); }
  };
  const update = async (m, body, msg) => {
    try { await adminApi.updateTeamMember(m.id, body); toast(msg); reload(); } catch (e) { toast(e.message, "error"); }
  };
  const resetPw = async (m) => {
    if (!(await confirm({ title: `Reset ${m.name}'s password?`, text: "They'll be signed out and must choose a new password with the temporary one you give them.", ok: "Reset password" }))) return;
    const password = tempPassword();
    try { await adminApi.updateTeamMember(m.id, { password }); setIssued({ email: m.email, password }); reload(); } catch (e) { toast(e.message, "error"); }
  };
  const toggle = async (m) => {
    if (m.is_active && !(await confirm({ title: `Disable ${m.name}?`, text: "They'll be signed out straight away and can't sign in until you enable them again.", danger: true, ok: "Disable" }))) return;
    update(m, { is_active: !m.is_active }, m.is_active ? "Access removed" : "Access restored");
  };

  return (
    <div>
      <PageHeader title="Team" sub="Who can use this admin panel, and what each person is allowed to do."
        actions={<Button variant="gold" onClick={startAdd}>+ Add team member</Button>} />
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        {Object.entries(ROLES).map(([k, [l, tone, d]]) => <Card key={k} className="p-4"><Badge tone={tone}>{l}</Badge><p className="mt-2 text-sm text-slate-600">{d}</p></Card>)}
      </div>
      <Alert>{error}</Alert>
      <Card>
        <Table loading={loading && !data} head={["Person", "Role", "Last sign-in", "Status", ""]}>
          {data?.map((m) => {
            const locked = m.locked_until && new Date(m.locked_until) > new Date();
            const me = m.id === admin.id;
            return (
              <tr key={m.id} className="hover:bg-slate-50">
                <td className="px-4 py-3"><div className="font-medium">{m.name}{me && <span className="ml-2 text-xs text-slate-400">(you)</span>}</div><div className="text-xs text-slate-500">{m.email}</div></td>
                <td className="px-4 py-3">
                  {me ? <Badge tone={ROLES[m.role][1]}>{ROLES[m.role][0]}</Badge> : (
                    <Select value={m.role} onChange={(e) => update(m, { role: e.target.value }, `${m.name} is now ${ROLES[e.target.value][0].toLowerCase()}`)} className="!w-32" aria-label={`Role for ${m.name}`}>
                      {Object.entries(ROLES).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
                    </Select>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500"><span title={dateTime(m.last_login_at)}>{timeAgo(m.last_login_at)}</span>{m.last_login_ip && <div className="text-xs text-slate-400">from {m.last_login_ip}</div>}</td>
                <td className="space-x-1 px-4 py-3">
                  {m.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Disabled</Badge>}
                  {locked && <Badge tone="amber">Locked</Badge>}
                  {m.must_change_password && <Badge>Temporary password</Badge>}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  {locked && <Button size="sm" variant="ghost" onClick={() => update(m, { unlock: true }, "Account unlocked")}>Unlock</Button>}
                  {!me && <><Button size="sm" variant="ghost" onClick={() => resetPw(m)}>Reset password</Button>
                    <Button size="sm" variant="ghost" className={m.is_active ? "!text-red-600" : ""} onClick={() => toggle(m)}>{m.is_active ? "Disable" : "Enable"}</Button></>}
                </td>
              </tr>
            );
          })}
        </Table>
      </Card>

      <Modal open={adding} title="Add a team member" onClose={() => setAdding(false)}
        footer={<><Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button><Button loading={saving} onClick={add}>Add</Button></>}>
        <form onSubmit={add} className="space-y-4">
          <Alert>{err}</Alert>
          <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required autoFocus /></Field>
          <Field label="Email" hint="(they sign in with this)"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
          <Field label="Role"><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{Object.entries(ROLES).map(([k, [l, , d]]) => <option key={k} value={k}>{l}: {d}</option>)}</Select></Field>
          <Field label="Temporary password" hint="(they must change it at first sign-in)"><Input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></Field>
        </form>
      </Modal>

      <Modal open={!!issued} title="Share these sign-in details" onClose={() => setIssued(null)} footer={<Button onClick={() => setIssued(null)}>Done</Button>}>
        <p className="text-sm text-slate-600">Send these to the person privately (for example on WhatsApp). The password is shown only now, and they'll be asked to change it when they first sign in.</p>
        <dl className="mt-4 space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Sign-in page</dt><dd className="font-medium">{location.origin}/admin/login</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Email</dt><dd className="font-medium">{issued?.email}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Temporary password</dt><dd className="font-mono font-semibold">{issued?.password}</dd></div>
        </dl>
      </Modal>
    </div>
  );
}
