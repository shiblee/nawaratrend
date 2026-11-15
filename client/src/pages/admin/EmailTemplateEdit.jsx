import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { adminApi } from "../../services/adminApi.js";
import { useAdminAuth } from "../../context/AdminAuthContext.jsx";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Textarea, Toggle, timeAgo, useConfirm, useDebounced, useLoad, useToast } from "../../components/admin/ui.jsx";

export default function EmailTemplateEdit() {
  const { key } = useParams();
  const toast = useToast();
  const confirm = useConfirm();
  const { admin } = useAdminAuth();
  const { data: t, error, reload } = useLoad(() => adminApi.getEmailTemplate(key), [key]);
  const [f, setF] = useState(null);
  const [enabled, setEnabled] = useState(true);
  const [preview, setPreview] = useState(null);
  const [view, setView] = useState("desktop");
  const [testTo, setTestTo] = useState("");
  const [busy, setBusy] = useState("");
  const [errors, setErrors] = useState([]);
  const lastField = useRef("html");
  const refs = { subject: useRef(null), html: useRef(null), text: useRef(null) };

  useEffect(() => { if (t) { setF({ subject: t.subject, html: t.html, text: t.text || "" }); setEnabled(t.enabled); } }, [t]);
  useEffect(() => { if (admin && !testTo) setTestTo(admin.email); }, [admin, testTo]);

  // live preview with sample data, a moment after typing stops
  const draft = useDebounced(f, 400);
  useEffect(() => {
    if (!draft) return;
    let live = true;
    adminApi.previewEmailTemplate(key, draft).then((p) => { if (live) { setPreview(p); setErrors(p.errors); } }).catch(() => {});
    return () => { live = false; };
  }, [draft, key]);

  if (error) return <Alert>{error}</Alert>;
  if (!t || !f) return <div className="h-64 animate-pulse rounded-2xl bg-slate-200/60" />;

  const dirty = f.subject !== t.subject || f.html !== t.html || f.text !== (t.text || "") || enabled !== t.enabled;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  // clicking a placeholder puts it where the cursor was in the last field used
  const insert = (name) => {
    const k = lastField.current, el = refs[k].current, tag = `{{${name}}}`;
    const start = el?.selectionStart ?? f[k].length, end = el?.selectionEnd ?? f[k].length;
    setF({ ...f, [k]: f[k].slice(0, start) + tag + f[k].slice(end) });
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + tag.length, start + tag.length); });
  };

  const save = async () => {
    setBusy("save");
    try { await adminApi.saveEmailTemplate(key, { ...f, enabled }); toast("Template saved. New emails use it from now on."); reload(); }
    catch (e) { setErrors(e.errors || [e.message]); toast(e.message, "error"); } finally { setBusy(""); }
  };
  const test = async () => {
    setBusy("test");
    try {
      const r = await adminApi.testEmailTemplate(key, { ...f, to: testTo });
      toast(r.status === "sent" ? `Test email sent to ${testTo}` : `Test email ${r.status}${r.last_error ? `: ${r.last_error}` : ""}`, r.status === "sent" ? "ok" : "error");
    } catch (e) { toast(e.message, "error"); } finally { setBusy(""); }
  };
  const restore = async () => {
    if (!(await confirm({ title: "Restore the default wording?", text: "Your edits to this email's subject and text are replaced with the original version. Whether it's on or off stays the same.", ok: "Restore default" }))) return;
    setBusy("reset");
    try { await adminApi.resetEmailTemplate(key); toast("Default wording restored"); reload(); } catch (e) { toast(e.message, "error"); } finally { setBusy(""); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to="/admin/emails" className="text-sm text-slate-500 hover:text-slate-900">← All emails</Link>
          <h2 className="mt-1 flex flex-wrap items-center gap-3 text-xl font-semibold">{t.name} {t.customised ? <Badge tone="violet">Edited</Badge> : <Badge>Default wording</Badge>}</h2>
          <p className="text-sm text-slate-500">{t.description}{t.updated_at && ` Last changed ${timeAgo(t.updated_at)}${t.updated_by_name ? ` by ${t.updated_by_name}` : ""} (version ${t.version}).`}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {t.essential ? <Badge tone="blue">Always on</Badge> : <Toggle checked={enabled} onChange={setEnabled} label={enabled ? "On" : "Off"} />}
          <Button variant="outline" onClick={restore} loading={busy === "reset"} disabled={!t.customised}>Restore default</Button>
          <Button variant="gold" onClick={save} loading={busy === "save"} disabled={!dirty}>Save</Button>
        </div>
      </div>

      {errors.length > 0 && <Alert><b>Please fix before saving:</b><ul className="mt-1 list-disc pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul></Alert>}

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Content" sub="Use the placeholders below to fill in the customer's details. Plain {{name}} values are made safe automatically." />
            <div className="space-y-4 p-5">
              <Field label="Subject"><Input ref={refs.subject} value={f.subject} maxLength={255} onChange={set("subject")} onFocus={() => { lastField.current = "subject"; }} /></Field>
              <Field label="Email body (HTML)" hint="(the branded header and footer are added around it)">
                <Textarea ref={refs.html} value={f.html} onChange={set("html")} onFocus={() => { lastField.current = "html"; }} rows={16} spellCheck={false} className="font-mono text-xs leading-relaxed" />
              </Field>
              <Field label="Plain-text version" hint="(optional; leave empty to make it from the HTML automatically)">
                <Textarea ref={refs.text} value={f.text} onChange={set("text")} onFocus={() => { lastField.current = "text"; }} rows={5} spellCheck={false} className="font-mono text-xs" />
              </Field>
            </div>
          </Card>
          <Card>
            <CardHeader title="Placeholders" sub="Click one to insert it where your cursor is. Show a part only when a value exists with {{#if name}} … {{/if}}." />
            <ul className="grid gap-x-4 gap-y-1.5 p-5 text-sm sm:grid-cols-2">
              {t.placeholders.map((p) => (
                <li key={p.name}><button type="button" onClick={() => insert(p.name)} className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800 hover:bg-amber-100">{`{{${p.name}}}`}</button> <span className="text-xs text-slate-500">{p.help}</span></li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="xl:sticky xl:top-20">
            <CardHeader title="Preview" sub="With sample customer and order details"
              action={<div className="flex gap-1">{["desktop", "mobile", "text"].map((v) => <Button key={v} size="sm" variant={view === v ? "primary" : "outline"} onClick={() => setView(v)}>{v === "text" ? "Plain text" : v[0].toUpperCase() + v.slice(1)}</Button>)}</div>} />
            <div className="space-y-3 p-5">
              <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm"><span className="text-slate-500">Subject:</span> <b>{preview?.subject}</b></div>
              {view === "text"
                ? <pre className="h-[560px] overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs">{preview?.text}</pre>
                // no sandbox permissions: the template's HTML can't run scripts or touch the admin panel
                : <div className="flex justify-center rounded-xl bg-slate-100 p-2"><iframe title="Email preview" sandbox="" srcDoc={preview?.html || ""} className={`h-[560px] rounded-lg border border-slate-200 bg-white ${view === "mobile" ? "w-[375px]" : "w-full"}`} /></div>}
              <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
                <Field label="Send a test to" hint="(a team member's email)" className="min-w-[220px] flex-1"><Input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} /></Field>
                <Button variant="outline" onClick={test} loading={busy === "test"} disabled={errors.length > 0}>Send test email</Button>
              </div>
              <p className="text-xs text-slate-500">The test uses what's in the editor now, even before you save, with sample details.</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
