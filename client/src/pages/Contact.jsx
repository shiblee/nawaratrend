import StorePage from "../components/StorePage.jsx";
import body from "../storefront/contact.html?raw";
import css from "../storefront/contact.css?inline";
import { initContact } from "../storefront/contact.js";

export default function Contact() {
  return <StorePage title="Contact NawaraTrend" body={body} css={css} init={initContact} />;
}
