/* Communication → OTP / SMS settings, and Delivery logs (email + SMS/OTP).
   Codes are never stored, so nobody can see or retrieve one here. Mobile numbers are masked unless the
   admin's role has the logs.pii permission (server/src/lib/permissions.js). */
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { adminApi } from "../../services/adminApi.js";
import { useAdminAuth } from "../../context/AdminAuthContext.jsx";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Modal, PageHeader, Pager, SearchBox, Select, SmsBadge, Stat, Table, Tabs, Toggle,
  dateTime, num, phone, timeAgo, useDebounced, useLoad, useToast, OTP_PURPOSE, VERIFY_TONE } from "../../components/admin/ui.jsx";
import { Log as EmailLog } from "./Emails.jsx";

/* ---------- OTP / SMS settings ---------- */
const FIELDS = [
  ["length", "Code length", "digits"],
  ["expiry_minutes", "Code expires after", "minutes"],
  ["resend_seconds", "Wait before a new code", "seconds"],
  ["max_attempts", "Wrong tries allowed per code", "tries"],
  ["max_resends", "New codes per verification", "resends"],
  ["phone_hourly_limit", "Codes per mobile number per hour", "codes"],
  ["ip_hourly_limit", "Verifications per connection per hour", "requests"],
  ["pending_hours", "Unfinished sign-ups expire after", "hours"],
];

export function OtpSettings() {
  const toast = useToast();
  const { allowed } = useAdminAuth();
  const { data, error, reload } = useLoad(() => adminApi.getOtpSettings(), []);
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  useEffect(() => { if (data) setF(Object.fromEntries([...FIELDS.map(([k]) => [k, data[k]]), ["enabled", data.enabled], ["log_retention_days", data.log_retention_days]])); }, [data]);
  if (error && !f) return <Alert>{error}</Alert>;
  if (!f) return <div className="h-64 animate-pulse rounded-2xl bg-slate-200/60" />;
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });

  const save = async (e) => {
    e.preventDefault(); setSaving(true); setErr("");
    try {
      const body = { ...f };
      for (const [k] of FIELDS) body[k] = Number(body[k]);
      body.log_retention_days = Number(body.log_retention_days);
      await adminApi.updateOtpSettings(body); toast("OTP settings saved"); reload();
    } catch (e2) { setErr(e2.message); } finally { setSaving(false); }
  };
  const test = async () => {
    setTesting(true);
    try {
      const r = await adminApi.sendTestSms(testTo);
      toast(r.status === "sent" ? "Test message sent. Check the phone." : `Not sent: ${r.failure_reason || r.status}`, r.status === "sent" ? "ok" : "error");
    } catch (e2) { toast(e2.message, "error"); } finally { setTesting(false); }
  };
  const rate = data.last30.sessions ? Math.round((data.last30.verified / data.last30.sessions) * 100) : 0;

  return (
    <form onSubmit={save}>
      <PageHeader title="OTP / SMS settings" sub="How mobile numbers are verified at sign-up and password reset."
        actions={<Link to="/admin/communication/logs?tab=sms"><Button type="button" variant="outline" size="sm">SMS / OTP log →</Button></Link>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Stat label="Text messages, 30 days" value={num(data.last30.sms)} />
        <Stat label="Accepted by provider" value={num(data.last30.sent)} tone="green" />
        <Stat label="Failed" value={num(data.last30.failed)} tone={data.last30.failed ? "red" : "slate"}
          sub={data.last30.failed ? <Link to="/admin/communication/logs?tab=sms&status=failed" className="underline">See failures</Link> : "None"} />
        <Stat label="Verified" value={`${rate}%`} sub={`${num(data.last30.verified)} of ${num(data.last30.sessions)} verifications`} />
      </div>
      <Alert>{err}</Alert>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Verification" />
          <div className="space-y-4 p-5">
            <Toggle checked={!!f.enabled} onChange={set("enabled")} label="Send verification codes" />
            {!f.enabled && <Alert type="warn">While this is off, nobody can create an account or reset a password: a mobile number is never accepted without its code. Existing customers can still sign in.</Alert>}
            <div className="grid gap-4 sm:grid-cols-2">
              {FIELDS.map(([k, label, unit]) => (
                <Field key={k} label={label} hint={`(${data.limits[k].min}–${data.limits[k].max} ${unit})`}>
                  <Input type="number" min={data.limits[k].min} max={data.limits[k].max} value={f[k]} onChange={set(k)} required />
                </Field>
              ))}
            </div>
            <p className="text-xs text-slate-500">Codes are single-use and stored only as a secure hash. A new code always cancels the previous one.</p>
          </div>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="SMS provider" />
            <div className="space-y-3 p-5 text-sm">
              <div className="flex items-center gap-2"><b>{data.provider.label}</b>{data.provider.configured ? <Badge tone="green">Connected</Badge> : <Badge tone="red">API key missing</Badge>}</div>
              {data.provider.message && <p className="text-slate-600">{data.provider.message}</p>}
              <p className="text-xs text-slate-500">The provider and its API key are set in the server's settings file (.env: SMS_PROVIDER, RENFLAIR_API_KEY), so the key is never stored or shown here.</p>
              {allowed("provider.config") && (
                <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
                  <Field label="Send a test message to" className="min-w-[200px] flex-1"><Input type="tel" inputMode="numeric" maxLength={14} placeholder="98765 43210" value={testTo} onChange={(e) => setTestTo(e.target.value)} /></Field>
                  <Button type="button" variant="outline" loading={testing} disabled={!testTo} onClick={test}>Send test</Button>
                </div>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="Log retention" />
            <div className="space-y-2 p-5">
              <Field label="Keep the SMS / OTP log for" hint="(days; 30–3650, or 0 = forever)"><Input type="number" min={0} max={3650} value={f.log_retention_days} onChange={set("log_retention_days")} /></Field>
              <p className="text-xs text-slate-500">Unfinished sign-ups expire on their own, and their password hash is deleted straight away.</p>
            </div>
          </Card>
        </div>
      </div>
      <div className="mt-6 flex justify-end"><Button variant="gold" loading={saving}>Save OTP settings</Button></div>
    </form>
  );
}

/* ---------- delivery logs ---------- */
export function DeliveryLogs() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "sms" ? "sms" : "email";
  return (
    <div>
      <PageHeader title="Delivery logs" sub="Every email and text message the store has sent, and what happened to it." />
      <div className="mb-6"><Tabs value={tab} onChange={(t) => setParams(t === "email" ? {} : { tab: t })} tabs={[{ value: "email", label: "Email log" }, { value: "sms", label: "OTP / SMS log" }]} /></div>
      {tab === "email" ? <EmailLog key="email" params={params} /> : <SmsLog params={params} />}
    </div>
  );
}

function SmsLog({ params }) {
  const toast = useToast();
  const { allowed } = useAdminAuth();
  const [search, setSearch] = useState("");
  const [f, setF] = useState({ status: params.get("status") || "", purpose: "", verification: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const customer = params.get("customer") || "";
  const q = useDebounced(search);
  const query = { ...f, customer, search: q, page, limit: 25 };
  const { data, error, loading } = useLoad(() => adminApi.getSmsLogs(query), [q, f, page, customer]);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  const counts = data?.statusCounts || {};
  const exportCsv = async () => {
    setExporting(true);
    try { await adminApi.exportSms({ ...f, customer, search: q }); } catch (e) { toast(e.message, "error"); } finally { setExporting(false); }
  };
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-2">
        <Tabs value={f.status} onChange={(v) => { setF({ ...f, status: v }); setPage(1); }}
          tabs={[{ value: "", label: "All", count: Object.values(counts).reduce((a, b) => a + b, 0) },
            { value: "sent", label: "Sent", count: counts.sent || 0 }, { value: "failed", label: "Failed", count: counts.failed || 0 }, { value: "queued", label: "Queued", count: counts.queued || 0 }]} />
        {allowed("logs.export") && <Button variant="outline" size="sm" onClick={exportCsv} loading={exporting}>Download CSV</Button>}
      </div>
      {customer && (
        <div className="mx-4 mt-3 flex items-center justify-between rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-800">
          Showing messages for one customer only. <Link to="/admin/communication/logs?tab=sms" className="font-semibold underline">Show all</Link>
        </div>
      )}
      <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
        <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Mobile number, name or log ID" />
        <Select value={f.purpose} onChange={set("purpose")} aria-label="Purpose">
          <option value="">Any purpose</option>{Object.entries(OTP_PURPOSE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        <Select value={f.verification} onChange={set("verification")} aria-label="Verification">
          <option value="">Any verification</option><option value="verified">Verified</option><option value="pending">Pending</option>
          <option value="expired">Expired</option><option value="rejected">Rejected (too many wrong codes)</option><option value="cancelled">Replaced</option>
        </Select>
        <Input type="date" value={f.from} onChange={set("from")} aria-label="From date" />
        <Input type="date" value={f.to} onChange={set("to")} aria-label="To date" />
      </div>
      {data?.masked && <p className="px-4 pt-3 text-xs text-slate-500">Mobile numbers are partly hidden for your role.</p>}
      <Alert>{error}</Alert>
      <Table loading={loading && !data} empty={data && !data.rows.length && "No text messages match."}
        head={["When", "Mobile", "Person", "Purpose", "Delivery", "Verification", { label: "Tries", right: true }, ""]}>
        {data?.rows.map((r) => (
          <tr key={r.id} className="cursor-pointer align-top hover:bg-slate-50" onClick={() => setOpenId(r.id)}>
            <td className="whitespace-nowrap px-4 py-3 text-slate-500">{dateTime(r.created_at)}<div className="text-xs text-slate-400">#{r.id}</div></td>
            <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums">{phone(r.phone)}</td>
            <td className="px-4 py-3">{r.customer_id
              ? <Link to={`/admin/customers/${r.customer_id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">{r.person_name}</Link>
              : <span className="text-slate-600">{r.person_name || "—"}</span>}{!r.customer_id && r.pending_id && <div className="text-xs text-slate-400">sign-up not finished</div>}</td>
            <td className="px-4 py-3 text-slate-600">{OTP_PURPOSE[r.purpose] || r.purpose}</td>
            <td className="px-4 py-3"><SmsBadge status={r.status} />{r.failure_reason && <div className="mt-1 max-w-[220px] truncate text-xs text-red-600" title={r.failure_reason}>{r.failure_reason}</div>}</td>
            <td className="px-4 py-3"><Badge tone={VERIFY_TONE[r.verification]}>{r.verification}</Badge></td>
            <td className="px-4 py-3 text-right tabular-nums text-slate-600">{r.total_attempts ?? "—"}</td>
            <td className="px-4 py-3 text-right"><Button size="sm" variant="ghost">View</Button></td>
          </tr>
        ))}
      </Table>
      {data && <Pager page={data.page} limit={data.limit} total={data.total} onPage={setPage} />}
      {openId && <SmsDetail id={openId} onClose={() => setOpenId(null)} />}
    </Card>
  );
}

function SmsDetail({ id, onClose }) {
  const { data: r, error } = useLoad(() => adminApi.getSmsLog(id), [id]);
  const facts = r && [
    ["Delivery", <SmsBadge key="s" status={r.status} />], ["Verification", <Badge key="v" tone={VERIFY_TONE[r.verification]}>{r.verification}</Badge>],
    ["Mobile", phone(r.phone)], ["Person", r.customer_id ? <Link key="c" to={`/admin/customers/${r.customer_id}`} className="underline">{r.person_name}</Link> : r.person_name || "—"],
    ["Purpose", OTP_PURPOSE[r.purpose] || r.purpose], ["Requested", dateTime(r.created_at)], ["Code expires", r.otp_expires_at ? dateTime(r.otp_expires_at) : "—"],
    ["Accepted by provider", r.sent_at ? dateTime(r.sent_at) : "—"], ["Delivered", r.delivered_at ? dateTime(r.delivered_at) : "Not reported by the provider"],
    ["Verified", r.verified_at ? dateTime(r.verified_at) : "—"], ["Wrong / total tries", r.total_attempts != null ? `${r.total_attempts} total, ${r.attempts} on the latest code` : "—"],
    ["New codes asked for", r.resends ?? "—"], ["Provider", r.provider], ["Provider message ID", r.provider_message_id || "—"],
    ["Provider reply", r.provider_response || "—"], ["Sent by", r.triggered_by_name ? `${r.triggered_by_name} (test)` : "Customer request"],
  ];
  return (
    <Modal open wide title={r ? `Text message #${r.id}` : "Text message"} onClose={onClose} footer={<Button variant="outline" onClick={onClose}>Close</Button>}>
      {error && <Alert>{error}</Alert>}
      {!r ? <div className="h-40 animate-pulse rounded-xl bg-slate-100" /> : (
        <div className="space-y-5">
          {r.failure_reason && <Alert>{r.failure_reason}</Alert>}
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {facts.map(([k, v]) => <div key={k} className="flex gap-2"><dt className="w-40 shrink-0 text-slate-500">{k}</dt><dd className="min-w-0 break-words">{v}</dd></div>)}
          </dl>
          {r.related?.length > 1 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold">All messages for this verification</h4>
              <ul className="space-y-1 text-xs">{r.related.map((m) => <li key={m.id} className="flex flex-wrap gap-2"><span className="text-slate-500">#{m.id} · {dateTime(m.created_at)}</span><SmsBadge status={m.status} /><span className="text-red-600">{m.failure_reason}</span></li>)}</ul>
            </div>
          )}
          <p className="text-xs text-slate-500">"Sent" means the provider accepted the message. The code itself is never stored, so it can't be shown or sent again from here. {timeAgo(r.created_at)}.</p>
        </div>
      )}
    </Modal>
  );
}
