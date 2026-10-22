import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { adminApi } from "../../services/adminApi.js";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, OrderBadge, PayBadge, Select, Textarea, money, phone, dateTime, useConfirm, useLoad, useToast, ORDER_STATUS, PAY_METHOD, PAY_STATUS } from "../../components/admin/ui.jsx";

const ACTION_LABEL = { confirmed: "Confirm order", packed: "Mark packed", shipped: "Mark shipped", delivered: "Mark delivered", cancelled: "Cancel order", returned: "Mark returned" };

export default function OrderDetail() {
  const { id } = useParams();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: o, error, loading, reload } = useLoad(() => adminApi.getOrder(id), [id]);
  const [form, setForm] = useState({ courier: "", tracking_number: "", admin_notes: "", payment_status: "pending" });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (o) setForm({ courier: o.courier || "", tracking_number: o.tracking_number || "", admin_notes: o.admin_notes || "", payment_status: o.payment_status });
  }, [o]);

  if (loading && !o) return <div className="h-64 animate-pulse rounded-2xl bg-slate-200/60" />;
  if (error) return <Alert>{error}</Alert>;

  const move = async (status) => {
    const undoable = status === "cancelled" || status === "returned";
    if (undoable && !(await confirm({ title: `${ACTION_LABEL[status]}?`, text: "Items go back into stock and this can't be undone.", danger: true, ok: ACTION_LABEL[status] }))) return;
    if (status === "shipped" && !form.tracking_number && !(await confirm({ title: "Ship without a tracking number?", text: "You can add the courier and tracking number below so the customer can follow the parcel.", ok: "Ship anyway" }))) return;
    setBusy(status);
    try {
      await adminApi.updateOrder(id, { status, note: note || undefined, courier: form.courier, tracking_number: form.tracking_number });
      setNote(""); toast(`Order marked ${ORDER_STATUS[status][0].toLowerCase()}`); reload();
    } catch (e) { toast(e.message, "error"); } finally { setBusy(""); }
  };
  const save = async () => {
    setBusy("save");
    try { await adminApi.updateOrder(id, form); toast("Order details saved"); reload(); }
    catch (e) { toast(e.message, "error"); } finally { setBusy(""); }
  };

  const address = [o.ship_line1, o.ship_line2, `${o.ship_city}, ${o.ship_state} ${o.ship_pin}`].filter(Boolean);
  const wa = `https://wa.me/${o.ship_phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${o.ship_name.split(" ")[0]}, this is NawaraTrend about your order #${o.order_number}.`)}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/admin/orders" className="text-sm text-slate-500 hover:text-slate-900">← All orders</Link>
          <h2 className="mt-1 flex flex-wrap items-center gap-3 text-xl font-semibold">Order #{o.order_number} <OrderBadge status={o.status} /> <PayBadge status={o.payment_status} /></h2>
          <p className="text-sm text-slate-500">Placed {dateTime(o.created_at)} · {PAY_METHOD[o.payment_method]}{o.customer_id ? " · Registered customer" : " · Guest checkout"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={wa} target="_blank" rel="noreferrer"><Button variant="outline">WhatsApp customer</Button></a>
          <a href={`tel:${o.ship_phone}`}><Button variant="outline">Call</Button></a>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Items" sub={`${o.items.reduce((s, i) => s + i.qty, 0)} items`} />
            <ul className="divide-y divide-slate-100">
              {o.items.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    {i.product_id ? <Link to={`/admin/products/${i.product_id}`} className="font-medium hover:underline">{i.product_name}</Link> : <span className="font-medium">{i.product_name}</span>}
                    <div className="text-xs text-slate-500">{i.size ? `Size ${i.size} · ` : ""}{money(i.unit_price)} each{i.current_stock != null ? ` · ${i.current_stock} in stock now` : " · product removed"}</div>
                  </div>
                  <span className="tabular-nums text-slate-600">× {i.qty}</span>
                  <span className="w-24 text-right font-semibold tabular-nums">{money(i.line_total)}</span>
                </li>
              ))}
            </ul>
            <dl className="space-y-1.5 border-t border-slate-100 px-5 py-4 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd className="tabular-nums">{money(o.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Delivery</dt><dd className="tabular-nums">{o.delivery_fee ? money(o.delivery_fee) : "Free"}</dd></div>
              <div className="flex justify-between border-t border-dashed border-slate-200 pt-2 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{money(o.total)}</dd></div>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Update status" sub={o.nextStatuses.length ? "Moves follow the order's journey: confirm → pack → ship → deliver." : "This order is closed."} />
            <div className="space-y-4 px-5 py-4">
              {o.nextStatuses.length > 0 && <>
                <Field label="Note for the timeline" hint="(optional, e.g. 'Called customer, confirmed address')">
                  <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} />
                </Field>
                <div className="flex flex-wrap gap-2">
                  {o.nextStatuses.map((s) => (
                    <Button key={s} variant={s === "cancelled" || s === "returned" ? "outline" : "primary"} loading={busy === s} onClick={() => move(s)}
                      className={s === "cancelled" || s === "returned" ? "!text-red-600" : ""}>{ACTION_LABEL[s]}</Button>
                  ))}
                </div>
              </>}
              <ol className="relative space-y-4 border-l-2 border-slate-200 pl-5">
                {o.history.map((h, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-[#15203B]" />
                    <div className="flex flex-wrap items-center gap-2 text-sm"><OrderBadge status={h.status} /><span className="text-slate-500">{dateTime(h.created_at)}</span><span className="text-slate-400">by {h.admin_name || "customer"}</span></div>
                    {h.note && <p className="mt-1 text-sm text-slate-700">{h.note}</p>}
                  </li>
                ))}
              </ol>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Deliver to" />
            <div className="space-y-1 px-5 py-4 text-sm">
              <div className="font-semibold">{o.ship_name}</div>
              {address.map((l, i) => <div key={i} className="text-slate-600">{l}</div>)}
              <div className="pt-2 text-slate-600">{phone(o.ship_phone)}{o.ship_email ? ` · ${o.ship_email}` : ""}</div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Customer" />
            <div className="px-5 py-4 text-sm">
              {o.customer ? (
                <div className="space-y-1">
                  <Link to={`/admin/customers/${o.customer.id}`} className="font-semibold hover:underline">{o.customer.name}</Link>
                  <div className="text-slate-500">{o.customer.email || phone(o.customer.phone)}</div>
                  <div className="text-slate-500">{o.customer.orders} order{o.customer.orders === 1 ? "" : "s"} · {money(o.customer.spent)} spent · since {new Date(o.customer.created_at).getFullYear()}</div>
                </div>
              ) : <p className="text-slate-500">Guest checkout (no account). {o.ip && <span className="text-xs">IP {o.ip}</span>}</p>}
            </div>
          </Card>

          <Card>
            <CardHeader title="Payment, shipping and notes" />
            <div className="space-y-4 px-5 py-4">
              <Field label="Payment status">
                <Select value={form.payment_status} onChange={(e) => setForm({ ...form, payment_status: e.target.value })}>
                  {Object.entries(PAY_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
                </Select>
              </Field>
              {o.payment_method === "cod" && <p className="-mt-2 text-xs text-slate-500">Cash on Delivery is marked paid automatically when the order is delivered.</p>}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Courier"><Input value={form.courier} maxLength={60} placeholder="e.g. Delhivery" onChange={(e) => setForm({ ...form, courier: e.target.value })} /></Field>
                <Field label="Tracking number"><Input value={form.tracking_number} maxLength={80} onChange={(e) => setForm({ ...form, tracking_number: e.target.value })} /></Field>
              </div>
              <Field label="Private notes" hint="(only your team sees these)"><Textarea value={form.admin_notes} maxLength={2000} onChange={(e) => setForm({ ...form, admin_notes: e.target.value })} /></Field>
              <Button onClick={save} loading={busy === "save"} className="w-full">Save</Button>
              {o.tracking_number && <Badge tone="blue">Customer sees: {o.courier || "Courier"} {o.tracking_number}</Badge>}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
