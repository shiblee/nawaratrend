import { useCallback } from "react";
import { useParams } from "react-router-dom";
import StorePage from "../components/StorePage.jsx";
import body from "../storefront/product.html?raw";
import cardCss from "../storefront/card.css?inline";
import productCss from "../storefront/product.css?inline";
import { initProduct } from "../storefront/product.js";

export default function Product() {
  const { id } = useParams();
  const init = useCallback(() => initProduct(id), [id]);
  // key: moving from one product to another rebuilds the page
  return <StorePage key={id} title="NawaraTrend" body={body} css={cardCss + productCss} init={init} />;
}
