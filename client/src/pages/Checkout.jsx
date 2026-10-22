import StorePage from "../components/StorePage.jsx";
import checkoutBody from "../storefront/checkout.html?raw";
import loginBody from "../storefront/login.html?raw";
import css from "../storefront/account.css?inline";
import { initCheckout } from "../storefront/checkout.js";
import { initLogin } from "../storefront/login.js";

export function Checkout() {
  return <StorePage title="Checkout | NawaraTrend" body={checkoutBody} css={css} init={initCheckout} />;
}

// Customer sign-in (the admin panel has its own login at /admin/login)
export function CustomerLogin() {
  return <StorePage title="Sign in | NawaraTrend" body={loginBody} css={css} init={initLogin} />;
}
