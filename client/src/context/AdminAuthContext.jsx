import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { adminApi, getToken, setToken as saveToken } from "../services/adminApi.js";

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [token, setToken] = useState(() => getToken());
  const [loading, setLoading] = useState(true);

  const applyToken = useCallback((t) => { saveToken(t); setToken(t); }, []);

  useEffect(() => {
    if (!token) { setAdmin(null); setLoading(false); return; }
    adminApi.me()
      .then(setAdmin)
      .catch(() => applyToken(null))
      .finally(() => setLoading(false));
  }, [token, applyToken]);

  // the API client fires this when the server ends the session (expired, password changed, disabled)
  useEffect(() => {
    const onOut = () => { setToken(null); setAdmin(null); };
    window.addEventListener("admin:signed-out", onOut);
    return () => window.removeEventListener("admin:signed-out", onOut);
  }, []);

  const login = async (email, password) => {
    const { token: t, admin: a } = await adminApi.login(email, password);
    setAdmin(a);
    applyToken(t);
    return a;
  };

  const logout = () => { applyToken(null); setAdmin(null); };

  /** Role check used to hide buttons the server would refuse anyway. */
  const can = (...roles) => !!admin && roles.includes(admin.role);

  return (
    <AdminAuthContext.Provider value={{ admin, setAdmin, token, setSessionToken: applyToken, login, logout, loading, can }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export const useAdminAuth = () => useContext(AdminAuthContext);
