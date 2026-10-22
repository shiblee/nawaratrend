import { useState } from "react";
import { adminApi } from "../../services/adminApi.js";
import { describe } from "../../components/admin/activity.js";
import { Alert, Card, PageHeader, Pager, Select, Table, dateTime, useLoad } from "../../components/admin/ui.jsx";

const ENTITIES = { "": "Everything", order: "Orders", product: "Products", category: "Categories", customer: "Customers", message: "Messages", admin: "Team & sign-ins", settings: "Settings" };

// show what changed, e.g. "price: 1499 → 1399"
function Details({ raw }) {
  const d = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  if (!d) return null;
  const changes = d.changes || d;
  const rows = Object.entries(changes).filter(([k]) => k !== "name" && k !== "changes");
  if (!rows.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
      {rows.slice(0, 6).map(([k, v]) => <span key={k}><b className="font-medium text-slate-600">{k.replace(/_/g, " ")}</b>: {Array.isArray(v) && v.length === 2 ? `${v[0] ?? "—"} → ${v[1] ?? "—"}` : typeof v === "object" ? JSON.stringify(v) : String(v)}</span>)}
    </div>
  );
}

export default function Activity() {
  const [entity, setEntity] = useState("");
  const [person, setPerson] = useState("");
  const [page, setPage] = useState(1);
  const team = useLoad(() => adminApi.getTeam().catch(() => []), []);
  const { data, error, loading } = useLoad(() => adminApi.getAudit({ entity, admin: person, page }), [entity, person, page]);
  return (
    <div>
      <PageHeader title="Activity log" sub="Every change made in the admin panel, and every sign-in, with who did it and from where. Entries can't be edited or deleted." />
      <Card>
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:max-w-xl">
          <Select value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }} aria-label="Area">{Object.entries(ENTITIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          <Select value={person} onChange={(e) => { setPerson(e.target.value); setPage(1); }} aria-label="Person">
            <option value="">Everyone</option>{(team.data || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </div>
        <Alert>{error}</Alert>
        <Table loading={loading && !data} empty={data && !data.rows.length && "Nothing recorded yet."} head={["When", "Who", "What", "From"]}>
          {data?.rows.map((r) => (
            <tr key={r.id} className="align-top hover:bg-slate-50">
              <td className="whitespace-nowrap px-4 py-3 text-slate-500">{dateTime(r.created_at)}</td>
              <td className="px-4 py-3"><div className="font-medium">{r.admin_name || "—"}</div><div className="text-xs text-slate-400">{r.admin_email}</div></td>
              <td className={`px-4 py-3 ${r.action.startsWith("login.") ? "text-red-700" : ""}`}>{describe(r)}<Details raw={r.details} /></td>
              <td className="px-4 py-3 text-xs text-slate-400">{r.ip}</td>
            </tr>
          ))}
        </Table>
        {data && <Pager page={data.page} limit={data.limit} total={data.total} onPage={setPage} />}
      </Card>
    </div>
  );
}
