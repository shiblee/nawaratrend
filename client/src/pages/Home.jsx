import StorePage from "../components/StorePage.jsx";
import body from "../storefront/home.html?raw";

export default function Home() {
  return <StorePage title="Nawara Trend" body={body} />;
}
