/* FAQ content for the FAQs help page. Each topic becomes a section; each question an <h3> with its answer. */

/* ================== EDIT YOUR FAQs HERE ================== */
// Keep these answers in step with the Shipping, Returns and Privacy pages.
export const TOPICS = [
  {k:"orders",   n:"Orders & delivery"},
  {k:"returns",  n:"Returns & refunds"},
  {k:"payments", n:"Payments"},
  {k:"products", n:"Products"},
  {k:"account",  n:"Account & privacy"}
];
export const FAQS = [
  {t:"orders", q:"Do you offer free delivery?", a:`<p>Yes. All orders of ₹999 and above ship free anywhere in India. For orders below ₹999, a small flat delivery charge is added and shown at checkout before you pay. There are no hidden charges at the door.</p>`},
  {t:"orders", q:"How long will my order take to arrive?", a:`<p>We pack and dispatch orders within 1–2 business days. After dispatch, delivery usually takes:</p><ul><li>1–3 business days within Lucknow,</li><li>3–5 business days to metro cities,</li><li>5–8 business days to the rest of India,</li><li>7–12 business days to remote areas and the North-East.</li></ul><p>Full details are in our <a href="/shipping-policy">Shipping Policy</a>.</p>`},
  {t:"orders", q:"How do I track my order?", a:`<p>As soon as your order ships, we send the courier name and tracking number by SMS, email or WhatsApp. You can also sign in and open <a href="/login">My orders</a>, or send your order number to us on <a href="https://wa.me/919807562620">WhatsApp</a>.</p>`},
  {t:"orders", q:"Can I change or cancel my order?", a:`<p>Yes, free of charge, as long as it hasn't been dispatched yet. Contact us quickly on WhatsApp (+91 98075 62620) or call +91 89608 88231 with your order number. Once an order has shipped it can't be cancelled, but you can refuse the delivery or return it under our <a href="/refund-policy">Returns &amp; Refunds Policy</a>.</p>`},
  {t:"orders", q:"Can I change my delivery address?", a:`<p>Yes, before the order is dispatched. Message us your order number and the new address as soon as possible. Once the parcel has shipped, the address usually can't be changed.</p>`},
  {t:"orders", q:"Do you deliver everywhere in India?", a:`<p>We deliver to most PIN codes across India through trusted courier partners. If a courier can't serve your PIN code, we'll tell you before dispatch and offer a full refund or an alternative address. We don't ship outside India at the moment.</p>`},
  {t:"orders", q:"What happens if I miss the delivery?", a:`<p>The courier usually tries to deliver up to three times. If it still can't be delivered, the parcel comes back to us and we'll contact you to re-ship it or refund the product value. Please give a complete address and a phone number you'll answer.</p>`},
  {t:"returns", q:"What is your return policy?", a:`<p>You can request a return or exchange within <b>7 days</b> of delivery. Items must be unused, in their original packaging, and have all tags and accessories. Our <a href="/refund-policy">Returns &amp; Refunds Policy</a> has the full details.</p>`},
  {t:"returns", q:"How do I start a return?", a:`<p>Contact us on WhatsApp or through our <a href="/contact">contact page</a> with:</p><ul><li>your order number,</li><li>the item you want to return and the reason,</li><li>a photo if the item is damaged or different from what you ordered.</li></ul><p>We'll arrange a reverse pickup for most PIN codes and guide you through the next steps.</p>`},
  {t:"returns", q:"My item arrived damaged or wrong. What should I do?", a:`<p>We're sorry about that. Please contact us within <b>48 hours</b> of delivery with your order number and clear photos or an unboxing video. We'll arrange a free pickup and send a replacement, or give you a full refund if it isn't available.</p>`},
  {t:"returns", q:"Can I exchange an item for a different size or colour?", a:`<p>Yes. Size and colour exchanges of the same product are free, subject to stock. We send the replacement once the original passes our quality check. If it's out of stock, we refund you instead.</p>`},
  {t:"returns", q:"Which items can't be returned?", a:`<p>For hygiene and safety reasons, these can only be returned if they arrive damaged or wrong:</p><ul><li>opened beauty and skincare products,</li><li>innerwear and socks,</li><li>earbuds and in-ear products once opened,</li><li>items marked "non-returnable", and gift cards.</li></ul>`},
  {t:"returns", q:"When will I get my refund?", a:`<p>We check returned items within 2 business days of receiving them. Once approved, we start the refund within 2 business days, and it usually reaches you in 5–7 business days depending on your bank. Refunds go to your original payment method. For Cash on Delivery orders, we refund to a bank account or UPI ID you share with us.</p>`},
  {t:"payments", q:"Which payment methods do you accept?", a:`<p>You can pay with UPI (Google Pay, PhonePe, Paytm, BHIM), debit cards, credit cards and net banking. Cash on Delivery is also available on most PIN codes.</p>`},
  {t:"payments", q:"Is Cash on Delivery available?", a:`<p>Yes, for most PIN codes. Whether it's available for your address is shown at checkout. Please keep the exact amount ready, as couriers may not carry change. We may confirm COD orders by phone or WhatsApp before dispatch.</p>`},
  {t:"payments", q:"Is it safe to pay online on your website?", a:`<p>Yes. Online payments go through secure, encrypted payment gateways, and we never see or store your full card number, CVV or UPI PIN. Look for the padlock icon in your browser's address bar.</p>`},
  {t:"payments", q:"My payment failed but money was deducted. What now?", a:`<p>Don't worry. This is usually a temporary hold by your bank, and the amount is returned automatically within a few working days. If it isn't, send us your order number and transaction ID on WhatsApp and we'll help sort it out.</p>`},
  {t:"products", q:"Are your products genuine?", a:`<p>Yes. Every product we sell is 100% genuine and checked for quality before it ships. We keep a small range so we can stand behind each item.</p>`},
  {t:"products", q:"Will the product look exactly like the photo?", a:`<p>We try to show every product as accurately as possible. Colours can look slightly different depending on your screen. If you're unsure, ask us on WhatsApp for more photos or details before you order.</p>`},
  {t:"products", q:"Can you stock a product I'm looking for?", a:`<p>Tell us what you need on <a href="https://wa.me/919807562620">WhatsApp</a> or through our <a href="/contact">contact page</a>. If we can source a good-quality option, we'll let you know.</p>`},
  {t:"account", q:"Do I need an account to place an order?", a:`<p>An account makes it easier to track orders and check out faster next time. You can create one in a minute from <a href="/login">My account</a>.</p>`},
  {t:"account", q:"I forgot my password. How do I reset it?", a:`<p>Go to <a href="/login">My account</a> and choose "Lost your password?". Enter your email and we'll send you a link to set a new password.</p>`},
  {t:"account", q:"How do you use my personal details?", a:`<p>We use your name, phone number, email and address only to process and deliver your orders and to support you. We share them only with partners who help us do that, such as couriers and payment gateways, and we never sell your data. Read our <a href="/privacy-policy">Privacy Policy</a> to learn more, including how to ask us to correct or delete your data.</p>`}
];
/* ========================================================== */

export const faqSections = TOPICS.map(t => `<section id="faq-${t.k}">
  <h2>${t.n}</h2>
${FAQS.filter(f => f.t === t.k).map(f => `  <h3>${f.q}</h3>\n  ${f.a}`).join("\n")}
</section>`).join("\n\n");
