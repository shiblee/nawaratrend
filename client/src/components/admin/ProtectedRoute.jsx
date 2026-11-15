import { Navigate } from "react-router-dom";
import { useAdminAuth } from "../../context/AdminAuthContext.jsx";

/** Sends signed-out visitors to the admin sign-in. With `roles`, also blocks other roles (the server enforces the same rule). */
export default function ProtectedRoute({ children, roles }) {
  const { token, admin, loading } = useAdminAuth();

  if (loading || (token && !admin)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-[#410309]" />
      </div>
    );
  }
  if (!token) return <Navigate to="/admin/login" replace />;
  if (roles && !roles.includes(admin.role)) {
    return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">This page is only for {roles.join(" and ")}s. Ask the store owner if you need access.</div>;
  }
  return children;
}
