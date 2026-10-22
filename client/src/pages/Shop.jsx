import StorePage from "../components/StorePage.jsx";
import body from "../storefront/shop.html?raw";
import cardCss from "../storefront/card.css?inline";
import shopCss from "../storefront/shop.css?inline";
import { initShop } from "../storefront/shop.js";

export default function Shop() {
  return <StorePage title="Shop | NawaraTrend" body={body} css={cardCss + shopCss} init={initShop} />;
}
