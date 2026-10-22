import PolicyPage from "./PolicyPage.jsx";
import terms from "../storefront/policies/terms.html?raw";
import shipping from "../storefront/policies/shipping.html?raw";
import returns from "../storefront/policies/returns.html?raw";
import privacy from "../storefront/policies/privacy.html?raw";
import { faqSections } from "../storefront/policies/faqs.js";

export function Terms() {
  return (
    <PolicyPage
      path="/terms"
      title="Terms & Conditions | NawaraTrend"
      heading="Terms &amp;"
      highlight="Conditions"
      intro="The rules for shopping with NawaraTrend."
      sections={terms}
    />
  );
}

export function PrivacyPolicy() {
  return (
    <PolicyPage
      path="/privacy-policy"
      title="Privacy Policy | NawaraTrend"
      heading="Privacy"
      highlight="Policy"
      intro="What personal data we collect, how we use and protect it, and the choices you have."
      sections={privacy}
    />
  );
}

export function ShippingPolicy() {
  return (
    <PolicyPage
      path="/shipping-policy"
      title="Shipping Policy | NawaraTrend"
      heading="Shipping"
      highlight="Policy"
      intro="How and when your order reaches you, and what delivery costs."
      sections={shipping}
    />
  );
}

export function RefundPolicy() {
  return (
    <PolicyPage
      path="/refund-policy"
      title="Returns & Refunds | NawaraTrend"
      heading="Returns &amp;"
      highlight="Refunds"
      intro="How cancellations, returns, exchanges and refunds work."
      sections={returns}
    />
  );
}

export function Faqs() {
  return (
    <PolicyPage
      path="/faqs"
      title="FAQs | NawaraTrend"
      heading="Frequently asked"
      highlight="questions"
      intro="Quick answers about orders, delivery, returns, payments and your account."
      sections={faqSections}
    />
  );
}
