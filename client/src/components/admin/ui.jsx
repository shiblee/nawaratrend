/* Shared building blocks for the admin panel (Tailwind). Brand colours: ink #15203B, marigold #F4A300. */
import { createContext, forwardRef, useCallback, useContext, useEffect, useState } from "react";

/* ---------- formatting ---------- */
export const money = (v) => "₹" + Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
export const num = (v) => Number(v || 0).toLocaleString("en-IN");
export const dateTime = (v) => (v ? new Date(v).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—");
export const dateOnly = (v) => (v ? new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
export function timeAgo(v) {
  if (!v) return "never";
  const s = Math.round((Date.now() - new Date(v)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return dateOnly(v);
}
/** +919876543210 → +91 98765 43210 */
export const phone = (v) => { const d = String(v || "").replace(/\D/g, "").slice(-10); return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : v || ""; };
export const initials = (name = "") => name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "A";

/* ---------- data loading ---------- */
/** Runs `fn` when `deps` change; returns { data, error, loading, reload }. */
export function useLoad(fn, deps) {
  const [state, setState] = useState({ data: null, error: "", loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: "" }));
    fn().then((data) => live && setState({ data, error: "", loading: false }))
      .catch((e) => live && setState((s) => ({ ...s, error: e.message, loading: false })));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: useCallback(() => setTick((t) => t + 1), []) };
}

/* ---------- toasts ---------- */
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((text, type = "ok") => {
    const id = Math.random();
    setItems((xs) => [...xs, { id, text, type }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${t.type === "error" ? "bg-red-600" : "bg-[#15203B]"}`}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ---------- basics ---------- */
export function Button({ variant = "primary", size = "md", className = "", loading, children, ...props }) {
  const v = {
    primary: "bg-[#15203B] text-white hover:bg-[#22305A]",
    gold: "bg-[#F4A300] text-[#15203B] hover:brightness-95",
    outline: "border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50",
    danger: "bg-red-600 text-white hover:bg-red-700",
    ghost: "text-slate-600 hover:bg-slate-100",
  }[variant];
  const s = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2 text-sm" }[size];
  return (
    <button {...props} disabled={props.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${v} ${s} ${className}`}>
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export const Card = ({ className = "", children, ...p }) => <div {...p} className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>;

export function CardHeader({ title, sub, action }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div><h3 className="font-semibold text-slate-900">{title}</h3>{sub && <p className="text-xs text-slate-500">{sub}</p>}</div>
      {action}
    </div>
  );
}

export function PageHeader({ title, sub, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><h2 className="text-xl font-semibold text-slate-900">{title}</h2>{sub && <p className="mt-1 text-sm text-slate-500">{sub}</p>}</div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, hint, error, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}{hint && <span className="ml-1 font-normal text-slate-400">{hint}</span>}</span>
      {children}
      {error && <span className="mt-1 block text-xs font-medium text-red-600">{error}</span>}
    </label>
  );
}
const inputCls = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#15203B] focus:ring-2 focus:ring-[#F4A300]/30 disabled:bg-slate-50";
export const Input = forwardRef((p, ref) => <input ref={ref} {...p} className={`${inputCls} ${p.className || ""}`} />);
export const Select = ({ children, ...p }) => <select {...p} className={`${inputCls} ${p.className || ""}`}>{children}</select>;
export const Textarea = forwardRef((p, ref) => <textarea ref={ref} rows={3} {...p} className={`${inputCls} ${p.className || ""}`} />);

export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <label className={`inline-flex items-center gap-2 text-sm text-slate-700 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-emerald-500" : "bg-slate-300"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${checked ? "left-[22px]" : "left-0.5"}`} />
      </button>
      {label}
    </label>
  );
}

export const Alert = ({ type = "error", children }) => !children ? null : (
  <div className={`rounded-xl border px-4 py-3 text-sm ${type === "error" ? "border-red-200 bg-red-50 text-red-700" : type === "warn" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{children}</div>
);

/* ---------- status labels ---------- */
const TONES = {
  gray: "bg-slate-100 text-slate-700", blue: "bg-blue-50 text-blue-700", amber: "bg-amber-50 text-amber-800",
  green: "bg-emerald-50 text-emerald-700", red: "bg-red-50 text-red-700", violet: "bg-violet-50 text-violet-700",
};
export const Badge = ({ tone = "gray", children }) => <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}>{children}</span>;

// same order as the journey (server/src/lib/orders.js)
export const ORDER_STATUS = {
  pending: ["Pending", "amber"], on_hold: ["On hold", "amber"], confirmed: ["Confirmed", "blue"], packed: ["Packed", "violet"],
  shipped: ["Shipped", "blue"], out_for_delivery: ["Out for delivery", "blue"], delivery_failed: ["Delivery failed", "red"],
  delivered: ["Delivered", "green"], return_requested: ["Return requested", "amber"], returned: ["Returned", "red"], cancelled: ["Cancelled", "red"],
};
export const PAY_STATUS = { pending: ["Unpaid", "amber"], paid: ["Paid", "green"], failed: ["Failed", "red"], refund_pending: ["Refund initiated", "violet"], refunded: ["Refunded", "gray"] };
export const EMAIL_STATUS = { queued: ["Queued", "amber"], sending: ["Sending", "blue"], sent: ["Sent", "green"], failed: ["Failed", "red"], skipped: ["Not sent", "gray"] };
export const EmailBadge = ({ status }) => <Badge tone={(EMAIL_STATUS[status] || [])[1]}>{(EMAIL_STATUS[status] || [status])[0]}</Badge>;
export const TRIGGER = { registration: "Sign-up", order: "New order", admin: "Admin update", system: "System", test: "Test", retry: "Resent by admin", customer: "Customer action" };
export const PRODUCT_STATUS = { active: ["On sale", "green"], draft: ["Draft", "gray"], archived: ["Archived", "red"] };
export const PAY_METHOD = { upi: "UPI", card: "Card", cod: "Cash on Delivery" };
export const OrderBadge = ({ status }) => <Badge tone={(ORDER_STATUS[status] || [])[1]}>{(ORDER_STATUS[status] || [status])[0]}</Badge>;
export const PayBadge = ({ status }) => <Badge tone={(PAY_STATUS[status] || [])[1]}>{(PAY_STATUS[status] || [status])[0]}</Badge>;

/* ---------- tables ---------- */
export function Table({ head, children, empty, loading }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>{head.map((h, i) => <th key={i} className={`whitespace-nowrap px-4 py-3 ${h.right ? "text-right" : ""}`}>{h.label ?? h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
      {loading && <div className="px-4 py-10 text-center text-sm text-slate-400">Loading…</div>}
      {!loading && empty && <div className="px-4 py-10 text-center text-sm text-slate-500">{empty}</div>}
    </div>
  );
}

export function Pager({ page, limit, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (total <= limit) return total ? <div className="px-4 py-3 text-xs text-slate-500">{num(total)} total</div> : null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
      <span className="text-xs">Showing {num((page - 1) * limit + 1)}–{num(Math.min(page * limit, total))} of {num(total)}</span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>← Previous</Button>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next →</Button>
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <button key={t.value} onClick={() => onChange(t.value)}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition ${value === t.value ? "border-[#F4A300] text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
          {t.label}{t.count != null && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{num(t.count)}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- dialogs ---------- */
export function Modal({ open, title, onClose, children, footer, wide }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`my-8 w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-2xl bg-white shadow-2xl`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">✕</button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

/** await confirm({ title, text, danger }) → true / false */
const ConfirmCtx = createContext(async () => false);
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const ask = useCallback((opts) => new Promise((resolve) => setState({ ...opts, resolve })), []);
  const done = (v) => { state?.resolve(v); setState(null); };
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      <Modal open={!!state} title={state?.title || "Are you sure?"} onClose={() => done(false)}
        footer={<><Button variant="outline" onClick={() => done(false)}>Cancel</Button><Button variant={state?.danger ? "danger" : "primary"} onClick={() => done(true)}>{state?.ok || "Confirm"}</Button></>}>
        <p className="text-sm text-slate-600">{state?.text}</p>
      </Modal>
    </ConfirmCtx.Provider>
  );
}
export const useConfirm = () => useContext(ConfirmCtx);

/* ---------- small pieces ---------- */
export function Stat({ label, value, sub, tone = "slate", icon }) {
  const tones = { slate: "bg-slate-100 text-slate-700", gold: "bg-amber-100 text-amber-700", green: "bg-emerald-100 text-emerald-700", blue: "bg-blue-100 text-blue-700", red: "bg-red-100 text-red-700" };
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-slate-500">{label}</div>
          <div className="mt-1.5 truncate text-2xl font-semibold text-slate-900">{value}</div>
          {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
        </div>
        {icon && <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>{icon}</span>}
      </div>
    </Card>
  );
}

export const SearchBox = ({ value, onChange, placeholder }) => (
  <div className="relative">
    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
    <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-8" />
  </div>
);

/** Debounced value, for search boxes. */
export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export const Icon = {
  dashboard: "M3 13h8V3H3v10Zm10 8h8V11h-8v10ZM3 21h8v-6H3v6ZM13 9h8V3h-8v6Z",
  orders: "M5 8h14l-1.5 12h-11zM9 8V6a3 3 0 0 1 6 0v2",
  products: "M21 8 12 3 3 8m18 0-9 5m9-5v9l-9 5m0-9L3 8m9 5v9M3 8v9l9 5",
  categories: "M4 6h16M4 12h16M4 18h10",
  customers: "M16 11a4 4 0 1 0-8 0M3 21c1.5-4 4.5-6 9-6s7.5 2 9 6",
  messages: "M4 5h16v11H9l-5 4z",
  team: "M17 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M21 20v-2a4 4 0 0 0-3-3.9M16 2.1a4 4 0 0 1 0 7.8",
  activity: "M3 12h4l3 8 4-16 3 8h4",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z",
  profile: "M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 20.25a7.5 7.5 0 0 1 15 0",
  store: "M3 9 4.5 4h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6",
  seo: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM21 21l-5-5M8 11h6M11 8v6",
  emails: "M3 6.75A1.5 1.5 0 0 1 4.5 5.25h15a1.5 1.5 0 0 1 1.5 1.5v10.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.25V6.75Zm0 0 9 6 9-6",
  logout: "M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75",
};
export const Svg = ({ d, className = "h-5 w-5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"><path d={d} /></svg>
);
