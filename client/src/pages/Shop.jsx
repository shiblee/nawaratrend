import { useLocation } from "react-router-dom";
import StorePage from "../components/StorePage.jsx";
import body from "../storefront/shop.html?raw";
import cardCss from "../storefront/card.css?inline";
import shopCss from "../storefront/shop.css?inline";
import { initShop } from "../storefront/shop.js";

export default function Shop() {
  // a link to another category (/shop/fashion → /shop/beauty) starts the page afresh on that category
  const { pathname } = useLocation();
  return <StorePage key={pathname.startsWith("/shop/") ? pathname : "/shop"} title="Shop | NawaraTrend" body={body} css={cardCss + shopCss} init={initShop} />;
}
