import { useState } from "react";
import { adminApi } from "../../services/adminApi.js";
import { useAdminAuth } from "../../context/AdminAuthContext.jsx";
import { Alert, Badge, Button, Card, PageHeader, Pager, SearchBox, Tabs, dateTime, useConfirm, useDebounced, useLoad, useToast } from "../../components/admin/ui.jsx";

const STATUS = { new: ["New", "amber"], read: ["Read", "gray"], replied: ["Replied", "green"], closed: ["Closed", "gray"] };
const TOPIC = { order: "Order & delivery", return: "Return or refund", product: "Product question", other: "Something else" };

export default function Messages() {
  const { can } = useAdminAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState("new");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);
  const [seen, setSeen] = useState(() => new Set());   // opened this visit: shown as read without reshuffling the list
  const q = useDebounced(search);
  const { data, error, loading, reload } = useLoad(() => adminApi.getMessages({ status, search: q, page, limit: 20 }), [status, q, page]);
  const counts = data?.statusCounts || {};

  const mark = async (m, s) => {
    try { await adminApi.updateMessage(m.id, s); toast(`Marked ${STATUS[s][0].toLowerCase()}`); reload(); } catch (e) { toast(e.message, "error"); }
  };
  const open = (m) => {
    setOpenId(openId === m.id ? null : m.id);
    if (m.status === "new" && !seen.has(m.id)) adminApi.updateMessage(m.id, "read").then(() => setSeen((s) => new Set(s).add(m.id))).catch(() => {});
  };
  const shown = (m) => (m.status === "new" && seen.has(m.id) ? "read" : m.status);
  const remove = async (m) => {
    if (!(await confirm({ title: "Delete this message?", text: "It will be removed permanently.", danger: true, ok: "Delete" }))) return;
    try { await adminApi.deleteMessage(m.id); toast("Message deleted"); reload(); } catch (e) { toast(e.message, "error"); }
  };
  const replyLink = (m) => m.contact.includes("@")
    ? `mailto:${m.contact}?subject=${encodeURIComponent("Re: your message to NawaraTrend")}`
    : `https://wa.me/91${m.contact.replace(/\D/g, "").slice(-10)}?text=${encodeURIComponent(`Hi ${m.name.split(" ")[0]}, thanks for contacting NawaraTrend.`)}`;

  return (
    <div>
      <PageHeader title="Messages" sub="Sent through the contact form on the store." />
      <Card>
        <div className="px-4 pt-2">
          <Tabs value={status} onChange={(s) => { setStatus(s); setPage(1); }}
            tabs={[...Object.entries(STATUS).map(([k, [l]]) => ({ value: k, label: l, count: counts[k] || 0 })), { value: "", label: "All" }]} />
        </div>
        <div className="border-b border-slate-100 p-4"><SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search name, contact, order number or text" /></div>
        <Alert>{error}</Alert>
        {loading && !data && <p className="p-8 text-center text-sm text-slate-400">Loading…</p>}
        {data && !data.rows.length && <p className="p-8 text-center text-sm text-slate-500">No messages here.</p>}
        <ul className="divide-y divide-slate-100">
          {data?.rows.map((m) => (
            <li key={m.id}>
              <button onClick={() => open(m)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-left hover:bg-slate-50">
                <span className={`min-w-0 flex-1 truncate ${shown(m) === "new" ? "font-semibold" : ""}`}>{m.name} <span className="font-normal text-slate-500">· {TOPIC[m.topic]}</span></span>
                <span className="w-full truncate text-sm text-slate-500 sm:w-auto sm:max-w-md">{m.message}</span>
                <Badge tone={STATUS[shown(m)][1]}>{STATUS[shown(m)][0]}</Badge>
                <span className="text-xs text-slate-400">{dateTime(m.created_at)}</span>
              </button>
              {openId === m.id && (
                <div className="space-y-3 bg-slate-50 px-5 py-4 text-sm">
                  <p className="whitespace-pre-wrap text-slate-800">{m.message}</p>
                  <p className="text-slate-500">From {m.contact}{m.order_ref ? ` · Order ${m.order_ref}` : ""}</p>
                  <div className="flex flex-wrap gap-2">
                    <a href={replyLink(m)} target="_blank" rel="noreferrer"><Button size="sm">Reply by {m.contact.includes("@") ? "email" : "WhatsApp"}</Button></a>
                    {m.status !== "replied" && <Button size="sm" variant="outline" onClick={() => mark(m, "replied")}>Mark replied</Button>}
                    {m.status !== "closed" && <Button size="sm" variant="outline" onClick={() => mark(m, "closed")}>Close</Button>}
                    {shown(m) !== "new" && <Button size="sm" variant="ghost" onClick={() => { setSeen((s) => { const n = new Set(s); n.delete(m.id); return n; }); mark(m, "new"); }}>Mark unread</Button>}
                    {can("owner", "manager") && <Button size="sm" variant="ghost" className="!text-red-600" onClick={() => remove(m)}>Delete</Button>}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
        {data && <Pager page={data.page} limit={data.limit} total={data.total} onPage={setPage} />}
      </Card>
    </div>
  );
}
