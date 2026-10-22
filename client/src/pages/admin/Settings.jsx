import { useEffect, useState } from "react";
import { adminApi } from "../../services/adminApi.js";
import { useAdminAuth } from "../../context/AdminAuthContext.jsx";
import { Alert, Button, Card, CardHeader, Field, Input, PageHeader, Textarea, Toggle, money, useLoad, useToast } from "../../components/admin/ui.jsx";

export default function Settings() {
  const { can } = useAdminAuth();
  const canEdit = can("owner", "manager");
  const toast = useToast();
  const { data, error, reload } = useLoad(() => adminApi.getSettings(), []);
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { if (data) setF({ ...data }); }, [data]);
  if (error && !f) return <Alert>{error}</Alert>;
  // the loaded settings are copied into the form one render later, so wait for that too
  if (!f) return <div className="h-64 animate-pulse rounded-2xl bg-slate-200/60" />;
  const waDigits = String(f.whatsapp || "").replace(/\D/g, "");
  const waLink = waDigits.length >= 10 ? `https://wa.me/${waDigits.length === 10 ? "91" + waDigits : waDigits}${f.whatsapp_message ? `?text=${encodeURIComponent(f.whatsapp_message)}` : ""}` : "";
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });

  const save = async (e) => {
    e.preventDefault(); setSaving(true); setErr("");
    try { await adminApi.updateSettings(f); toast("Settings saved. The store uses them right away."); reload(); }
    catch (e2) { setErr(e2.message); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={save}>
      <PageHeader title="Settings" sub="Store-wide rules. The shop, cart and checkout read these directly."
        actions={canEdit && <Button variant="gold" loading={saving}>Save settings</Button>} />
      {!canEdit && <div className="mb-4"><Alert type="warn">Only owners and managers can change settings.</Alert></div>}
      <div className="mb-4"><Alert>{err}</Alert></div>
      <fieldset disabled={!canEdit} className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Delivery" />
          <div className="space-y-4 p-5">
            <Field label="Free delivery on orders from (₹)"><Input type="number" min="0" value={f.free_shipping_threshold} onChange={set("free_shipping_threshold")} /></Field>
            <Field label="Delivery charge below that (₹)"><Input type="number" min="0" value={f.delivery_fee} onChange={set("delivery_fee")} /></Field>
            <p className="text-sm text-slate-500">Orders of {money(f.free_shipping_threshold)} or more ship free; smaller orders pay {money(f.delivery_fee)}.
              Remember to update the Shipping Policy page if you change these.</p>
          </div>
        </Card>
        <Card>
          <CardHeader title="Payments" />
          <div className="space-y-4 p-5">
            <Toggle checked={!!f.cod_enabled} onChange={set("cod_enabled")} label="Offer Cash on Delivery at checkout" disabled={!canEdit} />
            <p className="text-sm text-slate-500">UPI and card orders are recorded as unpaid until a payment gateway (e.g. Razorpay) is connected; mark them paid on the order page once you've received the money.</p>
          </div>
        </Card>
        <Card>
          <CardHeader title="WhatsApp" sub="Used by the floating chat button and every WhatsApp link on the store" />
          <div className="space-y-4 p-5">
            <Field label="WhatsApp number"><Input value={f.whatsapp} onChange={set("whatsapp")} placeholder="+91 98075 62620" /></Field>
            <Field label="Greeting message" hint="(pre-filled when a customer opens the chat)"><Textarea value={f.whatsapp_message} onChange={set("whatsapp_message")} maxLength={300} /></Field>
            <Toggle checked={!!f.whatsapp_enabled} onChange={set("whatsapp_enabled")} label="Show the floating WhatsApp button on every page" disabled={!canEdit} />
            {waLink && <a href={waLink} target="_blank" rel="noreferrer" className="inline-block text-sm font-semibold text-emerald-700 underline">Test the chat link ↗</a>}
          </div>
        </Card>
        <Card>
          <CardHeader title="Store details" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Store name"><Input value={f.store_name} onChange={set("store_name")} /></Field>
            <Field label="Phone"><Input value={f.phone} onChange={set("phone")} /></Field>
            <Field label="Address" className="sm:col-span-2"><Textarea value={f.address} onChange={set("address")} /></Field>
          </div>
        </Card>
      </fieldset>
    </form>
  );
}
