import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { adminApi } from "../../services/adminApi.js";
import { BASE_URL } from "../../services/api.js";
import { useAdminAuth } from "../../context/AdminAuthContext.jsx";
import { SignInHistory, ViewedProducts, ViewedRow, MethodBadge, SessionEnd, device } from "../../components/admin/CustomerInsights.jsx";
import { Alert, Badge, Button, Card, CardHeader, Field, OrderBadge, PageHeader, Pager, PayBadge, SearchBox, Select, Stat, Table, Textarea, Toggle, money, phone, num, dateOnly, dateTime, timeAgo, initials, useConfirm, useDebounced, useLoad, useToast, EmailBadge, PAY_METHOD } from "../../components/admin/ui.jsx";

const STATUS_BADGE = { active: ["Active", "green"], suspended: ["Suspended", "red"], pending: ["Pending", "amber"] };
const StatusBadge = ({ status }) => <Badge tone={STATUS_BADGE[status]?.[1]}>{STATUS_BADGE[status]?.[0] || status}</Badge>;
const Yes = ({ on, label = ["Yes", "No"] }) => on ? <Badge tone="green">{label[0]}</Badge> : <Badge tone="gray">{label[1]}</Badge>;
const EmailVerified = ({ v }) => v === "yes" ? <Badge tone="green">Yes</Badge> : v === "no" ? <Badge tone="gray">No</Badge> : <span className="text-xs text-slate-400">Not provided</span>;

export default function Customers() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [verified, setVerified] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const { data, error, loading } = useLoad(() => adminApi.getCustomers({ search: q, status, mobile_verified: verified, sort, page, limit: 25 }), [q, status, verified, sort, page]);
  const pending = status === "pending";
  const [history, setHistory] = useState(null);   // { id, name } whose sign-in history is open
  const [viewed, setViewed] = useState(null);
  return (
    <div>
      <PageHeader title="Registered users" sub="Customers with an account. Sign-ups waiting for their mobile code are under Pending; guest orders are under Orders." />
      <Card>
        <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[2fr_1fr_1fr_1fr]">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search name, mobile, email or customer ID" />
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Account status">
            <option value="">All accounts</option><option value="active">Active</option><option value="suspended">Suspended</option>
            <option value="pending">Pending sign-ups{data?.pendingCount ? ` (${data.pendingCount})` : ""}</option>
          </Select>
          <Select value={verified} onChange={(e) => { setVerified(e.target.value); setPage(1); }} aria-label="Mobile verified" disabled={pending}>
            <option value="">Mobile: any</option><option value="1">Mobile verified</option><option value="0">Mobile not verified</option>
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort" disabled={pending}>
            <option value="newest">Newest first</option><option value="login">Last sign-in</option><option value="spent">Top spenders</option><option value="orders">Most orders</option><option value="views">Most product visits</option><option value="name">Name A–Z</option>
          </Select>
        </div>
        <Alert>{error}</Alert>
        {pending ? (
          <Table loading={loading && !data} empty={data && !data.rows.length && "No sign-ups are waiting for verification."}
            head={["Name", "Mobile", "Email", "Started", "Expires", "Code"]}>
            {data?.rows.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums">{phone(p.phone)}</td>
                <td className="px-4 py-3 text-slate-600">{p.email || <span className="text-slate-400">—</span>}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">{timeAgo(p.created_at)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">{dateTime(p.expires_at)}</td>
                <td className="px-4 py-3"><Badge tone={p.otp_status === "locked" ? "red" : "amber"}>{p.otp_status === "locked" ? "Too many wrong codes" : "Waiting"}</Badge></td>
              </tr>
            ))}
          </Table>
        ) : (
          <Table loading={loading && !data} empty={data && !data.rows.length && "No customers match."}
            head={["ID", "Customer", "Mobile", "Email", "Registered", "Last sign-in", "Most viewed", { label: "Orders", right: true }, "Status"]}>
            {data?.rows.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-xs tabular-nums text-slate-400">#{c.id}</td>
                <td className="min-w-[140px] px-4 py-3"><Link to={`/admin/customers/${c.id}`} className="font-medium hover:underline">{c.name}</Link>{c.spent > 0 && <div className="text-xs text-slate-500">{money(c.spent)} spent</div>}</td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums">{c.phone ? <>{phone(c.phone)}<div className="mt-0.5">{c.mobile_verified ? <Badge tone="green">Verified</Badge> : <Badge>Not verified</Badge>}</div></> : <span className="text-xs text-slate-400">None</span>}</td>
                <td className="max-w-[190px] px-4 py-3 text-slate-600">{c.email ? <><div className="truncate" title={c.email}>{c.email}</div><div className="mt-0.5">{c.email_verified === "yes" ? <Badge tone="green">Verified</Badge> : <Badge>Not verified</Badge>}</div></> : <span className="text-slate-400">—</span>}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">{dateOnly(c.created_at)}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  {c.last_login_at ? <button type="button" onClick={() => setHistory(c)} title="See every sign-in and sign-out"
                    className="rounded-md text-slate-600 underline decoration-slate-300 decoration-dotted underline-offset-4 hover:text-slate-900 hover:decoration-slate-500">{timeAgo(c.last_login_at)}</button>
                    : <span className="text-slate-400">Never</span>}
                </td>
                <td className="max-w-[180px] px-4 py-3">
                  {c.top_product ? <button type="button" onClick={() => setViewed(c)} title="See every product this customer viewed" className="block max-w-full text-left hover:underline">
                    <span className="block truncate text-slate-700">{c.top_product}</span><span className="text-xs text-slate-500">{num(c.product_views)} visit{c.product_views === 1 ? "" : "s"} in total</span></button>
                    : <span className="text-xs text-slate-400">None yet</span>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {c.orders > 0 ? <Link to={`/admin/orders?customer=${c.id}`} title={`See ${c.name}'s orders`}
                    className="inline-flex min-w-[2.25rem] items-center justify-center rounded-full bg-[#410309]/5 px-2.5 py-0.5 font-semibold text-[#410309] hover:bg-[#410309] hover:text-white">{num(c.orders)}</Link>
                    : <span className="text-slate-400">0</span>}
                </td>
                <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
              </tr>
            ))}
          </Table>
        )}
        {data && <Pager page={data.page} limit={data.limit} total={data.total} onPage={setPage} />}
      </Card>
      <SignInHistory open={!!history} customerId={history?.id} name={history?.name} onClose={() => setHistory(null)} />
      <ViewedProducts open={!!viewed} customerId={viewed?.id} name={viewed?.name} onClose={() => setViewed(null)} />
    </div>
  );
}

/* A stat tile that opens something (the orders list, the sign-in history…). */
const StatLink = ({ label, value, sub, to, onClick }) => {
  const cls = "group block rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-[#410309]/40 hover:shadow-md";
  const body = (<>
    <div className="flex items-center justify-between text-sm text-slate-500">{label}<span className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[#410309]">→</span></div>
    <div className="mt-1.5 truncate text-2xl font-semibold text-slate-900">{value}</div>
    {sub && <div className="mt-1 truncate text-xs text-slate-500">{sub}</div>}
  </>);
  return to ? <Link to={to} className={cls}>{body}</Link> : <button type="button" onClick={onClick} className={cls}>{body}</button>;
};

export function CustomerDetail() {
  const { id } = useParams();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: c, error, loading, reload } = useLoad(() => adminApi.getCustomer(id), [id]);
  const { allowed } = useAdminAuth();
  const canSeeLog = allowed("logs.view"), canStatus = allowed("customers.status");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showViews, setShowViews] = useState(false);
  useEffect(() => { if (c) setNotes(c.notes || ""); }, [c]);

  if (loading && !c) return <div className="h-64 animate-pulse rounded-2xl bg-slate-200/60" />;
  if (error) return <Alert>{error}</Alert>;

  const setActive = async (v) => {
    if (!(await confirm(v
      ? { title: `Reactivate ${c.name}'s account?`, text: c.email ? "They can sign in again, and we'll email them that the account is active." : "They can sign in again.", ok: "Reactivate" }
      : { title: `Suspend ${c.name}'s account?`, text: `They're signed out everywhere and can't sign in. Past orders stay as they are.${c.email ? " We'll email them about it." : ""}`, danger: true, ok: "Suspend" }))) return;
    try { const r = await adminApi.updateCustomer(id, { is_active: v }); toast(`${v ? "Account reactivated" : "Account suspended"}${r.emailed ? " · customer emailed" : ""}`); reload(); } catch (e) { toast(e.message, "error"); }
  };
  const saveNotes = async () => {
    setSaving(true);
    try { await adminApi.updateCustomer(id, { notes }); toast("Notes saved"); } catch (e) { toast(e.message, "error"); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin/customers" className="text-sm text-slate-500 hover:text-slate-900">← All customers</Link>
        <div className="mt-2 flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#F2C12E] text-lg font-semibold text-[#410309]">
            {c.avatar ? <img src={BASE_URL.replace(/\/api\/?$/, "") + c.avatar} alt="" className="h-full w-full object-cover" /> : initials(c.name)}
          </span>
          <div>
            <h2 className="flex items-center gap-3 text-xl font-semibold">{c.name} <StatusBadge status={c.status} /></h2>
            <p className="text-sm text-slate-500">Customer #{c.id} · {[c.phone && phone(c.phone), c.email].filter(Boolean).join(" · ")} · Joined {dateOnly(c.created_at)} · Last sign-in {c.last_login_at ? timeAgo(c.last_login_at) : "never"}</p>
          </div>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatLink label="Orders" value={num(c.stats.orders)} sub="Open in Orders" to={`/admin/orders?customer=${c.id}`} />
        <Stat label="Total spent" value={money(c.stats.spent)} sub="Excludes cancelled and returned" />
        <Stat label="Average order" value={money(c.stats.average)} />
        <StatLink label="Sign-ins" value={num(c.stats.signIns)} sub={c.last_login_at ? `Last ${timeAgo(c.last_login_at)}` : "Never signed in"} onClick={() => setShowHistory(true)} />
        <StatLink label="Products viewed" value={num(c.stats.viewedProducts)} sub={`${num(c.stats.productVisits)} visits${c.stats.lastViewedAt ? ` · last ${timeAgo(c.stats.lastViewedAt)}` : ""}`} onClick={() => setShowViews(true)} />
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
        <Card>
          <CardHeader title="Order history" action={c.orders.length > 0 && <Link to={`/admin/orders?customer=${c.id}`} className="text-sm font-medium text-slate-600 hover:underline">Open in Orders →</Link>} />
          <Table empty={!c.orders.length && "No orders yet."} head={["Order", "Date", "Payment", "Status", { label: "Total", right: true }]}>
            {c.orders.map((o) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <td className="px-4 py-3"><Link to={`/admin/orders/${o.id}`} className="font-semibold hover:underline">#{o.order_number}</Link></td>
                <td className="px-4 py-3 text-slate-500">{dateTime(o.created_at)}</td>
                <td className="px-4 py-3"><span className="mr-2 text-xs text-slate-500">{PAY_METHOD[o.payment_method]}</span><PayBadge status={o.payment_status} /></td>
                <td className="px-4 py-3"><OrderBadge status={o.status} /></td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(o.total)}</td>
              </tr>
            ))}
          </Table>
        </Card>
          <Card>
            <CardHeader title="Most viewed products" sub="What this customer keeps coming back to" action={c.views.length > 0 && <button type="button" onClick={() => setShowViews(true)} className="text-sm font-medium text-slate-600 hover:underline">See all →</button>} />
            {c.views.length ? <ul className="divide-y divide-slate-100 text-sm">{c.views.slice(0, 8).map((v) => <ViewedRow key={v.id} v={v} max={c.views[0].views} />)}</ul>
              : <p className="px-5 pb-5 text-sm text-slate-500">No product visits yet. Visits are counted while the customer is signed in.</p>}
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Profile & verification" />
            <dl className="divide-y divide-slate-100 text-sm">
              {[["Mobile", c.phone ? phone(c.phone) : "None"], ["Mobile verified", <Yes key="m" on={c.mobile_verified} />], ["Email", c.email || "Not provided"],
                ["Email verified", <EmailVerified key="e" v={c.email_verified} />], ["Registered", dateTime(c.created_at)],
                ["Last sign-in", c.last_login_at ? <button key="l" type="button" onClick={() => setShowHistory(true)} className="text-right underline decoration-slate-300 decoration-dotted underline-offset-4 hover:decoration-slate-500">{dateTime(c.last_login_at)}{c.last_login_ip ? ` from ${c.last_login_ip}` : ""}</button> : "Never"]]
                .map(([k, v]) => <div key={k} className="flex items-center justify-between gap-3 px-5 py-2.5"><dt className="text-slate-500">{k}</dt><dd className="text-right">{v}</dd></div>)}
            </dl>
            <p className="px-5 pb-4 text-xs text-slate-400">Passwords and codes are never visible to the team.</p>
          </Card>
          <Card>
            <CardHeader title="Emails sent" action={canSeeLog && <Link to={`/admin/communication/logs?customer=${c.id}`} className="text-sm font-medium text-slate-600 hover:underline">Email log →</Link>} />
            <ul className="divide-y divide-slate-100 text-sm">
              {c.emails.length ? c.emails.slice(0, 8).map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="min-w-0 flex-1"><div className="truncate">{e.subject}</div><div className="text-xs text-slate-500">{dateTime(e.created_at)}</div></div>
                  <EmailBadge status={e.status} />
                </li>
              )) : <li className="px-5 py-3 text-slate-500">{c.email ? "None yet." : "No email address on this account."}</li>}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Addresses used" />
            <ul className="divide-y divide-slate-100 text-sm">
              {c.addresses.length ? c.addresses.map((a, i) => <li key={i} className="px-5 py-3 text-slate-600">{[a.ship_line1, a.ship_line2, `${a.ship_city}, ${a.ship_state} ${a.ship_pin}`].filter(Boolean).join(", ")}</li>)
                : <li className="px-5 py-3 text-slate-500">None yet.</li>}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Account" />
            <div className="space-y-4 p-5">
              <Toggle checked={c.is_active} onChange={setActive} disabled={!canStatus} label={c.is_active ? "Active: can sign in" : "Suspended: signing in is blocked"} />
              {!canStatus && <p className="text-xs text-slate-500">Only owners and managers can suspend or reactivate accounts.</p>}
              {c.locked_until && new Date(c.locked_until) > new Date() && <Alert type="warn">Temporarily locked after wrong passwords until {dateTime(c.locked_until)}.</Alert>}
              <Field label="Private notes" hint="(only your team sees these)"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} /></Field>
              <Button onClick={saveNotes} loading={saving} variant="outline" className="w-full">Save notes</Button>
            </div>
          </Card>
        </div>
      </div>
      <SecurityHistory c={c} canSeeLog={canSeeLog} onHistory={() => setShowHistory(true)} />
      <SignInHistory open={showHistory} customerId={c.id} name={c.name} onClose={() => setShowHistory(false)} />
      <ViewedProducts open={showViews} customerId={c.id} name={c.name} onClose={() => setShowViews(false)} />
    </div>
  );
}

const PURPOSE = { registration: "Sign-up", password_reset: "Password reset", login: "Sign-in code", google_link: "Google sign-in" };
const OTP_STATE = { used: ["Verified", "green"], verified: ["Verified", "green"], pending: ["Pending", "amber"], expired: ["Expired", "gray"], locked: ["Rejected", "red"], cancelled: ["Replaced", "gray"] };
const ADMIN_ACTION = { "customer.disable": "Suspended the account", "customer.enable": "Reactivated the account", "customer.update": "Updated private notes" };

function SecurityHistory({ c, canSeeLog, onHistory }) {
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <Card>
        <CardHeader title="OTP verifications" action={canSeeLog && <Link to={`/admin/communication/logs?tab=sms&customer=${c.id}`} className="text-sm font-medium text-slate-600 hover:underline">SMS log →</Link>} />
        <ul className="divide-y divide-slate-100 text-sm">
          {!canSeeLog ? <li className="px-5 py-3 text-slate-500">Your role can't see the SMS log.</li> : c.otp.length ? c.otp.map((o) => (
            <li key={o.id} className="flex items-center gap-3 px-5 py-2.5">
              <div className="min-w-0 flex-1"><div>{PURPOSE[o.purpose] || o.purpose}</div><div className="text-xs text-slate-500">{dateTime(o.created_at)} · {o.total_attempts} {o.total_attempts === 1 ? "try" : "tries"}{o.resends ? ` · ${o.resends} new code${o.resends > 1 ? "s" : ""}` : ""}</div></div>
              <Badge tone={OTP_STATE[o.status]?.[1]}>{OTP_STATE[o.status]?.[0] || o.status}</Badge>
            </li>
          )) : <li className="px-5 py-3 text-slate-500">None recorded.</li>}
        </ul>
      </Card>
      <Card>
        <CardHeader title="Sign-ins" sub={`Latest ${Math.min(5, c.sessions.length)} of ${num(c.stats.signIns)}`} action={c.sessions.length > 0 && <button type="button" onClick={onHistory} className="text-sm font-medium text-slate-600 hover:underline">Full history →</button>} />
        <ul className="divide-y divide-slate-100 text-sm">
          {c.sessions.length ? c.sessions.map((x) => (
            <li key={x.id} className="flex items-start gap-3 px-5 py-2.5">
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2">{dateTime(x.created_at)} <MethodBadge m={x.method} /></div><div className="text-xs text-slate-500">{device(x.user_agent)}{x.ip ? ` · ${x.ip}` : ""}</div></div>
              <div className="text-right text-xs"><SessionEnd s={x} /></div>
            </li>
          )) : <li className="px-5 py-3 text-slate-500">No sign-ins yet.</li>}
        </ul>
      </Card>
      <Card>
        <CardHeader title="Team actions" />
        <ul className="divide-y divide-slate-100 text-sm">
          {c.adminLog.length ? c.adminLog.map((l) => (
            <li key={l.id} className="px-5 py-2.5"><div>{ADMIN_ACTION[l.action] || l.action}</div><div className="text-xs text-slate-500">{l.admin_name || "Someone"} · {dateTime(l.created_at)}</div></li>
          )) : <li className="px-5 py-3 text-slate-500">No changes by the team.</li>}
        </ul>
      </Card>
    </div>
  );
}
