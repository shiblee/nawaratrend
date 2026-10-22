import { useState } from "react";
import { Link } from "react-router-dom";
import { adminApi } from "../../services/adminApi.js";
import { useAdminAuth } from "../../context/AdminAuthContext.jsx";
import { Alert, Badge, Button, Card, Field, Input, Modal, PageHeader, Table, Toggle, useConfirm, useLoad, useToast } from "../../components/admin/ui.jsx";

const EMPTY = { name: "", slug: "", sort_order: 0, is_active: true };

export default function Categories() {
  const { can } = useAdminAuth();
  const canEdit = can("owner", "manager");
  const toast = useToast();
  const confirm = useConfirm();
  const { data, error, loading, reload } = useLoad(() => adminApi.getCategories(), []);
  const [edit, setEdit] = useState(null);   // null = closed, {} = new, {id,…} = existing
  const [f, setF] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const open = (c) => { setEdit(c || {}); setF(c ? { name: c.name, slug: c.slug, sort_order: c.sort_order, is_active: c.is_active } : { ...EMPTY, sort_order: (data?.length || 0) + 1 }); setErr(""); };
  const save = async (e) => {
    e?.preventDefault();
    setSaving(true); setErr("");
    try {
      edit.id ? await adminApi.updateCategory(edit.id, f) : await adminApi.createCategory(f);
      toast(edit.id ? "Category saved" : "Category added"); setEdit(null); reload();
    } catch (e2) { setErr(e2.message); } finally { setSaving(false); }
  };
  const remove = async (c) => {
    if (!(await confirm({ title: `Delete ${c.name}?`, text: "This removes the category from the store.", danger: true, ok: "Delete" }))) return;
    try { await adminApi.deleteCategory(c.id); toast("Category deleted"); reload(); } catch (e) { toast(e.message, "error"); }
  };

  return (
    <div>
      <PageHeader title="Categories" sub="The groups shown in the shop menu, the catalogue and the footer."
        actions={canEdit && <Button variant="gold" onClick={() => open()}>+ Add category</Button>} />
      <Alert>{error}</Alert>
      <Card>
        <Table loading={loading && !data} empty={data && !data.length && "No categories yet."}
          head={["Position", "Category", "Web address", { label: "Products", right: true }, "Shown on store", ""]}>
          {data?.map((c) => (
            <tr key={c.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 tabular-nums text-slate-500">{c.sort_order}</td>
              <td className="px-4 py-3 font-medium">{c.name}</td>
              <td className="px-4 py-3 text-slate-500">/shop#{c.slug}</td>
              <td className="px-4 py-3 text-right"><Link to={`/admin/products?category=${c.id}`} className="hover:underline">{c.active_count} on sale · {c.product_count} total</Link></td>
              <td className="px-4 py-3">{c.is_active ? <Badge tone="green">Shown</Badge> : <Badge>Hidden</Badge>}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right">
                {canEdit && <><Button variant="ghost" size="sm" onClick={() => open(c)}>Edit</Button>
                  <Button variant="ghost" size="sm" className="!text-red-600" onClick={() => remove(c)}>Delete</Button></>}
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      <Modal open={!!edit} title={edit?.id ? `Edit ${edit.name}` : "Add a category"} onClose={() => setEdit(null)}
        footer={<><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button loading={saving} onClick={save}>Save</Button></>}>
        <form onSubmit={save} className="space-y-4">
          <Alert>{err}</Alert>
          <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={100} autoFocus /></Field>
          <Field label="Web address" hint="(leave empty to create from the name)"><Input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} maxLength={60} /></Field>
          <Field label="Position" hint="(lower comes first)"><Input type="number" min="0" value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: e.target.value })} /></Field>
          <Toggle checked={!!f.is_active} onChange={(v) => setF({ ...f, is_active: v })} label="Show on the store" />
        </form>
      </Modal>
    </div>
  );
}
