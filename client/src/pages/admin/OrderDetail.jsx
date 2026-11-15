import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { adminApi } from "../../services/adminApi.js";
import { BASE_URL } from "../../services/api.js";
import { useAdminAuth } from "../../context/AdminAuthContext.jsx";
import { Alert, Badge, Button, Card, CardHeader, EmailBadge, Field, Input, Modal, OrderBadge, PayBadge, Select, Textarea, money, phone, dateTime, initials,
  useLoad, useToast, ORDER_STATUS, PAY_METHOD, PAY_STATUS } from "../../components/admin/ui.jsx";

const ACTION_LABEL = {
  confirmed: "Confirm order", on_hold: "Put on hold", packed: "Mark packed", shipped: "Mark shipped", out_for_delivery: "Out for delivery",
  delivery_failed: "Delivery failed", delivered: "Mark delivered", return_requested: "Return requested", returned: "Mark returned", cancelled: "Cancel order",
};
const DANGER = ["cancelled", "returned", "delivery_failed"];
const SHIPPING_STEP = ["shipped", "out_for_delivery"];
const ACTOR = { admin: "", customer: "the customer", guest: "guest checkout", system: "the system" };
const FIELD_LABEL = {
  status: "Status", payment_status: "Payment", courier: "Courier", tracking_number: "Tracking number", tracking_url: "Tracking link",
  expected_delivery: "Expected delivery", admin_notes: "Private notes", message: "Message to customer", internal_note: "Internal note",
  restocked: "Items put back in stock", by: "Placed by", total: "Total", payment: "Payment method",
};
const label = (k, v) => (k === "status" ? ORDER_STATUS[v]?.[0] : k === "payment_status" ? PAY_STATUS[v]?.[0] : k === "payment" ? PAY_METHOD[v] : null) || (v === true ? "yes" : v ?? "—");
const assetUrl = (p) => (p ? BASE_URL.replace(/\/api\/?$/, "") + p : "");
const ymd = (v) => (v ? new Date(v).toLocaleDateString("en-CA") : "");

function ChangeDetails({ raw }) {
  const d = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return {}; } })() : raw || {};
  const rows = Object.entries(d).filter(([k]) => FIELD_LABEL[k]);
  if (!rows.length) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
      {rows.map(([k, v]) => (
        <li key={k}><b className="font-medium text-slate-700">{FIELD_LABEL[k]}:</b>{" "}
          {Array.isArray(v) && v.length === 2 ? <>{String(label(k, v[0]))} → {String(label(k, v[1]))}</> : String(label(k, v))}</li>
      ))}
    </ul>
  );
}

export default function OrderDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { can } = useAdminAuth();
  const isManager = can("owner", "manager");
  const { data: o, error, loading, reload } = useLoad(() => adminApi.getOrder(id), [id]);
  const [form, setForm] = useState({ courier: "", tracking_number: "", tracking_url: "", expected_delivery: "", admin_notes: "", payment_status: "pending" });
  const [notifyPay, setNotifyPay] = useState(true);
  const [step, setStep] = useState(null);   // the status being moved to (opens the dialog)
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (o) setForm({ courier: o.courier || "", tracking_number: o.tracking_number || "", tracking_url: o.tracking_url || "",
      expected_delivery: ymd(o.expected_delivery), admin_notes: o.admin_notes || "", payment_status: o.payment_status });
  }, [o]);

  if (loading && !o) return <div className="h-64 animate-pulse rounded-2xl bg-slate-200/60" />;
  if (error) return <Alert>{error}</Alert>;

  const save = async () => {
    setBusy("save");
    try {
      const r = await adminApi.updateOrder(id, { ...form, notify: notifyPay });
      toast(r.emailed?.length ? "Saved, and the customer has been emailed" : "Order details saved"); reload();
    } catch (e) { toast(e.message, "error"); } finally { setBusy(""); }
  };
  const retry = async (emailId) => {
    try { const r = await adminApi.retryEmail(emailId); toast(r.status === "sent" ? "Email sent" : `Email ${r.status}${r.last_error ? `: ${r.last_error}` : ""}`, r.status === "sent" ? "ok" : "error"); reload(); }
    catch (e) { toast(e.message, "error"); }
  };

  const address = [o.ship_line1, o.ship_line2, `${o.ship_city}, ${o.ship_state} ${o.ship_pin}`].filter(Boolean);
  const wa = `https://wa.me/${o.ship_phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${o.ship_name.split(" ")[0]}, this is NawaraTrend about your order #${o.order_number}.`)}`;
  const refundLocked = !isManager;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/admin/orders" className="text-sm text-slate-500 hover:text-slate-900">← All orders</Link>
          <h2 className="mt-1 flex flex-wrap items-center gap-3 text-xl font-semibold">Order #{o.order_number} <OrderBadge status={o.status} /> <PayBadge status={o.payment_status} /></h2>
          <p className="text-sm text-slate-500">Placed {dateTime(o.created_at)} · {PAY_METHOD[o.payment_method]}{o.customer_id ? " · Registered customer" : " · Guest checkout"}
            {" · "}{o.emailTo ? <>Updates go to {o.emailTo}</> : <span className="text-amber-700">No email address: the customer can't be emailed</span>}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/track?order=${o.order_number}`} target="_blank" rel="noreferrer"><Button variant="outline">Customer's tracking page ↗</Button></a>
          <a href={wa} target="_blank" rel="noreferrer"><Button variant="outline">WhatsApp</Button></a>
          <a href={`tel:${o.ship_phone}`}><Button variant="outline">Call</Button></a>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Update status" sub={o.nextStatuses.length ? "Each step is added to the customer's tracking timeline, and emailed if that email is on." : "This order is closed."} />
            {o.nextStatuses.length > 0 && (
              <div className="flex flex-wrap gap-2 px-5 py-4">
                {o.nextStatuses.map((s) => (
                  <Button key={s} variant={DANGER.includes(s) ? "outline" : "primary"} onClick={() => setStep(s)} className={DANGER.includes(s) ? "!text-red-600" : ""}>
                    {ACTION_LABEL[s]}{o.emailFor?.[s] && o.emailTo ? <span className="text-xs opacity-70">✉</span> : null}
                  </Button>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Order timeline" sub="What the customer sees on their tracking page, plus your team's private notes" />
            <ol className="relative mx-5 my-4 space-y-5 border-l-2 border-slate-200 pl-5">
              {[...o.history].reverse().map((h) => (
                <li key={h.id} className="relative">
                  <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-[#15203B]" />
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <OrderBadge status={h.status} />
                    {h.from_status && <span className="text-xs text-slate-400">from {ORDER_STATUS[h.from_status]?.[0] || h.from_status}</span>}
                    <span className="text-slate-500">{dateTime(h.created_at)}</span>
                    <span className="text-slate-400">by {h.admin_name || ACTOR[h.actor] || "the customer"}</span>
                  </div>
                  {h.note && <p className="mt-1.5 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900"><span className="mr-1 text-xs font-semibold uppercase tracking-wide text-blue-700">Customer sees</span> {h.note}</p>}
                  {h.internal_note && <p className="mt-1.5 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"><span className="mr-1 text-xs font-semibold uppercase tracking-wide text-amber-700">Team only</span> {h.internal_note}</p>}
                </li>
              ))}
            </ol>
          </Card>

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
            <CardHeader title="Emails to the customer" sub="Every email sent about this order" action={isManager && <Link to={`/admin/emails?order=${o.id}`} className="text-sm font-medium text-slate-600 hover:underline">Open in email log →</Link>} />
            {o.emails.length ? (
              <ul className="divide-y divide-slate-100 text-sm">
                {o.emails.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{e.subject}</div>
                      <div className="text-xs text-slate-500">{dateTime(e.created_at)} · to {e.recipient}{e.attempts > 1 ? ` · ${e.attempts} attempts` : ""}</div>
                      {e.last_error && <div className="mt-0.5 text-xs text-red-600">{e.last_error}</div>}
                    </div>
                    <EmailBadge status={e.status} />
                    {isManager && ["failed", "skipped", "sent"].includes(e.status) && (
                      <Button size="sm" variant="outline" onClick={() => retry(e.id)}>{e.status === "sent" ? "Resend" : "Retry"}</Button>
                    )}
                  </li>
                ))}
              </ul>
            ) : <p className="px-5 py-4 text-sm text-slate-500">{o.emailTo ? "No emails yet." : "No email address on this order, so no emails can be sent."}</p>}
          </Card>

          <Card>
            <CardHeader title="Change log" sub="Every change to this order, who made it and when. Entries can't be edited or deleted." />
            <ul className="divide-y divide-slate-100 text-sm">
              {o.changes.length ? o.changes.map((c) => (
                <li key={c.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{c.admin_name || (c.action === "order.create" ? "Customer" : "System")}</span>
                    <span className="text-slate-500">{c.action === "order.create" ? "placed the order" : c.action === "orders.export" ? "exported orders" : "updated the order"}</span>
                    <span className="text-xs text-slate-400">{dateTime(c.created_at)}{c.ip ? ` · ${c.ip}` : ""}</span></div>
                  <ChangeDetails raw={c.details} />
                </li>
              )) : <li className="px-5 py-4 text-slate-500">No changes recorded yet.</li>}
            </ul>
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
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#F4A300] font-semibold text-[#15203B]">
                    {o.customer.avatar ? <img src={assetUrl(o.customer.avatar)} alt="" className="h-full w-full object-cover" /> : initials(o.customer.name)}
                  </span>
                  <div className="min-w-0 space-y-0.5">
                    <Link to={`/admin/customers/${o.customer.id}`} className="font-semibold hover:underline">{o.customer.name}</Link>
                    <div className="truncate text-slate-500">{o.customer.email || phone(o.customer.phone)}</div>
                    <div className="text-slate-500">{o.customer.orders} order{o.customer.orders === 1 ? "" : "s"} · {money(o.customer.spent)} spent · since {new Date(o.customer.created_at).getFullYear()}</div>
                  </div>
                </div>
              ) : <p className="text-slate-500">Guest checkout (no account). {o.ip && <span className="text-xs">IP {o.ip}</span>}</p>}
            </div>
          </Card>

          <Card>
            <CardHeader title="Payment, shipping and notes" />
            <div className="space-y-4 px-5 py-4">
              <Field label="Payment status">
                <Select value={form.payment_status} onChange={(e) => setForm({ ...form, payment_status: e.target.value })}>
                  {Object.entries(PAY_STATUS).map(([k, [l]]) => (
                    <option key={k} value={k} disabled={refundLocked && (k === "refund_pending" || k === "refunded") && k !== o.payment_status}>{l}{refundLocked && (k === "refund_pending" || k === "refunded") ? " (owners & managers)" : ""}</option>
                  ))}
                </Select>
              </Field>
              {o.payment_method === "cod" && <p className="-mt-2 text-xs text-slate-500">Cash on Delivery is marked paid automatically when the order is delivered.</p>}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Courier"><Input value={form.courier} maxLength={60} placeholder="e.g. Delhivery" onChange={(e) => setForm({ ...form, courier: e.target.value })} /></Field>
                <Field label="Tracking number"><Input value={form.tracking_number} maxLength={80} onChange={(e) => setForm({ ...form, tracking_number: e.target.value })} /></Field>
              </div>
              <Field label="Tracking link" hint="(courier's page for this parcel)"><Input type="url" value={form.tracking_url} maxLength={255} placeholder="https://" onChange={(e) => setForm({ ...form, tracking_url: e.target.value })} /></Field>
              <Field label="Expected delivery"><Input type="date" value={form.expected_delivery} onChange={(e) => setForm({ ...form, expected_delivery: e.target.value })} /></Field>
              <Field label="Private notes" hint="(only your team sees these)"><Textarea value={form.admin_notes} maxLength={2000} onChange={(e) => setForm({ ...form, admin_notes: e.target.value })} /></Field>
              {form.payment_status !== o.payment_status && ["paid", "refund_pending", "refunded"].includes(form.payment_status) && o.emailTo && (
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={notifyPay} onChange={(e) => setNotifyPay(e.target.checked)} /> Email the customer about this payment change</label>
              )}
              <Button onClick={save} loading={busy === "save"} className="w-full">Save</Button>
              {o.tracking_number && <Badge tone="blue">Customer sees: {o.courier || "Courier"} {o.tracking_number}</Badge>}
            </div>
          </Card>
        </div>
      </div>

      {step && <StatusDialog order={o} status={step} form={form} onClose={() => setStep(null)} onDone={(msg) => { setStep(null); toast(msg); reload(); }} />}
    </div>
  );
}

/** The "move this order on" dialog: message for the customer, private note, tracking details and whether to email. */
function StatusDialog({ order: o, status, form, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ note: "", internal_note: "", courier: form.courier, tracking_number: form.tracking_number, tracking_url: form.tracking_url, expected_delivery: form.expected_delivery });
  const emailOn = !!o.emailFor?.[status];
  const [notify, setNotify] = useState(emailOn && !!o.emailTo);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const shipping = SHIPPING_STEP.includes(status);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async () => {
    setBusy(true); setErr("");
    try {
      const body = { status, note: f.note || undefined, internal_note: f.internal_note || undefined, notify };
      if (shipping) Object.assign(body, { courier: f.courier, tracking_number: f.tracking_number, tracking_url: f.tracking_url, expected_delivery: f.expected_delivery });
      const r = await adminApi.updateOrder(o.id, body);
      onDone(`Order marked ${ORDER_STATUS[status][0].toLowerCase()}${r.emailed?.length ? " and the customer emailed" : ""}`);
    } catch (e) { setErr(e.message); toast(e.message, "error"); } finally { setBusy(false); }
  };

  return (
    <Modal open title={`${ACTION_LABEL[status]}: #${o.order_number}`} onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button variant={DANGER.includes(status) ? "danger" : "primary"} loading={busy} onClick={submit}>{ACTION_LABEL[status]}</Button></>}>
      <div className="space-y-4">
        <Alert>{err}</Alert>
        {(status === "cancelled" || status === "returned") && <Alert type="warn">The items go back into stock, and this can't be undone.</Alert>}
        {shipping && (
          <div className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
            <Field label="Courier"><Input value={f.courier} maxLength={60} placeholder="e.g. Delhivery" onChange={set("courier")} /></Field>
            <Field label="Tracking number"><Input value={f.tracking_number} maxLength={80} onChange={set("tracking_number")} /></Field>
            <Field label="Tracking link" className="sm:col-span-2"><Input type="url" value={f.tracking_url} maxLength={255} placeholder="https://" onChange={set("tracking_url")} /></Field>
            <Field label="Expected delivery"><Input type="date" value={f.expected_delivery} onChange={set("expected_delivery")} /></Field>
            {status === "shipped" && !f.tracking_number && <p className="self-end text-xs text-amber-700">No tracking number yet: the customer won't be able to follow the parcel.</p>}
          </div>
        )}
        <Field label="Message for the customer" hint="(optional; on their tracking page and in the email)">
          <Textarea value={f.note} maxLength={500} onChange={set("note")} placeholder="e.g. Packed with care. Your parcel leaves our Lucknow warehouse today." />
        </Field>
        <Field label="Internal note" hint="(optional; only your team sees it)">
          <Textarea value={f.internal_note} maxLength={1000} onChange={set("internal_note")} placeholder="e.g. Called customer to confirm the address." />
        </Field>
        {o.emailTo ? (
          emailOn
            ? <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Email the customer ({o.emailTo})</label>
            : <p className="text-xs text-slate-500">No email for this step: the "{ORDER_STATUS[status][0]}" email is turned off{STATUS_HAS_EMAIL.includes(status) ? " in Emails → Templates" : ""}.</p>
        ) : <p className="text-xs text-slate-500">This order has no email address, so the customer won't be emailed. They can still see the update on the tracking page.</p>}
      </div>
    </Modal>
  );
}
const STATUS_HAS_EMAIL = ["confirmed", "on_hold", "packed", "shipped", "out_for_delivery", "delivery_failed", "delivered", "return_requested", "returned", "cancelled"];
