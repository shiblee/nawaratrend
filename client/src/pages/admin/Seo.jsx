import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi } from "../../services/adminApi.js";
import { useAdminAuth } from "../../context/AdminAuthContext.jsx";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Modal, PageHeader, Table, Tabs, Textarea, Toggle, useLoad, useToast } from "../../components/admin/ui.jsx";

/* Ideal lengths Google shows in results (roughly): title up to ~60 characters, description 120–160. */
const LIMITS = { title: [30, 60], description: [120, 160] };
const lengthTone = (kind, n) => { const [lo, hi] = LIMITS[kind]; return n === 0 ? "gray" : n > hi ? "red" : n < lo ? "amber" : "green"; };

function Count({ kind, value }) {
  const n = (value || "").length, [lo, hi] = LIMITS[kind], tone = lengthTone(kind, n);
  const hint = n === 0 ? "uses the default" : n > hi ? "too long, Google will cut it" : n < lo ? "a bit short" : "good length";
  return <span className={`text-xs ${tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-700" : tone === "green" ? "text-emerald-700" : "text-slate-400"}`}>{n}/{hi} · {hint}</span>;
}

/** How the page may look in Google results. */
function Snippet({ url, title, description }) {
  let host = url, crumbs = "";
  try { const u = new URL(url); host = u.host; crumbs = u.pathname === "/" ? "" : u.pathname.split("/").filter(Boolean).join(" › "); } catch { /* keep raw */ }
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 font-[arial,sans-serif]">
      <div className="flex items-center gap-2 text-xs">
        <img src="/favicon.svg" alt="" className="h-6 w-6 rounded-full border border-slate-200 bg-white p-0.5" />
        <div className="min-w-0"><div className="truncate text-[13px] text-[#202124]">NawaraTrend</div><div className="truncate text-[12px] text-[#4d5156]">{host}{crumbs && ` › ${crumbs}`}</div></div>
      </div>
      <div className="mt-1.5 truncate text-[19px] leading-snug text-[#1a0dab]">{title}</div>
      <p className="mt-0.5 line-clamp-2 text-[13px] leading-[1.58] text-[#4d5156]">{description}</p>
    </div>
  );
}

/* ---------- health check ---------- */
function useChecks(d) {
  return useMemo(() => {
    if (!d) return [];
    const s = d.settings, out = [];
    const add = (level, text, fix, tab) => out.push({ level, text, fix, tab });
    if (!s.indexing) add("critical", "Search engines are told not to index the site.", "Turn indexing on in Sitemap & robots.", "robots");
    if (/localhost|127\.0\.0\.1/.test(s.site_url)) add("critical", `The site address is still ${s.site_url}, so the sitemap and canonical links point to your computer.`, "Set your real domain (e.g. https://nawaratrend.com) in General.", "general");
    else if (!s.site_url.startsWith("https://")) add("warn", "The site address doesn't use https://.", "Use https:// so Google trusts the site.", "general");
    if (!s.google_verification) add("info", "Google Search Console isn't connected.", "Add your verification code to see how Google indexes the site.", "tracking");
    if (!s.ga4_id) add("info", "Google Analytics isn't set up.", "Add a G-… measurement ID to see your visitors (only loads after cookie consent).", "tracking");
    if (!s.share_image) add("warn", "No default share image.", "Add one so links shared on WhatsApp, Facebook and X show a picture.", "general");
    const dl = s.default_description.length;
    if (dl < 120 || dl > 160) add("warn", `The default description is ${dl} characters.`, "Aim for 120–160 characters.", "general");
    const titles = {};
    for (const p of d.pages.filter((x) => !x.noindex)) {
      if (p.finalTitle.length > 60) add("warn", `"${p.label}" title is ${p.finalTitle.length} characters.`, "Shorten it to 60 or fewer.", "pages");
      if (p.finalDescription.length < 70 || p.finalDescription.length > 160) add("warn", `"${p.label}" description is ${p.finalDescription.length} characters.`, "Aim for 120–160 characters.", "pages");
      (titles[p.finalTitle] ||= []).push(p.label);
    }
    const noPhoto = d.products.filter((p) => !p.hasImage);
    if (noPhoto.length) add("warn", `${noPhoto.length} product${noPhoto.length > 1 ? "s have" : " has"} no photo: ${noPhoto.map((p) => p.name).join(", ")}.`,
      "Add photos on each product's page. Products with photos can appear with images in Google and look better when shared.", "products");
    for (const p of d.products) {
      if (p.finalTitle.length > 65) add("info", `${p.name}: title is ${p.finalTitle.length} characters.`, "Add a shorter SEO title.", "products");
      (titles[p.finalTitle] ||= []).push(p.name);
    }
    Object.entries(titles).filter(([, v]) => v.length > 1).forEach(([t, v]) => add("warn", `Same title on ${v.join(", ")}: "${t}".`, "Give each page its own title.", "pages"));
    return out;
  }, [d]);
}

const LEVEL = { critical: ["Fix now", "red"], warn: ["Improve", "amber"], info: ["Suggestion", "blue"] };

export default function Seo() {
  const { can } = useAdminAuth();
  const canEdit = can("owner", "manager");
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => adminApi.getSeo(), []);
  const [tab, setTab] = useState("overview");
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(null);   // { kind: "page"|"product", item, title, description, noindex }
  const checks = useChecks(data);
  useEffect(() => { if (data) setF({ ...data.settings }); }, [data]);

  if (error && !data) return <Alert>{error}</Alert>;
  if (!data || !f) return <div className="h-64 animate-pulse rounded-2xl bg-slate-200/60" />;

  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });
  const saveSettings = async (keys) => {
    setSaving(true); setErr("");
    try { await adminApi.updateSeoSettings(Object.fromEntries(keys.map((k) => [k, f[k]]))); toast("SEO settings saved. The store uses them right away."); reload(); }
    catch (e) { setErr(e.message); } finally { setSaving(false); }
  };
  const saveItem = async () => {
    setSaving(true); setErr("");
    try {
      if (editing.kind === "page") await adminApi.updateSeoPage(editing.item.key, { title: editing.title, description: editing.description, noindex: editing.noindex });
      else await adminApi.updateSeoProduct(editing.item.id, { seo_title: editing.title, seo_description: editing.description });
      toast("Saved"); setEditing(null); reload();
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };

  const critical = checks.filter((c) => c.level === "critical").length, warns = checks.filter((c) => c.level === "warn").length;
  // 100, minus 20 per "fix now", 5 per "improve" and 2 per suggestion
  const score = Math.max(0, 100 - critical * 20 - warns * 5 - (checks.length - critical - warns) * 2);
  const SaveBar = ({ keys }) => canEdit && <div className="flex justify-end border-t border-slate-100 px-5 py-4"><Button variant="gold" loading={saving} onClick={() => saveSettings(keys)}>Save</Button></div>;
  // a custom title goes through the title pattern; without one, the automatic title is shown
  const previewTitle = editing ? (editing.title ? f.title_template.replace("%s", editing.title) : editing.item.finalTitle) : "";

  return (
    <div>
      <PageHeader title="SEO" sub="How the store appears in Google and when links are shared. Changes apply straight away, and the sitemap updates itself." />
      {!canEdit && <div className="mb-4"><Alert type="warn">You can view SEO settings. Only owners and managers can change them.</Alert></div>}
      <div className="mb-4"><Alert>{err}</Alert></div>
      <Card>
        <div className="px-4 pt-2">
          <Tabs value={tab} onChange={(t) => { setTab(t); setErr(""); }} tabs={[
            { value: "overview", label: "Overview", count: checks.length || undefined }, { value: "general", label: "General" },
            { value: "pages", label: "Pages" }, { value: "products", label: "Products" },
            { value: "tracking", label: "Tracking & verification" }, { value: "robots", label: "Sitemap & robots" },
          ]} />
        </div>

        {tab === "overview" && (
          <div className="grid gap-6 p-5 lg:grid-cols-3">
            <div className="space-y-4">
              <div className="rounded-2xl bg-slate-50 p-5 text-center">
                <div className={`text-5xl font-semibold ${score >= 85 ? "text-emerald-600" : score >= 60 ? "text-amber-600" : "text-red-600"}`}>{score}</div>
                <div className="mt-1 text-sm text-slate-500">SEO health score</div>
                <div className="mt-3 flex justify-center gap-2"><Badge tone="red">{critical} to fix</Badge><Badge tone="amber">{warns} to improve</Badge></div>
              </div>
              <ul className="space-y-2 text-sm">
                <li><a className="font-medium underline" href="/sitemap.xml" target="_blank" rel="noreferrer">/sitemap.xml</a> <span className="text-slate-500">· {data.sitemapUrls} pages listed</span></li>
                <li><a className="font-medium underline" href="/robots.txt" target="_blank" rel="noreferrer">/robots.txt</a></li>
                <li><a className="font-medium underline" href="https://search.google.com/search-console" target="_blank" rel="noreferrer">Google Search Console ↗</a> <span className="text-slate-500">· submit the sitemap here</span></li>
                <li><a className="font-medium underline" href={`https://search.google.com/test/rich-results?url=${encodeURIComponent(f.site_url + "/product/" + (data.products[0]?.slug || ""))}`} target="_blank" rel="noreferrer">Rich results test ↗</a> <span className="text-slate-500">· checks product data</span></li>
                <li><a className="font-medium underline" href={`https://pagespeed.web.dev/analysis?url=${encodeURIComponent(f.site_url)}`} target="_blank" rel="noreferrer">PageSpeed Insights ↗</a></li>
              </ul>
              <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-600">
                <div className="mb-2 font-semibold text-slate-900">Already built in</div>
                <ul className="list-inside list-disc space-y-1">
                  <li>Unique title, description and canonical link on every page</li>
                  <li>Open Graph & X cards for link previews</li>
                  <li>Structured data: Organization, WebSite, Product (price, stock, rating, delivery, returns), Breadcrumbs, FAQ</li>
                  <li>Live sitemap with product images; robots.txt</li>
                  <li>Checkout and account pages kept out of Google</li>
                  <li>Tags written into the HTML by the server in production</li>
                </ul>
              </div>
            </div>
            <div className="lg:col-span-2">
              <h3 className="mb-3 font-semibold">Health check</h3>
              {!checks.length && <Alert type="ok">Everything looks good.</Alert>}
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {checks.map((c, i) => (
                  <li key={i} className="flex flex-wrap items-start gap-3 px-4 py-3 text-sm">
                    <Badge tone={LEVEL[c.level][1]}>{LEVEL[c.level][0]}</Badge>
                    <div className="min-w-0 flex-1"><div className="text-slate-900">{c.text}</div><div className="text-slate-500">{c.fix}</div></div>
                    <Button size="sm" variant="ghost" onClick={() => setTab(c.tab)}>Go →</Button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {tab === "general" && (<>
          <fieldset disabled={!canEdit} className="grid gap-5 p-5 lg:grid-cols-2">
            <div className="space-y-4">
              <Field label="Site address" hint="(your live domain, used in the sitemap, canonical links and shares)"><Input value={f.site_url} onChange={set("site_url")} placeholder="https://nawaratrend.com" /></Field>
              <Field label="Title pattern" hint="(%s is replaced by the page title)"><Input value={f.title_template} onChange={set("title_template")} /></Field>
              <Field label={<>Home page title <Count kind="title" value={f.default_title} /></>}><Input value={f.default_title} onChange={set("default_title")} maxLength={80} /></Field>
              <Field label={<>Default description <Count kind="description" value={f.default_description} /></>} hint="(home page, and any page without its own)"><Textarea value={f.default_description} onChange={set("default_description")} maxLength={200} /></Field>
            </div>
            <div className="space-y-4">
              <div><div className="mb-1.5 text-sm font-medium text-slate-700">Google preview (home page)</div><Snippet url={f.site_url + "/"} title={f.default_title} description={f.default_description} /></div>
              <Field label="Default share image" hint="(1200×630 works best)"><Input value={f.share_image} onChange={set("share_image")} placeholder="https://…" /></Field>
              {f.share_image && <img src={f.share_image} alt="" className="max-h-28 rounded-xl border border-slate-200 bg-slate-50 object-contain" />}
              <Field label="Logo for Google" hint="(square or wide image)"><Input value={f.logo_url} onChange={set("logo_url")} placeholder="https://…" /></Field>
              <Field label="X (Twitter) handle"><Input value={f.twitter_handle} onChange={set("twitter_handle")} placeholder="@nawaratrend" /></Field>
              <Field label="Social profiles" hint="(one link per line: Instagram, Facebook, YouTube…)"><Textarea value={f.social_links} onChange={set("social_links")} placeholder="https://www.instagram.com/…" /></Field>
            </div>
          </fieldset>
          <SaveBar keys={["site_url", "title_template", "default_title", "default_description", "share_image", "logo_url", "twitter_handle", "social_links"]} />
        </>)}

        {tab === "pages" && (
          <Table head={["Page", "Title in Google", "Description", "Indexing", ""]}>
            {data.pages.map((p) => (
              <tr key={p.key} className="align-top hover:bg-slate-50">
                <td className="px-4 py-3"><div className="font-medium">{p.label}</div><a href={p.path} target="_blank" rel="noreferrer" className="text-xs text-slate-500 underline">{p.path}</a>
                  <div className="mt-1 flex flex-wrap gap-1">{p.structuredData.map((t) => <Badge key={t} tone="violet">{t}</Badge>)}</div></td>
                <td className="max-w-xs px-4 py-3"><div>{p.finalTitle}</div><Count kind="title" value={p.finalTitle} /></td>
                <td className="max-w-sm px-4 py-3 text-slate-600"><div className="line-clamp-2">{p.finalDescription}</div><Count kind="description" value={p.finalDescription} /></td>
                <td className="px-4 py-3">{p.noindex ? <Badge>Hidden from Google</Badge> : <Badge tone="green">Indexed</Badge>}</td>
                <td className="px-4 py-3 text-right">{canEdit && <Button size="sm" variant="ghost" onClick={() => setEditing({ kind: "page", item: p, title: p.title, description: p.description, noindex: p.noindex })}>Edit</Button>}</td>
              </tr>
            ))}
          </Table>
        )}

        {tab === "products" && (
          <Table empty={!data.products.length && "No products on sale."} head={["Product", "Title in Google", "Description", ""]}>
            {data.products.map((p) => (
              <tr key={p.id} className="align-top hover:bg-slate-50">
                <td className="px-4 py-3"><Link to={`/admin/products/${p.id}`} className="font-medium hover:underline">{p.name}</Link><div className="text-xs text-slate-500">/product/{p.slug}</div>
                  <div className="mt-1 flex gap-1">{p.seo_title || p.seo_description ? <Badge tone="blue">Custom</Badge> : <Badge>Automatic</Badge>}{!p.hasImage && <Badge tone="amber">No photo</Badge>}</div></td>
                <td className="max-w-xs px-4 py-3"><div>{p.finalTitle}</div><Count kind="title" value={p.finalTitle} /></td>
                <td className="max-w-sm px-4 py-3 text-slate-600"><div className="line-clamp-2">{p.finalDescription}</div><Count kind="description" value={p.finalDescription} /></td>
                <td className="px-4 py-3 text-right">{canEdit && <Button size="sm" variant="ghost" onClick={() => setEditing({ kind: "product", item: p, title: p.seo_title || "", description: p.seo_description || "" })}>Edit</Button>}</td>
              </tr>
            ))}
          </Table>
        )}

        {tab === "tracking" && (<>
          <fieldset disabled={!canEdit} className="grid gap-5 p-5 lg:grid-cols-3">
            <Card className="p-4">
              <Field label="Google Analytics 4 measurement ID"><Input value={f.ga4_id} onChange={set("ga4_id")} placeholder="G-XXXXXXXXXX" /></Field>
              <p className="mt-2 text-xs text-slate-500">Loads only for visitors who accept analytics cookies (Google consent mode is set to "denied" until then).</p>
            </Card>
            <Card className="p-4">
              <Field label="Google Search Console verification"><Input value={f.google_verification} onChange={set("google_verification")} placeholder="code from content=&quot;…&quot;" /></Field>
              <p className="mt-2 text-xs text-slate-500">In Search Console choose "HTML tag" and paste only the code. Then submit <b>{f.site_url}/sitemap.xml</b>.</p>
            </Card>
            <Card className="p-4">
              <Field label="Bing Webmaster verification"><Input value={f.bing_verification} onChange={set("bing_verification")} placeholder="code from content=&quot;…&quot;" /></Field>
              <p className="mt-2 text-xs text-slate-500">Bing also powers search in Yahoo and DuckDuckGo results.</p>
            </Card>
          </fieldset>
          <SaveBar keys={["ga4_id", "google_verification", "bing_verification"]} />
        </>)}

        {tab === "robots" && (<>
          <fieldset disabled={!canEdit} className="grid gap-5 p-5 lg:grid-cols-2">
            <div className="space-y-4">
              <Toggle checked={!!f.indexing} onChange={set("indexing")} label="Allow search engines to index the store" disabled={!canEdit} />
              {!f.indexing && <Alert type="warn">While this is off, every page says "noindex" and robots.txt blocks all crawlers. Use it only while the store isn't ready.</Alert>}
              <Field label="Extra robots.txt rules" hint="(advanced, optional)"><Textarea rows={5} value={f.robots_extra} onChange={set("robots_extra")} placeholder={"User-agent: GPTBot\nDisallow: /"} /></Field>
              <p className="text-sm text-slate-500">The sitemap lists {data.sitemapUrls} pages: every page that's indexed, plus every product on sale with its photos. It updates by itself when you add or change products.</p>
            </div>
            <div><div className="mb-1.5 text-sm font-medium text-slate-700">Current robots.txt</div><pre className="max-h-80 overflow-auto rounded-xl bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">{data.robots}</pre></div>
          </fieldset>
          <SaveBar keys={["indexing", "robots_extra"]} />
        </>)}
      </Card>

      <Modal wide open={!!editing} title={editing ? `SEO for ${editing.item.label || editing.item.name}` : ""} onClose={() => setEditing(null)}
        footer={<><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button loading={saving} onClick={saveItem}>Save</Button></>}>
        {editing && (
          <div className="space-y-4">
            <Alert>{err}</Alert>
            <Field label={<>Title <Count kind="title" value={editing.title} /></>} hint="(leave empty for the automatic title)">
              <Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} maxLength={editing.kind === "product" ? 80 : 70}
                placeholder={editing.kind === "page" ? editing.item.defaultTitle || f.default_title : editing.item.finalTitle} />
            </Field>
            <Field label={<>Description <Count kind="description" value={editing.description} /></>} hint="(leave empty for the automatic description)">
              <Textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} maxLength={200}
                placeholder={editing.kind === "page" ? editing.item.defaultDescription || f.default_description : editing.item.finalDescription} />
            </Field>
            {editing.kind === "page" && (editing.item.lockedNoindex
              ? <p className="text-sm text-slate-500">This page is always kept out of Google (it's private to each customer).</p>
              : <Toggle checked={!!editing.noindex} onChange={(v) => setEditing({ ...editing, noindex: v })} label="Hide this page from Google (noindex)" />)}
            <div><div className="mb-1.5 text-sm font-medium text-slate-700">Google preview</div>
              <Snippet url={editing.item.url} title={previewTitle} description={editing.description || editing.item.finalDescription} /></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
