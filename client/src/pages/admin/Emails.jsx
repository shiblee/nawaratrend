import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { adminApi } from "../../services/adminApi.js";
import { Alert, Badge, Button, Card, CardHeader, EmailBadge, Field, Input, Modal, PageHeader, Pager, SearchBox, Select, Stat, Table, Tabs, Toggle,
  dateTime, num, timeAgo, useDebounced, useLoad, useToast, EMAIL_STATUS, TRIGGER } from "../../components/admin/ui.jsx";

export default function Emails() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || (params.get("order") || params.get("customer") || params.get("log") ? "log" : "templates");
  const setTab = (t) => setParams(t === "templates" ? {} : { tab: t });
  return (
    <div>
      <PageHeader title="Emails" sub="What customers are emailed, every email that was sent, and who it comes from." />
      <div className="mb-6"><Tabs value={tab} onChange={setTab} tabs={[{ value: "templates", label: "Templates" }, { value: "log", label: "Email log" }, { value: "settings", label: "Settings" }]} /></div>
      {tab === "templates" && <Templates />}
      {tab === "log" && <Log params={params} />}
      {tab === "settings" && <Settings />}
    </div>
  );
}

/* ---------- templates ---------- */
function Templates() {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => adminApi.getEmailTemplates(), []);
  const toggle = async (t, on) => {
    try { await adminApi.setEmailTemplateEnabled(t.key, on); toast(`"${t.name}" email turned ${on ? "on" : "off"}`); reload(); }
    catch (e) { toast(e.message, "error"); }
  };
  if (error) return <Alert>{error}</Alert>;
  const groups = [["account", "Account emails", "Sent when customers sign up or manage their password"], ["order", "Order emails", "Sent as an order moves along. Turn off any you don't want customers to receive."]];
  return (
    <div className="space-y-6">
      {groups.map(([cat, title, sub]) => (
        <Card key={cat}>
          <CardHeader title={title} sub={sub} />
          <Table loading={loading && !data} head={["Email", "On", "Wording", { label: "Sent", right: true }, ""]}>
            {data?.filter((t) => t.category === cat).map((t) => (
              <tr key={t.key} className="align-top hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link to={`/admin/emails/templates/${t.key}`} className="font-medium hover:underline">{t.name}</Link>
                  <div className="text-xs text-slate-500">{t.description}</div>
                  <div className="mt-1 truncate text-xs text-slate-400" title={t.subject}>Subject: {t.subject}</div>
                </td>
                <td className="px-4 py-3">{t.essential ? <Badge tone="blue">Always on</Badge> : <Toggle checked={t.enabled} onChange={(v) => toggle(t, v)} />}</td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                  {t.customised ? <><Badge tone="violet">Edited</Badge><div className="mt-1">{t.updated_by_name || "—"}, {timeAgo(t.updated_at)}</div></> : <Badge>Default</Badge>}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-xs tabular-nums text-slate-600">
                  {num(t.stats.sent)} sent{t.stats.failed ? <div className="text-red-600">{num(t.stats.failed)} failed</div> : null}
                  {t.stats.last_at && <div className="text-slate-400">last {timeAgo(t.stats.last_at)}</div>}
                </td>
                <td className="px-4 py-3 text-right"><Link to={`/admin/emails/templates/${t.key}`}><Button size="sm" variant="outline">Edit</Button></Link></td>
              </tr>
            ))}
          </Table>
        </Card>
      ))}
    </div>
  );
}

/* ---------- log ---------- */
function Log({ params }) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [f, setF] = useState({ status: "", template: "", trigger: "", category: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(params.get("log") ? Number(params.get("log")) : null);
  const [exporting, setExporting] = useState(false);
  const scope = { order: params.get("order") || "", customer: params.get("customer") || "" };
  const q = useDebounced(search);
  const query = { ...f, ...scope, search: q, page, limit: 25 };
  const { data, error, loading, reload } = useLoad(() => adminApi.getEmailLogs(query), [q, f, page, scope.order, scope.customer]);
  const templates = useLoad(() => adminApi.getEmailTemplates(), []);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  const counts = data?.statusCounts || {};

  const exportCsv = async () => {
    setExporting(true);
    try { await adminApi.exportEmails({ ...f, ...scope, search: q }); } catch (e) { toast(e.message, "error"); } finally { setExporting(false); }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-2">
        <Tabs value={f.status} onChange={(v) => { setF({ ...f, status: v }); setPage(1); }}
          tabs={[{ value: "", label: "All", count: Object.values(counts).reduce((a, b) => a + b, 0) }, ...Object.entries(EMAIL_STATUS).filter(([k]) => k !== "sending").map(([k, [l]]) => ({ value: k, label: l, count: counts[k] || 0 }))]} />
        <Button variant="outline" size="sm" onClick={exportCsv} loading={exporting}>Download CSV</Button>
      </div>
      {(scope.order || scope.customer) && (
        <div className="mx-4 mt-3 flex items-center justify-between rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-800">
          Showing emails for one {scope.order ? "order" : "customer"} only. <Link to="/admin/emails?tab=log" className="font-semibold underline">Show all</Link>
        </div>
      )}
      <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
        <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Email address, name, subject, order no. or log ID" />
        <Select value={f.template} onChange={set("template")} aria-label="Email type">
          <option value="">Any email</option>{(templates.data || []).map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
        </Select>
        <Select value={f.trigger} onChange={set("trigger")} aria-label="Sent because of">
          <option value="">Any reason</option>{Object.entries(TRIGGER).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        <Input type="date" value={f.from} onChange={set("from")} aria-label="From date" />
        <Input type="date" value={f.to} onChange={set("to")} aria-label="To date" />
      </div>
      <Alert>{error}</Alert>
      <Table loading={loading && !data} empty={data && !data.rows.length && "No emails match."}
        head={["When", "To", "Email", "Order", "Reason", "Status", ""]}>
        {data?.rows.map((e) => (
          <tr key={e.id} className="cursor-pointer align-top hover:bg-slate-50" onClick={() => setOpenId(e.id)}>
            <td className="whitespace-nowrap px-4 py-3 text-slate-500">{dateTime(e.created_at)}<div className="text-xs text-slate-400">#{e.id}</div></td>
            <td className="px-4 py-3"><div className="max-w-[220px] truncate font-medium">{e.recipient}</div>
              {e.customer_id && <Link to={`/admin/customers/${e.customer_id}`} onClick={(ev) => ev.stopPropagation()} className="text-xs text-slate-500 hover:underline">{e.customer_name}</Link>}</td>
            <td className="px-4 py-3"><div className="font-medium">{e.name}</div><div className="max-w-[320px] truncate text-xs text-slate-500">{e.subject}</div></td>
            <td className="px-4 py-3">{e.order_id ? <Link to={`/admin/orders/${e.order_id}`} onClick={(ev) => ev.stopPropagation()} className="hover:underline">#{e.order_number}</Link> : <span className="text-slate-400">—</span>}</td>
            <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">{TRIGGER[e.trigger_source] || e.trigger_source}{e.triggered_by_name && <div className="text-slate-400">{e.triggered_by_name}</div>}</td>
            <td className="px-4 py-3"><EmailBadge status={e.status} />{e.attempts > 1 && <div className="mt-1 text-xs text-slate-400">{e.attempts} attempts</div>}
              {e.status === "failed" && e.next_attempt_at && <div className="text-xs text-slate-400">retrying {timeAgo(e.next_attempt_at).replace(" ago", "")}</div>}</td>
            <td className="px-4 py-3 text-right"><Button size="sm" variant="ghost">View</Button></td>
          </tr>
        ))}
      </Table>
      {data && <Pager page={data.page} limit={data.limit} total={data.total} onPage={setPage} />}
      {openId && <LogDetail id={openId} onClose={() => setOpenId(null)} onChanged={reload} />}
    </Card>
  );
}

function LogDetail({ id, onClose, onChanged }) {
  const toast = useToast();
  const { data: e, error, reload } = useLoad(() => adminApi.getEmailLog(id), [id]);
  const [view, setView] = useState("html");
  const [busy, setBusy] = useState(false);
  const retry = async () => {
    setBusy(true);
    try {
      const r = await adminApi.retryEmail(id);
      toast(r.status === "sent" ? "Email sent" : `Email ${r.status}${r.last_error ? `: ${r.last_error}` : ""}`, r.status === "sent" ? "ok" : "error");
      reload(); onChanged();
    } catch (err) { toast(err.message, "error"); } finally { setBusy(false); }
  };
  const facts = e && [
    ["Status", <EmailBadge key="s" status={e.status} />], ["Email", `${e.name} (${e.template_version ? `template version ${e.template_version}` : "default wording"})`], ["To", e.recipient],
    ["Customer", e.customer_id ? <Link key="c" to={`/admin/customers/${e.customer_id}`} className="underline">{e.customer_name}</Link> : "—"],
    ["Order", e.order_id ? <Link key="o" to={`/admin/orders/${e.order_id}`} className="underline">#{e.order_number}</Link> : "—"],
    ["Sent because of", `${TRIGGER[e.trigger_source] || e.trigger_source}${e.triggered_by_name ? ` (${e.triggered_by_name})` : ""}`],
    ["Created", dateTime(e.created_at)], ["Sent", e.sent_at ? dateTime(e.sent_at) : "—"], ["Attempts", `${e.attempts} of ${e.max_attempts}`],
    ["Mail server reply", e.provider_response || "—"], ["Message ID", e.provider_message_id || "—"],
  ];
  return (
    <Modal open wide title={e ? e.subject : "Email"} onClose={onClose}
      footer={e && <>
        <Button variant="outline" onClick={onClose}>Close</Button>
        {["failed", "skipped", "sent"].includes(e.status) && <Button loading={busy} onClick={retry}>{e.status === "sent" ? "Send again" : "Retry now"}</Button>}
      </>}>
      {error && <Alert>{error}</Alert>}
      {!e ? <div className="h-40 animate-pulse rounded-xl bg-slate-100" /> : (
        <div className="space-y-5">
          {e.last_error && <Alert>{e.last_error}</Alert>}
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {facts.map(([k, v]) => <div key={k} className="flex gap-2"><dt className="w-36 shrink-0 text-slate-500">{k}</dt><dd className="min-w-0 break-words">{v}</dd></div>)}
          </dl>
          {e.attempts_log.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold">Delivery attempts</h4>
              <ul className="space-y-1 text-xs">
                {e.attempts_log.map((a) => <li key={a.attempt} className="flex flex-wrap gap-2"><span className="text-slate-500">{dateTime(a.created_at)}</span><EmailBadge status={a.status} /><span className="text-slate-600">{a.response}</span></li>)}
              </ul>
            </div>
          )}
          <p className="text-xs text-slate-500">"Sent" means the mail server accepted the email. Whether it then reached the inbox (or spam) isn't reported back by this server.</p>
          <div>
            <div className="mb-2 flex gap-2"><Button size="sm" variant={view === "html" ? "primary" : "outline"} onClick={() => setView("html")}>As the customer sees it</Button><Button size="sm" variant={view === "text" ? "primary" : "outline"} onClick={() => setView("text")}>Plain text</Button></div>
            {view === "html"
              // sandbox with no permissions: the email's HTML can't run scripts or reach the admin panel
              ? <iframe title="Email preview" sandbox="" srcDoc={e.html} className="h-[480px] w-full rounded-xl border border-slate-200 bg-white" />
              : <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs">{e.text}</pre>}
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ---------- settings ---------- */
function Settings() {
  const toast = useToast();
  const { data, error, reload } = useLoad(() => adminApi.getEmailSettings(), []);
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { if (data) setF({ enabled: data.enabled, from_name: data.from_name, from_address: data.from_address, reply_to: data.reply_to, support_email: data.support_email }); }, [data]);
  if (error && !f) return <Alert>{error}</Alert>;
  if (!f) return <div className="h-64 animate-pulse rounded-2xl bg-slate-200/60" />;
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });
  const save = async (e) => {
    e.preventDefault(); setSaving(true); setErr("");
    try { await adminApi.updateEmailSettings(f); toast("Email settings saved"); reload(); } catch (e2) { setErr(e2.message); } finally { setSaving(false); }
  };
  return (
    <form onSubmit={save} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Emails, last 30 days" value={num(data.last30.total)} />
        <Stat label="Sent" value={num(data.last30.sent)} tone="green" />
        <Stat label="Failed" value={num(data.last30.failed)} sub={data.last30.failed ? <Link to="/admin/emails?tab=log" className="underline">See the log</Link> : "None"} />
        <Stat label="Waiting to send" value={num(data.last30.queued)} />
      </div>
      <Alert>{err}</Alert>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Sending" />
          <div className="space-y-4 p-5">
            <Toggle checked={!!f.enabled} onChange={set("enabled")} label="Send emails to customers" />
            {!f.enabled && <Alert type="warn">While this is off, no emails go out (password reset emails included). Each one is logged as "Not sent" instead.</Alert>}
            <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
              <div><b className="text-slate-800">How email is sent:</b> {data.transport.label}</div>
              <p className="mt-1 text-xs">This, and any mail server password, is set in the server's settings file (.env), so it's never shown or stored here.</p>
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Sender" sub="What customers see in their inbox" />
          <div className="space-y-4 p-5">
            <Field label="Sender name"><Input value={f.from_name} maxLength={60} onChange={set("from_name")} required /></Field>
            <Field label="Sender email" hint="(should be an address on your own domain)"><Input type="email" value={f.from_address} maxLength={150} onChange={set("from_address")} required /></Field>
            <Field label="Replies go to" hint="(optional; when customers press Reply)"><Input type="email" value={f.reply_to} maxLength={150} onChange={set("reply_to")} placeholder={f.from_address} /></Field>
            <Field label="Support email" hint="(shown in emails as {{support_email}})"><Input type="email" value={f.support_email} maxLength={150} onChange={set("support_email")} placeholder={f.reply_to || f.from_address} /></Field>
          </div>
        </Card>
      </div>
      <div className="flex justify-end"><Button variant="gold" loading={saving}>Save email settings</Button></div>
    </form>
  );
}
