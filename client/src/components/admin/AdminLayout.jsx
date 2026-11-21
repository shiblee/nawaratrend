import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAdminAuth } from "../../context/AdminAuthContext.jsx";
import { adminApi } from "../../services/adminApi.js";
import { Icon, Svg, initials, ToastProvider, ConfirmProvider } from "./ui.jsx";

// `roles` / `perm`: who sees the item (the server enforces the same rules)
const NAV = [
  { to: "/admin/dashboard", label: "Dashboard", icon: Icon.dashboard },
  { to: "/admin/orders", label: "Orders", icon: Icon.orders, badge: "orders" },
  { to: "/admin/products", label: "Products", icon: Icon.products },
  { to: "/admin/categories", label: "Categories", icon: Icon.categories },
  { to: "/admin/customers", label: "Customers", icon: Icon.customers, perm: "customers.view" },
  { to: "/admin/messages", label: "Messages", icon: Icon.messages, badge: "messages" },
  { section: "Communication", perms: ["templates.edit", "sms.settings", "logs.view"] },
  { to: "/admin/emails", label: "Email templates", icon: Icon.emails, perm: "templates.edit" },
  { to: "/admin/communication/sms", label: "OTP / SMS", icon: Icon.sms, perm: "sms.settings" },
  { to: "/admin/communication/logs", label: "Delivery logs", icon: Icon.logs, perm: "logs.view" },
  { section: "Admin" },
  { to: "/admin/team", label: "Team", icon: Icon.team, roles: ["owner"] },
  { to: "/admin/activity", label: "Activity log", icon: Icon.activity, roles: ["owner", "manager"] },
  { to: "/admin/seo", label: "SEO", icon: Icon.seo },
  { to: "/admin/settings", label: "Settings", icon: Icon.settings },
  { to: "/admin/profile", label: "My profile", icon: Icon.profile },
];
const ROLE = { owner: "Owner", manager: "Manager", staff: "Staff" };

export default function AdminLayout() {
  const { admin, logout, can, allowed } = useAdminAuth();
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState({});
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // pending orders + unread messages, refreshed every minute
  useEffect(() => {
    let live = true;
    const load = () => Promise.all([adminApi.getOrders({ status: "pending", limit: 1 }), adminApi.getMessages({ status: "new", limit: 1 })])
      .then(([o, m]) => live && setCounts({ orders: o.total, messages: m.total })).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => { live = false; clearInterval(t); };
  }, [pathname]);

  const items = NAV.filter((i) => (!i.roles || can(...i.roles)) && (!i.perm || allowed(i.perm)) && (!i.perms || i.perms.some(allowed)));
  const current = NAV.find((i) => i.to && pathname.startsWith(i.to))?.label || "Admin";
  useEffect(() => { document.title = `${current} | NawaraTrend Admin`; }, [current]);

  const signOut = () => { logout(); navigate("/admin/login", { replace: true }); };

  return (
    <ToastProvider>
      <ConfirmProvider>
        <div className="flex min-h-screen bg-slate-100 text-slate-900">
          {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}

          <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-[#410309] text-slate-200 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
            <div className="border-b border-[#F2C12E]/20 px-6 py-5">
              <img src="/brand/logo-gold.png" alt="Nawara Trend" width="623" height="144" className="h-9 w-auto" />
              <div className="mt-2 text-[11px] font-semibold uppercase tracking-[.18em] text-[#F2C12E]/70">Admin panel</div>
            </div>

            <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2" aria-label="Admin">
              {items.map((item, i) => item.section ? (
                <div key={i} className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-[#F2C12E]/55">{item.section}</div>
              ) : (
                <NavLink key={item.to} to={item.to} onClick={() => setOpen(false)}
                  className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? "bg-[#F2C12E]/15 text-[#FFE27A] shadow-[inset_2px_0_0_#F2C12E]" : "text-[#E8D5CB]/75 hover:bg-white/5 hover:text-white"}`}>
                  {({ isActive }) => (<>
                    <span className={isActive ? "text-[#F2C12E]" : ""}><Svg d={item.icon} /></span>
                    <span className="flex-1">{item.label}</span>
                    {item.badge && counts[item.badge] > 0 && <span className="rounded-full bg-[#F2C12E] px-2 py-0.5 text-xs font-bold text-[#410309]">{counts[item.badge]}</span>}
                  </>)}
                </NavLink>
              ))}
            </nav>

            <div className="border-t border-white/10 p-4">
              <div className="mb-3 flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F2C12E] text-sm font-semibold text-[#410309]">{initials(admin?.name)}</span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-white">{admin?.name}</div>
                  <div className="truncate text-xs text-[#E8D5CB]/60">{ROLE[admin?.role]} · {admin?.email}</div>
                </div>
              </div>
              <button onClick={signOut} className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-300">
                <Svg d={Icon.logout} className="h-4 w-4" /> Sign out
              </button>
            </div>
          </aside>

          <div className="flex min-h-screen min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/85 px-4 py-3.5 backdrop-blur sm:px-8">
              <div className="flex items-center gap-3">
                <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
                  <Svg d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
                </button>
                <h1 className="text-lg font-semibold text-slate-900">{current}</h1>
              </div>
              <a href="/" target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
                <Svg d={Icon.store} className="h-4 w-4" /> View store
              </a>
            </header>

            {admin?.must_change_password && !pathname.startsWith("/admin/profile") && (
              <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:px-8">
                <b>You're using a temporary password.</b> Please <Link to="/admin/profile" className="font-semibold underline">choose your own password</Link> to keep the store secure.
              </div>
            )}

            <main className="min-w-0 flex-1 px-4 py-6 sm:px-8">
              <Outlet />
            </main>
          </div>
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}
