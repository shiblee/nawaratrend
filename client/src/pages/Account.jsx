import { useLocation } from "react-router-dom";
import StorePage from "../components/StorePage.jsx";
import accountBody from "../storefront/account.html?raw";
import trackBody from "../storefront/track.html?raw";
import resetBody from "../storefront/reset.html?raw";
import css from "../storefront/account.css?inline";
import { initAccount } from "../storefront/account.js";
import { initTrack } from "../storefront/track.js";
import { initReset } from "../storefront/reset.js";

// My account: one page for /account, /account/profile, /account/security and /account/orders/:number.
// The key makes it start fresh for each of those addresses.
export function Account() {
  const { pathname } = useLocation();
  return <StorePage key={pathname} title="My account | NawaraTrend" body={accountBody} css={css} init={initAccount} />;
}

export function TrackOrder() {
  const { search } = useLocation();
  return <StorePage key={search} title="Track your order | NawaraTrend" body={trackBody} css={css} init={initTrack} />;
}

export function ResetPassword() {
  return <StorePage title="Reset your password | NawaraTrend" body={resetBody} css={css} init={initReset} />;
}
