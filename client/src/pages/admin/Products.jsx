import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { adminApi } from "../../services/adminApi.js";
import { useAdminAuth } from "../../context/AdminAuthContext.jsx";
import { Alert, Badge, Button, Card, Input, PageHeader, Pager, SearchBox, Select, Table, money, num, useConfirm, useDebounced, useLoad, useToast, PRODUCT_STATUS } from "../../components/admin/ui.jsx";

function StockCell({ p, onSaved }) {
  const toast = useToast();
  const [v, setV] = useState(String(p.stock));
  const [saving, setSaving] = useState(false);
  const dirty = v !== String(p.stock);
  const save = async () => {
    setSaving(true);
    try { await adminApi.updateStock(p.id, Number(v)); toast(`Stock for ${p.name} set to ${v}`); onSaved(); }
    catch (e) { toast(e.message, "error"); setV(String(p.stock)); } finally { setSaving(false); }
  };
  const tone = p.stock === 0 ? "text-red-600" : p.stock <= p.low_stock_threshold ? "text-amber-700" : "text-slate-900";
  return (
    <form className="flex items-center justify-end gap-1" onSubmit={(e) => { e.preventDefault(); if (dirty) save(); }}>
      <Input type="number" min="0" value={v} onChange={(e) => setV(e.target.value)} aria-label={`Stock for ${p.name}`} className={`!w-20 text-right font-semibold ${tone}`} />
      {dirty && <Button size="sm" loading={saving}>Save</Button>}
    </form>
  );
}

export default function Products() {
  const { can } = useAdminAuth();
  const canEdit = can("owner", "manager");
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const f = { category: params.get("category") || "", status: params.get("status") || "", stock: params.get("stock") || "", sort: params.get("sort") || "order" };
  const q = useDebounced(search);
  const cats = useLoad(() => adminApi.getCategories(), []);
  const { data, error, loading, reload } = useLoad(() => adminApi.getProducts({ ...f, search: q, page, limit: 25 }), [q, page, f.category, f.status, f.stock, f.sort]);

  const setF = (k, v) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n); setPage(1); };
  const remove = async (p) => {
    if (!(await confirm({ title: `Delete ${p.name}?`, text: "If it appears in past orders it will be archived instead, so order history stays complete.", danger: true, ok: "Delete" }))) return;
    try { const r = await adminApi.deleteProduct(p.id); toast(r.archived ? r.message : "Product deleted"); reload(); }
    catch (e) { toast(e.message, "error"); }
  };

  return (
    <div>
      <PageHeader title="Products" sub="Everything you sell. Changes show on the store straight away."
        actions={canEdit && <Button variant="gold" onClick={() => navigate("/admin/products/new")}>+ Add product</Button>} />
      <Card>
        <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search name, SKU or web address" />
          <Select value={f.category} onChange={(e) => setF("category", e.target.value)} aria-label="Category">
            <option value="">All categories</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select value={f.status} onChange={(e) => setF("status", e.target.value)} aria-label="Status">
            <option value="">Any status</option>{Object.entries(PRODUCT_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </Select>
          <Select value={f.stock} onChange={(e) => setF("stock", e.target.value)} aria-label="Stock">
            <option value="">Any stock level</option><option value="low">Running low</option><option value="out">Out of stock</option>
          </Select>
          <Select value={f.sort} onChange={(e) => setF("sort", e.target.value)} aria-label="Sort">
            <option value="order">Store order</option><option value="newest">Newest first</option><option value="name">Name A–Z</option>
            <option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option><option value="stock">Stock: lowest first</option>
          </Select>
        </div>
        {error && <div className="p-4"><Alert>{error}</Alert></div>}
        <Table loading={loading && !data} empty={data && !data.rows.length && "No products match. Try another filter."}
          head={["Product", "Category", { label: "Price", right: true }, { label: "Margin", right: true }, { label: "Sold", right: true }, { label: "Stock", right: true }, "Status", ""]}>
          {data?.rows.map((p) => {
            const margin = p.cost_price != null ? Math.round(((p.price - p.cost_price) / p.price) * 100) : null;
            return (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link to={`/admin/products/${p.id}`} className="font-medium text-slate-900 hover:underline">{p.name}</Link>
                  <div className="text-xs text-slate-500">{p.code}{p.sku ? ` · ${p.sku}` : ""} · /product/{p.slug}{p.is_featured ? " · ★ Featured" : ""}{p.sizes.length ? ` · Sizes ${p.sizes.join(", ")}` : ""}{p.colors.length ? ` · Colours ${p.colors.map((c) => c.name).join(", ")}` : ""}</div>
                </td>
                <td className="px-4 py-3 text-slate-600">{p.category_name || <span className="text-red-600">None</span>}</td>
                <td className="px-4 py-3 text-right tabular-nums"><div className="font-semibold">{money(p.price)}</div>{p.mrp > p.price && <div className="text-xs text-slate-400 line-through">{money(p.mrp)}</div>}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">{margin == null ? "—" : `${margin}%`}</td>
                <td className="px-4 py-3 text-right tabular-nums">{num(p.units_sold)}</td>
                <td className="px-4 py-3"><StockCell p={p} onSaved={reload} /></td>
                <td className="px-4 py-3"><Badge tone={PRODUCT_STATUS[p.status][1]}>{PRODUCT_STATUS[p.status][0]}</Badge></td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <Link to={`/admin/products/${p.id}`}><Button variant="ghost" size="sm">{canEdit ? "Edit" : "View"}</Button></Link>
                  {canEdit && <Button variant="ghost" size="sm" className="!text-red-600" onClick={() => remove(p)}>Delete</Button>}
                </td>
              </tr>
            );
          })}
        </Table>
        {data && <Pager page={data.page} limit={data.limit} total={data.total} onPage={setPage} />}
      </Card>
    </div>
  );
}
