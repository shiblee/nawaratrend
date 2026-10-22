import StorePage from "../components/StorePage.jsx";
import body from "../storefront/about.html?raw";
import css from "../storefront/about.css?inline";

export default function About() {
  return <StorePage title="About NawaraTrend" body={body} css={css} />;
}
