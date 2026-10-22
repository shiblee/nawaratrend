import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import top from "../storefront/shell-top.html?raw";
import bottom from "../storefront/shell-bottom.html?raw";
import baseCss from "../storefront/storefront.css?inline";
import { initStorefront, loadCatalog, syncContacts } from "../storefront/storefront.js";
import { applySeo } from "../storefront/seo.js";

// Renders a storefront page: shared header + page body + shared footer.
// The storefront stylesheets set global rules (body, h1, a…), so they're only
// attached while a store page is mounted and don't leak into the admin panel.
// Products and categories are loaded from the server first, so every page shows live data;
// then the page gets its SEO tags and the contact numbers configured in the admin panel.
export default function StorePage({ title, body, css = "", init }) {
  const root = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    document.title = title;
    const style = document.createElement("style");
    style.dataset.storefront = "";
    style.textContent = baseCss + css;
    document.head.appendChild(style);

    const el = root.current;
    let cleanups = [];
    let closed = false;

    // Internal links ("/", "/contact", "/#catalogue") navigate inside the app instead of reloading.
    const onClick = (e) => {
      const a = e.target.closest("a[href^='/']");
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || a.target) return;
      const url = new URL(a.href);
      if (url.pathname === location.pathname) {
        if (url.hash) return; // same page anchor: let the browser scroll
        e.preventDefault();
        window.scrollTo({ top: 0 });
        return;
      }
      e.preventDefault();
      navigate(url.pathname + url.search + url.hash);
    };
    el.addEventListener("click", onClick);

    loadCatalog().then(() => {
      if (closed) return;
      el.innerHTML = top + body + bottom;
      // page scripts get `navigate` so they can move to another page (e.g. back to checkout after signing in)
      cleanups = [initStorefront(), init?.({ navigate })];
      syncContacts(el);   // phone / WhatsApp numbers from the admin settings
      applySeo();         // title, description, canonical, social cards, structured data

      // arriving from another page: jump to the requested section, or start at the top
      const target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target) target.scrollIntoView();
      else window.scrollTo({ top: 0, behavior: "instant" });
    });

    return () => {
      closed = true;
      el.removeEventListener("click", onClick);
      cleanups.forEach((fn) => fn?.());
      style.remove();
      el.innerHTML = "";
    };
  }, [title, body, css, init, navigate]);

  return <div ref={root} style={{ minHeight: "100vh" }} />;
}
