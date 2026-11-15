import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { adminApi } from "../../services/adminApi.js";
import { BASE_URL } from "../../services/api.js";
import { useAdminAuth } from "../../context/AdminAuthContext.jsx";
import { Alert, Badge, Button, Card, CardHeader, Field, OrderBadge, PageHeader, Pager, PayBadge, SearchBox, Select, Stat, Table, Textarea, Toggle, money, phone, num, dateOnly, dateTime, timeAgo, initials, useConfirm, useDebounced, useLoad, useToast, EmailBadge, PAY_METHOD } from "../../components/admin/ui.jsx";

export default function Customers() {
  const [search, setSearch] = useState("");
  const [active, setActive] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const { data, error, loading } = useLoad(() => adminApi.getCustomers({ search: q, active, sort, page, limit: 25 }), [q, active, sort, page]);
  return (
    <div>
      <PageHeader title="Customers" sub="People who created an account. Guest orders are listed under Orders." />
      <Card>
        <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[2fr_1fr_1fr]">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search name, email or phone" />
          <Select value={active} onChange={(e) => { setActive(e.target.value); setPage(1); }} aria-label="Status">
            <option value="">All accounts</option><option value="1">Active</option><option value="0">Disabled</option>
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
            <option value="newest">Newest first</option><option value="spent">Top spenders</option><option value="orders">Most orders</option><option value="name">Name A–Z</option>
          </Select>
        </div>
        <Alert>{error}</Alert>
        <Table loading={loading && !data} empty={data && !data.rows.length && "No customers yet."}
          head={["Customer", "Joined", "Last order", { label: "Orders", right: true }, { label: "Spent", right: true }, "Account"]}>
          {data?.rows.map((c) => (
            <tr key={c.id} className="hover:bg-slate-50">
              <td className="px-4 py-3"><Link to={`/admin/customers/${c.id}`} className="font-medium hover:underline">{c.name}</Link><div className="text-xs text-slate-500">{[c.email, c.phone && phone(c.phone)].filter(Boolean).join(" · ")}</div></td>
              <td className="px-4 py-3 text-slate-500">{dateOnly(c.created_at)}</td>
              <td className="px-4 py-3 text-slate-500">{c.last_order_at ? timeAgo(c.last_order_at) : "—"}</td>
              <td className="px-4 py-3 text-right tabular-nums">{num(c.orders)}</td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(c.spent)}</td>
              <td className="px-4 py-3">{c.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Disabled</Badge>}</td>
            </tr>
          ))}
        </Table>
        {data && <Pager page={data.page} limit={data.limit} total={data.total} onPage={setPage} />}
      </Card>
    </div>
  );
}

export function CustomerDetail() {
  const { id } = useParams();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: c, error, loading, reload } = useLoad(() => adminApi.getCustomer(id), [id]);
  const canSeeLog = useAdminAuth().can("owner", "manager");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (c) setNotes(c.notes || ""); }, [c]);

  if (loading && !c) return <div className="h-64 animate-pulse rounded-2xl bg-slate-200/60" />;
  if (error) return <Alert>{error}</Alert>;

  const setActive = async (v) => {
    if (!v && !(await confirm({ title: `Disable ${c.name}'s account?`, text: "They won't be able to sign in. Their past orders stay as they are.", danger: true, ok: "Disable" }))) return;
    try { await adminApi.updateCustomer(id, { is_active: v }); toast(v ? "Account enabled" : "Account disabled"); reload(); } catch (e) { toast(e.message, "error"); }
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
          <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#F4A300] text-lg font-semibold text-[#15203B]">
            {c.avatar ? <img src={BASE_URL.replace(/\/api\/?$/, "") + c.avatar} alt="" className="h-full w-full object-cover" /> : initials(c.name)}
          </span>
          <div>
            <h2 className="flex items-center gap-3 text-xl font-semibold">{c.name} {c.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Disabled</Badge>}</h2>
            <p className="text-sm text-slate-500">{[c.email, c.phone && phone(c.phone)].filter(Boolean).join(" · ")} · Joined {dateOnly(c.created_at)} · Last sign-in {timeAgo(c.last_login_at)}</p>
          </div>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Orders" value={num(c.stats.orders)} />
        <Stat label="Total spent" value={money(c.stats.spent)} sub="Excludes cancelled and returned" />
        <Stat label="Average order" value={money(c.stats.average)} />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Order history" />
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
        <div className="space-y-6">
          <Card>
            <CardHeader title="Emails sent" action={canSeeLog && <Link to={`/admin/emails?customer=${c.id}`} className="text-sm font-medium text-slate-600 hover:underline">Email log →</Link>} />
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
              <Toggle checked={c.is_active} onChange={setActive} label={c.is_active ? "Can sign in" : "Signing in is blocked"} />
              {c.locked_until && new Date(c.locked_until) > new Date() && <Alert type="warn">Temporarily locked after wrong passwords until {dateTime(c.locked_until)}.</Alert>}
              <Field label="Private notes" hint="(only your team sees these)"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} /></Field>
              <Button onClick={saveNotes} loading={saving} variant="outline" className="w-full">Save notes</Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
