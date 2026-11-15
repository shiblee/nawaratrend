/* The order journey: every status, which status may follow which, and what the customer is told.
   Shared by the admin order routes, the customer account routes and the email templates. */

export const STATUS = {
  pending: "Order placed",
  on_hold: "On hold",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  out_for_delivery: "Out for delivery",
  delivery_failed: "Delivery attempt failed",
  delivered: "Delivered",
  return_requested: "Return requested",
  returned: "Returned",
  cancelled: "Cancelled",
};
export const STATUS_KEYS = Object.keys(STATUS);

// Which status each status may move to. Only these moves are allowed, so an order can't jump around.
export const NEXT = {
  pending: ["confirmed", "on_hold", "cancelled"],
  on_hold: ["confirmed", "cancelled"],
  confirmed: ["packed", "on_hold", "cancelled"],
  packed: ["shipped", "on_hold", "cancelled"],
  shipped: ["out_for_delivery", "delivered", "delivery_failed", "returned"],
  out_for_delivery: ["delivered", "delivery_failed"],
  delivery_failed: ["out_for_delivery", "delivered", "returned"],
  delivered: ["return_requested", "returned"],
  return_requested: ["returned", "delivered"],   // back to "delivered" = return not accepted
  returned: [],
  cancelled: [],
};

// Cancelling or returning puts the items back in stock.
export const RESTOCK = ["cancelled", "returned"];
// Orders in these statuses don't count as sales.
export const NOT_SALE = ["cancelled", "returned"];

export const PAYMENT_STATUS = { pending: "Unpaid", paid: "Paid", failed: "Payment failed", refund_pending: "Refund initiated", refunded: "Refunded" };
export const PAYMENT_KEYS = Object.keys(PAYMENT_STATUS);
export const PAY_METHOD = { upi: "UPI", card: "Card", cod: "Cash on Delivery" };

// The customer's progress bar. Exceptions (on hold, cancelled, returns…) are shown as their own notice.
export const PROGRESS = ["pending", "confirmed", "packed", "shipped", "out_for_delivery", "delivered"];

// Shown on the customer's timeline when the team didn't write a message of its own.
export const DEFAULT_MESSAGE = {
  pending: "We've received your order.",
  on_hold: "Your order is on hold for a moment. We'll be in touch if we need anything from you.",
  confirmed: "Your order is confirmed and we're getting it ready.",
  packed: "Your order is packed and will be handed to the courier soon.",
  shipped: "Your order is on its way.",
  out_for_delivery: "Your order is out for delivery today.",
  delivery_failed: "The courier couldn't deliver your order. They'll try again, or we'll contact you.",
  delivered: "Your order has been delivered. Enjoy!",
  return_requested: "We've received your return request and will arrange a pickup.",
  returned: "Your return has been received.",
  cancelled: "Your order has been cancelled.",
};

// Which email goes out when an order reaches a status / payment status (template keys in lib/email/templates.js)
export const STATUS_EMAIL = {
  confirmed: "order_confirmed", on_hold: "order_on_hold", packed: "order_packed", shipped: "order_shipped",
  out_for_delivery: "order_out_for_delivery", delivery_failed: "order_delivery_failed", delivered: "order_delivered",
  return_requested: "order_return_requested", returned: "order_returned", cancelled: "order_cancelled",
};
export const PAYMENT_EMAIL = { paid: "payment_received", refund_pending: "refund_initiated", refunded: "refund_completed" };
