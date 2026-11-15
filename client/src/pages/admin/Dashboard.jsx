import { useState } from "react";
import { Link } from "react-router-dom";
import { adminApi } from "../../services/adminApi.js";
import { useAdminAuth } from "../../context/AdminAuthContext.jsx";
import { describe } from "../../components/admin/activity.js";
import { Alert, Card, CardHeader, OrderBadge, Stat, Svg, Icon, money, num, timeAgo, useLoad, ORDER_STATUS, PAY_METHOD } from "../../components/admin/ui.jsx";

const change = (now, before) => {
  if (!before) return now ? "New this period" : "No sales yet";
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct)}% vs previous 30 days`;
};

/* 30-day revenue: one series, so one colour and no legend; hover any day for its numbers. */
function SalesChart({ days }) {
  const [hover, setHover] = useState(null);
  const W = 720, H = 220, padL = 44, padB = 26, padT = 10;
  const max = Math.max(1, ...days.map((d) => d.revenue));
  const nice = (() => { const p = 10 ** Math.floor(Math.log10(max)); return Math.ceil(max / p) * p; })();
  const bw = (W - padL) / days.length;
  const y = (v) => padT + (H - padT - padB) * (1 - v / nice);
  const label = (d) => new Date(d + "T12:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const total = days.reduce((s, d) => s + d.revenue, 0);
  const h = hover != null ? days[hover] : null;
  return (
    <div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full" role="img" aria-label={`Daily sales for the last 30 days, ${money(total)} in total`}>
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={padL} x2={W} y1={y(nice * f)} y2={y(nice * f)} stroke="#E2E8F0" strokeWidth="1" />
              <text x={padL - 8} y={y(nice * f) + 4} textAnchor="end" className="fill-slate-400 text-[11px]">{nice * f >= 1000 ? `₹${(nice * f / 1000).toLocaleString("en-IN")}k` : `₹${nice * f}`}</text>
            </g>
          ))}
          {days.map((d, i) => {
            const x = padL + i * bw, top = y(d.revenue), bh = H - padB - top;
            return (
              <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                {/* the hit area is the full column, bigger than the bar */}
                <rect x={x} y={padT} width={bw} height={H - padT - padB} fill="transparent" />
                {d.revenue > 0 && <path d={`M${x + 1} ${H - padB} V${top + 4} q0 -4 4 -4 H${x + bw - 5} q4 0 4 4 V${H - padB} Z`} fill={hover === i ? "#F2C12E" : "#410309"} />}
                {(i % 5 === 4 || i === days.length - 1) && <text x={i === days.length - 1 ? W : x + bw / 2} y={H - 8} textAnchor={i === days.length - 1 ? "end" : "middle"} className="fill-slate-400 text-[11px]">{label(d.day)}</text>}
              </g>
            );
          })}
        </svg>
        {h && (
          <div className="pointer-events-none absolute top-0 rounded-lg bg-[#410309] px-3 py-2 text-xs text-white shadow-lg"
            style={{ left: `clamp(0px, calc(${((padL + hover * bw + bw / 2) / W) * 100}% - 60px), calc(100% - 130px))` }}>
            <div className="font-semibold">{label(h.day)}</div>
            <div>{money(h.revenue)} · {h.orders} order{h.orders === 1 ? "" : "s"}</div>
          </div>
        )}
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-xs font-medium text-slate-500 hover:text-slate-800">View as a table</summary>
        <div className="mt-2 max-h-60 overflow-y-auto rounded-xl border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-2 text-left">Day</th><th className="px-3 py-2 text-right">Orders</th><th className="px-3 py-2 text-right">Sales</th></tr></thead>
            <tbody>{[...days].reverse().map((d) => <tr key={d.day} className="border-t border-slate-100"><td className="px-3 py-1.5">{label(d.day)}</td><td className="px-3 py-1.5 text-right">{d.orders}</td><td className="px-3 py-1.5 text-right">{money(d.revenue)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/** Horizontal bars for a short ranked list (one hue; the value is printed, so colour isn't needed to read it). */
function BarList({ rows, value, label, fmt = num, empty }) {
  const max = Math.max(1, ...rows.map(value));
  if (!rows.length) return <p className="px-5 py-8 text-center text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="space-y-3 px-5 py-4">
      {rows.map((r, i) => (
        <li key={i}>
          <div className="mb-1 flex justify-between gap-3 text-sm"><span className="truncate text-slate-700">{label(r)}</span><span className="shrink-0 font-semibold tabular-nums text-slate-900">{fmt(value(r))}</span></div>
          <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-[#410309]" style={{ width: `${(value(r) / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export default function Dashboard() {
  const { admin } = useAdminAuth();
  const { data: d, error, loading } = useLoad(() => adminApi.getDashboard(), []);

  if (loading && !d) return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-200/60" />)}</div>;
  if (error) return <Alert>{error}</Alert>;

  const toDo = (d.statusCounts.pending || 0);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Welcome back, {admin?.name?.split(" ")[0]}</h2>
          <p className="mt-1 text-sm text-slate-500">Here's how the store is doing. Sales exclude cancelled and returned orders.</p>
        </div>
        {toDo > 0 && <Link to="/admin/orders?status=pending" className="rounded-xl bg-[#F2C12E] px-4 py-2 text-sm font-semibold text-[#410309]">{toDo} order{toDo > 1 ? "s" : ""} waiting to be confirmed →</Link>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Sales, last 30 days" value={money(d.last30.revenue)} sub={change(d.last30.revenue, d.prev30.revenue)} tone="gold" icon={<Svg d={Icon.activity} />} />
        <Stat label="Orders, last 30 days" value={num(d.last30.orders)} sub={`Today: ${d.today.orders} · 7 days: ${d.last7.orders}`} tone="blue" icon={<Svg d={Icon.orders} />} />
        <Stat label="Average order" value={money(d.averageOrder)} sub={`Today's sales: ${money(d.today.revenue)}`} tone="green" icon={<Svg d={Icon.store} />} />
        <Stat label="Customers" value={num(d.customers.total)} sub={`${d.customers.new30} new in 30 days`} tone="slate" icon={<Svg d={Icon.customers} />} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Sales by day" sub={`Last 30 days · ${money(d.last30.revenue)} from ${num(d.last30.orders)} orders`} />
          <div className="px-5 py-4"><SalesChart days={d.salesByDay} /></div>
        </Card>
        <Card>
          <CardHeader title="Orders by status" sub="All time" action={<Link to="/admin/orders" className="text-xs font-semibold text-slate-500 hover:text-slate-900">All orders →</Link>} />
          <ul className="divide-y divide-slate-100">
            {Object.keys(ORDER_STATUS).map((s) => (
              <li key={s}><Link to={`/admin/orders?status=${s}`} className="flex items-center justify-between px-5 py-2.5 text-sm hover:bg-slate-50">
                <OrderBadge status={s} /><span className="font-semibold tabular-nums">{num(d.statusCounts[s] || 0)}</span>
              </Link></li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Best sellers" sub="Units sold, last 30 days" />
          <BarList rows={d.topProducts} value={(r) => r.units} label={(r) => r.name} empty="No sales in the last 30 days yet." />
        </Card>
        <Card>
          <CardHeader title="Sales by category" sub="Last 30 days" />
          <BarList rows={d.topCategories} value={(r) => r.revenue} label={(r) => r.name} fmt={money} empty="No sales in the last 30 days yet." />
        </Card>
        <Card>
          <CardHeader title="How customers pay" sub="Last 30 days" />
          <BarList rows={d.payments} value={(r) => r.orders} label={(r) => `${PAY_METHOD[r.method]} · ${money(r.revenue)}`} empty="No orders in the last 30 days yet." />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Latest orders" action={<Link to="/admin/orders" className="text-xs font-semibold text-slate-500 hover:text-slate-900">View all →</Link>} />
          {d.recentOrders.length ? (
            <ul className="divide-y divide-slate-100">
              {d.recentOrders.map((o) => (
                <li key={o.id}><Link to={`/admin/orders/${o.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm hover:bg-slate-50">
                  <span className="w-28 font-semibold">#{o.order_number}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-600">{o.ship_name}</span>
                  <span className="text-xs text-slate-400">{timeAgo(o.created_at)}</span>
                  <OrderBadge status={o.status} />
                  <span className="w-20 text-right font-semibold tabular-nums">{money(o.total)}</span>
                </Link></li>
              ))}
            </ul>
          ) : <p className="px-5 py-8 text-center text-sm text-slate-500">No orders yet. They'll appear here as soon as customers check out.</p>}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Needs attention" />
            <ul className="divide-y divide-slate-100 text-sm">
              <li><Link to="/admin/products?stock=out" className="flex justify-between px-5 py-2.5 hover:bg-slate-50"><span>Out of stock</span><b className={d.products.outOfStock ? "text-red-600" : ""}>{d.products.outOfStock}</b></Link></li>
              <li><Link to="/admin/products?stock=low" className="flex justify-between px-5 py-2.5 hover:bg-slate-50"><span>Running low</span><b className={d.products.lowStock ? "text-amber-700" : ""}>{d.products.lowStock}</b></Link></li>
              <li><Link to="/admin/messages?status=new" className="flex justify-between px-5 py-2.5 hover:bg-slate-50"><span>Unread messages</span><b>{d.messages.unread}</b></Link></li>
              <li><Link to="/admin/products?status=active" className="flex justify-between px-5 py-2.5 hover:bg-slate-50"><span>Products on sale</span><b>{d.products.active}</b></Link></li>
            </ul>
            {d.lowStock.length > 0 && (
              <div className="border-t border-slate-100 px-5 py-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Restock soon</div>
                {d.lowStock.map((p) => <Link key={p.id} to={`/admin/products/${p.id}`} className="flex justify-between py-1 text-sm hover:underline"><span className="truncate pr-3">{p.name}</span><span className={p.stock === 0 ? "font-semibold text-red-600" : "text-amber-700"}>{p.stock} left</span></Link>)}
              </div>
            )}
          </Card>
          <Card>
            <CardHeader title="Recent activity" />
            <ul className="divide-y divide-slate-100">
              {d.activity.map((a, i) => <li key={i} className="px-5 py-2.5 text-sm"><b>{a.admin_name || "Someone"}</b> <span className="text-slate-600">{describe(a)}</span><div className="text-xs text-slate-400">{timeAgo(a.created_at)}</div></li>)}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
