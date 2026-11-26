import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { adminApi } from "../../services/adminApi.js";
import { useAdminAuth } from "../../context/AdminAuthContext.jsx";
import { Alert, Button, Card, CardHeader, Field, Input, Select, Stat, Textarea, Toggle, money, num, useLoad, useToast, PRODUCT_STATUS } from "../../components/admin/ui.jsx";

const EMPTY = { name: "", slug: "", category_id: "", description: "", price: "", mrp: "", cost_price: "", sku: "", stock: 0, low_stock_threshold: 5,
  rating: 0, review_count: 0, highlights: "", sizes: "", size_prices: [], colors: [], images: "", status: "active", is_featured: false, sort_order: 0, seo_title: "", seo_description: "" };
const lines = (s) => s.split("\n").map((x) => x.trim()).filter(Boolean);

export default function ProductEdit() {
  const { id } = useParams();
  const isNew = id === "new";
  const { can } = useAdminAuth();
  const canEdit = can("owner", "manager");
  const navigate = useNavigate();
  const toast = useToast();
  const cats = useLoad(() => adminApi.getCategories(), []);
  const existing = useLoad(() => (isNew ? Promise.resolve(null) : adminApi.getProduct(id)), [id]);
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState({ field: "", message: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const p = existing.data;
    if (!p) return;
    setF({ ...EMPTY, ...p, category_id: p.category_id || "", cost_price: p.cost_price ?? "", sku: p.sku || "", description: p.description || "",
      seo_title: p.seo_title || "", seo_description: p.seo_description || "",
      highlights: p.highlights.join("\n"), sizes: p.sizes.join(", "), images: p.images.join("\n") });
  }, [existing.data]);

  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e });
  const price = Number(f.price) || 0, mrp = Number(f.mrp) || 0, cost = f.cost_price === "" ? null : Number(f.cost_price);
  const discount = mrp > price && price ? Math.round((1 - price / mrp) * 100) : 0;
  const profit = cost != null && price ? price - cost : null;

  // a price per size (optional): rows for the sizes typed above; an empty price means the size sells at the product's price
  const sizeList = f.sizes.split(",").map((s) => s.trim()).filter(Boolean);
  const sizePrice = (s) => f.size_prices.find((x) => x.size === s) || { size: s, price: "", mrp: "" };
  const setSizePrice = (s, k, v) => setF({ ...f, size_prices: [...f.size_prices.filter((x) => x.size !== s), { ...sizePrice(s), [k]: v }] });
  const setColor = (i, k, v) => setF({ ...f, colors: f.colors.map((c, j) => (j === i ? { ...c, [k]: v } : c)) });

  const submit = async (e) => {
    e.preventDefault();
    setErr({ field: "", message: "" }); setSaving(true);
    const body = { ...f, category_id: f.category_id || null, cost_price: f.cost_price === "" ? null : f.cost_price, sku: f.sku || null,
      highlights: lines(f.highlights), sizes: sizeList, images: lines(f.images),
      size_prices: f.size_prices.filter((x) => sizeList.includes(x.size) && String(x.price).trim() !== "") };
    try {
      if (isNew) { const r = await adminApi.createProduct(body); toast("Product added"); navigate(`/admin/products/${r.id}`, { replace: true }); }
      else { await adminApi.updateProduct(id, body); toast("Product saved"); existing.reload(); }
    } catch (e2) {
      setErr({ field: e2.field || "", message: e2.message });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally { setSaving(false); }
  };

  if (!isNew && existing.loading && !existing.data) return <div className="h-64 animate-pulse rounded-2xl bg-slate-200/60" />;
  if (existing.error) return <Alert>{existing.error}</Alert>;
  const fe = (k) => (err.field === k || err.field.startsWith(k + "[") ? err.message : "");
  const p = existing.data;

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/admin/products" className="text-sm text-slate-500 hover:text-slate-900">← All products</Link>
          <h2 className="mt-1 text-xl font-semibold">{isNew ? "Add a product" : f.name || "Product"}</h2>
          {!isNew && <a href={`/product/${p.slug}`} target="_blank" rel="noreferrer" className="text-sm text-slate-500 underline">View on store ↗</a>}
        </div>
        {canEdit && <Button variant="gold" loading={saving}>{isNew ? "Add product" : "Save changes"}</Button>}
      </div>
      {!canEdit && <Alert type="warn">You can view products. Only owners and managers can change them (staff can update stock from the product list).</Alert>}
      <Alert>{err.message}</Alert>

      {p && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Units sold" value={num(p.sales.units)} sub="Excludes cancelled and returned orders" />
          <Stat label="Revenue" value={money(p.sales.revenue)} sub={`From ${p.sales.orders} order${p.sales.orders === 1 ? "" : "s"}`} />
          <Stat label="In stock" value={num(p.stock)} sub={p.stock <= p.low_stock_threshold ? "Running low, restock soon" : `Alert below ${p.low_stock_threshold}`} />
        </div>
      )}

      <fieldset disabled={!canEdit} className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Basic details" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Product name" error={fe("name")} className="sm:col-span-2"><Input value={f.name} onChange={set("name")} required maxLength={150} /></Field>
              <Field label="Category" error={fe("category")}>
                <Select value={f.category_id} onChange={set("category_id")} required>
                  <option value="">Choose a category</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Web address" hint="(leave empty to create from the name)" error={fe("slug")}>
                <div className="flex items-center rounded-xl border border-slate-300 bg-slate-50 pl-3 text-sm text-slate-500">/product/<Input value={f.slug} onChange={set("slug")} maxLength={80} className="!rounded-l-none !border-0 !border-l" /></div>
              </Field>
              <Field label="Description" error={fe("description")} className="sm:col-span-2"><Textarea rows={4} value={f.description} onChange={set("description")} maxLength={5000} /></Field>
              <Field label="Highlights" hint="(one per line, up to 8; shown as ticks on the store)" error={fe("highlights")} className="sm:col-span-2">
                <Textarea rows={4} value={f.highlights} onChange={set("highlights")} placeholder={"100% cotton\nMachine washable"} />
              </Field>
              <Field label="Sizes" hint="(comma-separated; leave empty if the product has no sizes)" error={fe("sizes")} className="sm:col-span-2">
                <Input value={f.sizes} onChange={set("sizes")} placeholder="S, M, L, XL" />
              </Field>
              {sizeList.length > 0 && (
                <Field label="Price per size" hint="(optional: fill in only when sizes cost different amounts, e.g. 6 ml and 12 ml)" error={fe("size_prices")} className="sm:col-span-2">
                  <div className="space-y-2">
                    {sizeList.map((s) => (
                      <div key={s} className="grid grid-cols-[6rem_1fr_1fr] items-center gap-2">
                        <span className="text-sm font-medium text-slate-700">{s}</span>
                        <Input type="number" min="1" step="0.01" placeholder={`Price (${f.price || "same"})`} value={sizePrice(s).price} onChange={(e) => setSizePrice(s, "price", e.target.value)} />
                        <Input type="number" min="1" step="0.01" placeholder="MRP" value={sizePrice(s).mrp} onChange={(e) => setSizePrice(s, "mrp", e.target.value)} />
                      </div>
                    ))}
                  </div>
                </Field>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Colours" sub="Customers can choose one or several colours, each with its own quantity. Leave empty if the product has no colours. Remove a colour when it runs out: stock is counted for the whole product." />
            <div className="space-y-3 p-5">
              {fe("colors") && <Alert>{fe("colors")}</Alert>}
              {f.colors.map((c, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-2">
                  <input type="color" value={c.hex} onChange={(e) => setColor(i, "hex", e.target.value)} aria-label={`Swatch for ${c.name || "new colour"}`} className="h-10 w-12 cursor-pointer rounded-lg border border-slate-300 bg-white p-1" />
                  <div className="w-36"><Input value={c.name} onChange={(e) => setColor(i, "name", e.target.value)} placeholder="Yellow" maxLength={40} required aria-label="Colour name" /></div>
                  <div className="min-w-40 flex-1">
                    <Select value={c.image || ""} onChange={(e) => setColor(i, "image", e.target.value || null)} aria-label={`Photo for ${c.name || "new colour"}`}>
                      <option value="">No photo (swatch only)</option>
                      {[...new Set([...lines(f.images), ...(c.image ? [c.image] : [])])].map((src, j) => <option key={src} value={src}>Photo {j + 1} ({src.split("/").pop()})</option>)}
                    </Select>
                  </div>
                  {c.image && <img src={c.image} alt="" className="h-10 w-10 rounded-lg object-cover" />}
                  <Button type="button" variant="ghost" size="sm" className="!text-red-600" onClick={() => setF({ ...f, colors: f.colors.filter((_, j) => j !== i) })}>Remove</Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setF({ ...f, colors: [...f.colors, { name: "", hex: "#F5C518", image: null }] })}>+ Add a colour</Button>
            </div>
          </Card>

          <Card>
            <CardHeader title="Search engines (SEO)" sub="Leave empty to use an automatic title and description built from the name, price and description."
              action={<Link to="/admin/seo" className="text-xs font-semibold text-slate-500 hover:text-slate-900">All SEO settings →</Link>} />
            <div className="space-y-4 p-5">
              <Field label="SEO title" hint={`(${(f.seo_title || "").length}/60 recommended)`} error={fe("SEO title")}>
                <Input value={f.seo_title} onChange={set("seo_title")} maxLength={80} placeholder={`${f.name || "Product name"} at ₹${price || "…"}${discount ? ` (${discount}% off)` : ""}`} />
              </Field>
              <Field label="SEO description" hint={`(${(f.seo_description || "").length}/160 recommended)`} error={fe("SEO description")}>
                <Textarea value={f.seo_description} onChange={set("seo_description")} maxLength={200} placeholder={(f.description || "").slice(0, 150)} />
              </Field>
              <div className="rounded-xl border border-slate-200 p-4 font-[arial,sans-serif]">
                <div className="text-[12px] text-[#4d5156]">NawaraTrend › product › {f.slug || "…"}</div>
                <div className="truncate text-[19px] text-[#1a0dab]">{f.seo_title || `${f.name || "Product name"} at ₹${price ? price.toLocaleString("en-IN") : "…"}${discount ? ` (${discount}% off)` : ""}`} | NawaraTrend</div>
                <p className="line-clamp-2 text-[13px] text-[#4d5156]">{f.seo_description || f.description || "Your product description appears here."}</p>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Photos" sub="Paste image links (https://…), one per line. The first is the main photo; the rest appear in the gallery." />
            <div className="space-y-4 p-5">
              <Field label="Image links" error={fe("images")}><Textarea rows={4} value={f.images} onChange={set("images")} placeholder="https://…/front.jpg" /></Field>
              {lines(f.images).length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {lines(f.images).map((src, i) => (
                    <figure key={i} className="w-24">
                      <img src={src} alt="" className="h-24 w-24 rounded-xl border border-slate-200 bg-slate-50 object-cover" onError={(e) => { e.currentTarget.style.opacity = 0.2; }} />
                      <figcaption className="mt-1 text-center text-xs text-slate-500">{i === 0 ? "Main" : `Photo ${i + 1}`}</figcaption>
                    </figure>
                  ))}
                </div>
              )}
              {!lines(f.images).length && <p className="text-sm text-slate-500">No photos yet: the store shows the category illustration instead.</p>}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Price" />
            <div className="space-y-4 p-5">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Selling price (₹)" error={fe("price")}><Input type="number" min="1" step="1" value={f.price} onChange={set("price")} required /></Field>
                <Field label="MRP (₹)" error={fe("mrp")}><Input type="number" min="1" step="1" value={f.mrp} onChange={set("mrp")} placeholder={f.price} /></Field>
              </div>
              <Field label="Cost price (₹)" hint="(private, for profit)" error={fe("cost price")}><Input type="number" min="0" step="1" value={f.cost_price} onChange={set("cost_price")} /></Field>
              <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {discount ? <>Shows as <b>{discount}% off</b> · customer saves {money(mrp - price)}</> : "No discount shown"}
                {profit != null && <><br />Profit per sale: <b className={profit < 0 ? "text-red-600" : ""}>{money(profit)}</b>{price ? ` (${Math.round((profit / price) * 100)}% margin)` : ""}</>}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Stock" />
            <div className="grid grid-cols-2 gap-3 p-5">
              <Field label="In stock" error={fe("stock")}><Input type="number" min="0" step="1" value={f.stock} onChange={set("stock")} /></Field>
              <Field label="Alert when below" error={fe("low stock alert")}><Input type="number" min="0" step="1" value={f.low_stock_threshold} onChange={set("low_stock_threshold")} /></Field>
              <Field label="Product code" hint="(permanent)"><Input value={p?.code || "Given when saved"} disabled readOnly /></Field>
              <Field label="SKU" hint="(your own, optional)" error={fe("SKU")}><Input value={f.sku} onChange={set("sku")} maxLength={60} placeholder="NT-SH-BLK-001" /></Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Visibility" />
            <div className="space-y-4 p-5">
              <Field label="Status">
                <Select value={f.status} onChange={set("status")}>{Object.entries(PRODUCT_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select>
              </Field>
              <p className="-mt-2 text-xs text-slate-500">Only "On sale" products appear in the store. Drafts are hidden until ready; archived products are kept for order history.</p>
              <Toggle checked={!!f.is_featured} onChange={set("is_featured")} label="Featured product" disabled={!canEdit} />
              <Field label="Position in store" hint="(lower comes first)"><Input type="number" min="0" value={f.sort_order} onChange={set("sort_order")} /></Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Rating shown on store" sub="Until reviews are collected on the site" />
            <div className="grid grid-cols-2 gap-3 p-5">
              <Field label="Rating (0–5)" error={fe("rating")}><Input type="number" min="0" max="5" step="0.1" value={f.rating} onChange={set("rating")} /></Field>
              <Field label="Number of reviews" error={fe("review count")}><Input type="number" min="0" value={f.review_count} onChange={set("review_count")} /></Field>
            </div>
          </Card>
        </div>
      </fieldset>
    </form>
  );
}
