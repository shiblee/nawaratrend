import StorePage from "../components/StorePage.jsx";
import css from "../storefront/policy.css?inline";

// The help pages listed on the left; the current one is highlighted.
// Keep this order the same as the footer's Help links (storefront/shell-bottom.html).
const PAGES = [
  ["/terms", "Terms &amp; Conditions"],
  ["/privacy-policy", "Privacy Policy"],
  ["/shipping-policy", "Shipping Policy"],
  ["/refund-policy", "Returns &amp; Refunds"],
  ["/faqs", "FAQs"],
];

// On phones the page list is a sideways-scrolling row: bring the current page into view.
const centerCurrent = () => {
  const nav = document.querySelector(".p-nav"), a = nav?.querySelector('[aria-current="page"]');
  if (a) nav.scrollLeft = a.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2;
};

// Shared layout for Terms, Privacy, Shipping, Returns and FAQs:
// page list on the left, the whole page as plain text on the right.
// `heading` + `highlight` form the page title; the highlight gets the marigold underline used on every page heading.
export default function PolicyPage({ path, title, heading, highlight, intro, sections }) {
  const nav = PAGES.map(([href, name]) =>
    `<a href="${href}"${href === path ? ' aria-current="page"' : ""}>${name}</a>`
  ).join("");

  const body = `<main id="top">
<section class="p-head">
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><span aria-current="page">${heading} ${highlight}</span></nav>
    <h1>${heading} <span>${highlight}</span></h1>
    ${intro ? `<p class="p-intro">${intro}</p>` : ""}
  </div>
</section>

<section>
  <div class="wrap p-grid">
    <nav class="p-nav" aria-label="Help pages">${nav}</nav>
    <article class="p-doc">
${sections}
      <p class="p-help">Still have a question? <a href="/contact">Contact us</a>, call <a href="tel:+918960888231">+91 89608 88231</a> or <a href="https://wa.me/919807562620">WhatsApp us</a>.</p>
    </article>
  </div>
</section>
</main>`;

  return <StorePage title={title} body={body} css={css} init={centerCurrent} />;
}
