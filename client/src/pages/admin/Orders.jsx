import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { adminApi } from "../../services/adminApi.js";
import { Alert, Button, Card, Input, OrderBadge, PageHeader, Pager, PayBadge, SearchBox, Select, Table, Tabs, money, phone, dateTime, useDebounced, useLoad, useToast, ORDER_STATUS, PAY_METHOD, PAY_STATUS } from "../../components/admin/ui.jsx";

export default function Orders() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const status = params.get("status") || "";
  const customer = params.get("customer") || "";   // opened from a customer: only their orders
  const [search, setSearch] = useState(params.get("search") || "");
  const [filters, setFilters] = useState({ payment_method: "", payment_status: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const q = useDebounced(search);
  const query = { status, customer, search: q, ...filters, page, limit: 20 };
  const { data, error, loading } = useLoad(() => adminApi.getOrders(query), [status, customer, q, filters, page]);

  const set = (k, v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };
  const setStatus = (s) => { setPage(1); setParams({ ...(s ? { status: s } : {}), ...(customer ? { customer } : {}) }); };
  const clearCustomer = () => { setPage(1); setParams(status ? { status } : {}); };
  const counts = data?.statusCounts || {};
  const all = Object.values(counts).reduce((a, b) => a + b, 0);

  const exportCsv = async () => {
    setExporting(true);
    try { await adminApi.exportOrders({ status, customer, search: q, ...filters }); }
    catch (e) { toast(e.message, "error"); }
    finally { setExporting(false); }
  };

  return (
    <div>
      <PageHeader title="Orders" sub="Every order placed on the store. Open one to update its status, payment or tracking."
        actions={<Button variant="outline" onClick={exportCsv} loading={exporting}>Download spreadsheet (CSV)</Button>} />
      {customer && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <span className="text-amber-900">Showing orders for <b>{data?.customer ? data.customer.name : `customer #${customer}`}</b>{data?.customer?.phone ? ` · ${phone(data.customer.phone)}` : ""}</span>
          <Link to={`/admin/customers/${customer}`} className="font-medium text-amber-900 underline underline-offset-2">Customer profile</Link>
          <button type="button" onClick={clearCustomer} className="ml-auto rounded-lg px-2.5 py-1 font-medium text-amber-900 hover:bg-amber-100">Show all orders ✕</button>
        </div>
      )}
      <Card>
        <div className="px-4 pt-2">
          <Tabs value={status} onChange={setStatus}
            tabs={[{ value: "", label: "All", count: all }, ...Object.entries(ORDER_STATUS).map(([k, [l]]) => ({ value: k, label: l, count: counts[k] || 0 }))]} />
        </div>
        <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Order number, name, phone, email, PIN or tracking no." />
          <Select value={filters.payment_method} onChange={(e) => set("payment_method", e.target.value)} aria-label="Payment method">
            <option value="">Any payment method</option>{Object.entries(PAY_METHOD).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
          <Select value={filters.payment_status} onChange={(e) => set("payment_status", e.target.value)} aria-label="Payment status">
            <option value="">Any payment status</option>{Object.entries(PAY_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </Select>
          <Input type="date" value={filters.from} onChange={(e) => set("from", e.target.value)} aria-label="From date" />
          <Input type="date" value={filters.to} onChange={(e) => set("to", e.target.value)} aria-label="To date" />
        </div>
        {error && <div className="p-4"><Alert>{error}</Alert></div>}
        <Table loading={loading && !data} empty={data && !data.rows.length && "No orders match these filters."}
          head={["Order", "Date", "Customer", "Items", "Payment", "Status", { label: "Total", right: true }]}>
          {data?.rows.map((o) => (
            <tr key={o.id} className="hover:bg-slate-50">
              <td className="px-4 py-3"><Link to={`/admin/orders/${o.id}`} className="font-semibold text-slate-900 hover:underline">#{o.order_number}</Link></td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-500">{dateTime(o.created_at)}</td>
              <td className="px-4 py-3"><div className="font-medium">{o.ship_name}</div><div className="text-xs text-slate-500">{phone(o.ship_phone)} · {o.ship_city}</div></td>
              <td className="px-4 py-3 tabular-nums">{o.item_count}</td>
              <td className="px-4 py-3"><div className="text-xs text-slate-500">{PAY_METHOD[o.payment_method]}</div><PayBadge status={o.payment_status} /></td>
              <td className="px-4 py-3"><OrderBadge status={o.status} /></td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(o.total)}</td>
            </tr>
          ))}
        </Table>
        {data && <Pager page={data.page} limit={data.limit} total={data.total} onPage={setPage} />}
      </Card>
    </div>
  );
}
