/* Customer insights shared by the customer list and a customer's page:
   - SignInHistory: every sign-in and sign-out (paged), with how they signed in, the device and how the session ended.
   - ViewedProducts: the products a customer opens most (signed-in visits only). */
import { useState } from "react";
import { Link } from "react-router-dom";
import { adminApi } from "../../services/adminApi.js";
import { Alert, Badge, Modal, Pager, money, num, dateTime, timeAgo, useLoad } from "./ui.jsx";

export const METHOD = { password: ["Password", "gray"], code: ["SMS code", "blue"], google: ["Google", "amber"], signup: ["New account", "green"],
  reset: ["Password reset", "gray"], renewed: ["Password changed", "gray"] };
export const MethodBadge = ({ m }) => m ? <Badge tone={METHOD[m]?.[1]}>{METHOD[m]?.[0] || m}</Badge> : <span className="text-xs text-slate-400">Not recorded</span>;
export const ENDED = { logout: "Signed out", logout_everywhere: "Signed out of all devices", password_reset: "Password reset", password_change: "Password changed", suspended: "Account suspended" };
export const device = (ua = "") => {
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return [br, os].filter(Boolean).join(" on ") || (ua ? "Browser" : "Unknown device");
};
const duration = (from, to) => {
  const m = Math.max(0, Math.round((new Date(to) - new Date(from)) / 60000));
  return m < 1 ? "under a minute" : m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ""}`.trim() : `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`;
};

/** How a session ended, in words, plus a badge. */
export function SessionEnd({ s }) {
  if (s.state === "active") return <div><Badge tone="green">Signed in now</Badge><div className="mt-1 text-xs text-slate-500">Last active {timeAgo(s.last_seen_at || s.created_at)}</div></div>;
  if (s.state === "expired") return <div><Badge>Timed out</Badge><div className="mt-1 text-xs text-slate-500">Last active {dateTime(s.last_seen_at || s.created_at)}</div></div>;
  return <div><div className="font-medium">{dateTime(s.revoked_at)}</div><div className="text-xs text-slate-500">{ENDED[s.revoke_reason] || s.revoke_reason}</div></div>;
}

export function SignInHistory({ customerId, name, open, onClose }) {
  const [page, setPage] = useState(1);
  const { data, error, loading } = useLoad(() => open ? adminApi.getCustomerSessions(customerId, { page, limit: 15 }) : Promise.resolve(null), [open, customerId, page]);
  const sum = data?.summary;
  return (
    <Modal open={open} onClose={() => { onClose(); setPage(1); }} wide title={`Sign-in history${name ? ` · ${name}` : ""}`}>
      <Alert>{error}</Alert>
      {sum && (
        <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {[["Sign-ins", num(data.total)], ["Signed in now", `${sum.active} device${sum.active === 1 ? "" : "s"}`], ["First sign-in", sum.first ? dateTime(sum.first) : "—"], ["Latest", sum.last ? timeAgo(sum.last) : "—"]].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-slate-50 px-3 py-2.5"><div className="text-xs text-slate-500">{k}</div><div className="mt-0.5 font-semibold text-slate-900">{v}</div></div>
          ))}
        </div>
      )}
      {sum && Object.keys(sum.methods).length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">How they sign in:
          {Object.entries(sum.methods).sort((a, b) => b[1] - a[1]).map(([m, n]) => <span key={m} className="inline-flex items-center gap-1"><MethodBadge m={m === "unknown" ? null : m} /><span className="tabular-nums">× {n}</span></span>)}
        </div>
      )}
      {loading && !data ? <div className="h-40 animate-pulse rounded-xl bg-slate-100" /> : data && !data.rows.length ? <p className="py-6 text-center text-sm text-slate-500">This customer hasn't signed in yet.</p> : data && (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-3 py-2.5 font-semibold">Signed in</th><th className="px-3 py-2.5 font-semibold">Signed out</th><th className="px-3 py-2.5 font-semibold">Stayed</th><th className="px-3 py-2.5 font-semibold">How</th><th className="px-3 py-2.5 font-semibold">Device</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.rows.map((s) => (
                <tr key={s.id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-2.5"><div className="font-medium">{dateTime(s.created_at)}</div>{s.remember && <div className="text-xs text-slate-500">"Remember me" on</div>}</td>
                  <td className="whitespace-nowrap px-3 py-2.5"><SessionEnd s={s} /></td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{s.state === "active" ? "—" : duration(s.created_at, s.state === "expired" ? (s.last_seen_at || s.created_at) : s.revoked_at)}</td>
                  <td className="px-3 py-2.5"><MethodBadge m={s.method} /></td>
                  <td className="px-3 py-2.5"><div>{device(s.user_agent)}</div>{s.ip && <div className="text-xs tabular-nums text-slate-500">{s.ip}</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.total > data.limit && <Pager page={data.page} limit={data.limit} total={data.total} onPage={setPage} />}
      <p className="mt-3 text-xs text-slate-400">"Timed out" means the customer closed the browser or stopped using the site and the session ran out, so the last activity is shown instead of a sign-out time. Sign-in methods are recorded from 24 Nov 2026.</p>
    </Modal>
  );
}

const Thumb = ({ src }) => (
  <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
    {src ? <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" /> : <span className="text-xs text-slate-400">—</span>}
  </span>
);

/** One product row: photo, name, code, visits bar, bought badge. */
export function ViewedRow({ v, max }) {
  return (
    <li className="flex items-center gap-3 px-5 py-2.5">
      <Thumb src={v.image} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link to={`/admin/products/${v.id}`} className="truncate font-medium hover:underline">{v.name}</Link>
          {v.bought > 0 && <Badge tone="green">Bought {v.bought}</Badge>}
          {v.status !== "active" && <Badge>Not on sale</Badge>}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-[#F2C12E]" style={{ width: `${Math.max(6, (v.views / max) * 100)}%` }} /></span>
          <span className="whitespace-nowrap text-xs text-slate-500">{v.code ? `${v.code} · ` : ""}{money(v.price)} · last {timeAgo(v.last_viewed_at)}</span>
        </div>
      </div>
      <div className="w-14 text-right"><div className="text-lg font-semibold tabular-nums text-slate-900">{num(v.views)}</div><div className="text-[11px] text-slate-500">{v.views === 1 ? "visit" : "visits"}</div></div>
    </li>
  );
}

export function ViewedProducts({ customerId, name, open, onClose }) {
  const [page, setPage] = useState(1);
  const { data, error, loading } = useLoad(() => open ? adminApi.getCustomerViews(customerId, { page, limit: 20 }) : Promise.resolve(null), [open, customerId, page]);
  const max = data?.rows.reduce((m, v) => Math.max(m, v.views), 1) || 1;
  return (
    <Modal open={open} onClose={() => { onClose(); setPage(1); }} wide title={`Products viewed${name ? ` · ${name}` : ""}`}>
      <Alert>{error}</Alert>
      {data && <p className="mb-3 text-sm text-slate-500">{num(data.stats.viewedProducts)} products, {num(data.stats.productVisits)} visits in total. Most visited first.</p>}
      {loading && !data ? <div className="h-40 animate-pulse rounded-xl bg-slate-100" /> : data && (
        data.rows.length ? <ul className="-mx-5 divide-y divide-slate-100 text-sm">{data.rows.map((v) => <ViewedRow key={v.id} v={v} max={max} />)}</ul>
          : <p className="py-6 text-center text-sm text-slate-500">No product visits recorded yet.</p>
      )}
      {data && data.total > data.limit && <Pager page={data.page} limit={data.limit} total={data.total} onPage={setPage} />}
      <p className="mt-3 text-xs text-slate-400">Counted while the customer is signed in (from 24 Nov 2026). Opening the same product again within 10 minutes counts as one visit. Customers who turned off analytics cookies aren't tracked.</p>
    </Modal>
  );
}
