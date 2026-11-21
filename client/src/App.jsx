import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Contact from "./pages/Contact.jsx";
import About from "./pages/About.jsx";
import Shop from "./pages/Shop.jsx";
import Product from "./pages/Product.jsx";
import { Checkout, CustomerLogin } from "./pages/Checkout.jsx";
import { Account, TrackOrder, ResetPassword } from "./pages/Account.jsx";
import { Terms, ShippingPolicy, RefundPolicy, PrivacyPolicy, Faqs } from "./pages/Policies.jsx";
import { AdminAuthProvider } from "./context/AdminAuthContext.jsx";
import ProtectedRoute from "./components/admin/ProtectedRoute.jsx";
const AdminLayout = lazy(() => import("./components/admin/AdminLayout.jsx"));
const Login = lazy(() => import("./pages/admin/Login.jsx"));
const Dashboard = lazy(() => import("./pages/admin/Dashboard.jsx"));
const Products = lazy(() => import("./pages/admin/Products.jsx"));
const ProductEdit = lazy(() => import("./pages/admin/ProductEdit.jsx"));
const Categories = lazy(() => import("./pages/admin/Categories.jsx"));
const Orders = lazy(() => import("./pages/admin/Orders.jsx"));
const OrderDetail = lazy(() => import("./pages/admin/OrderDetail.jsx"));
const Customers = lazy(() => import("./pages/admin/Customers.jsx"));
const CustomerDetail = lazy(() => import("./pages/admin/Customers.jsx").then((m) => ({ default: m.CustomerDetail })));
const Messages = lazy(() => import("./pages/admin/Messages.jsx"));
const Team = lazy(() => import("./pages/admin/Team.jsx"));
const Activity = lazy(() => import("./pages/admin/Activity.jsx"));
const Settings = lazy(() => import("./pages/admin/Settings.jsx"));
const Seo = lazy(() => import("./pages/admin/Seo.jsx"));
const Profile = lazy(() => import("./pages/admin/Profile.jsx"));
const Emails = lazy(() => import("./pages/admin/Emails.jsx"));
const EmailTemplateEdit = lazy(() => import("./pages/admin/EmailTemplateEdit.jsx"));
const OtpSettings = lazy(() => import("./pages/admin/Communication.jsx").then((m) => ({ default: m.OtpSettings })));
const DeliveryLogs = lazy(() => import("./pages/admin/Communication.jsx").then((m) => ({ default: m.DeliveryLogs })));

export default function App() {
  return (
    <AdminAuthProvider>
      <BrowserRouter>
        {/* admin pages are loaded on demand, so shoppers never download the admin panel */}
        <Suspense fallback={<div style={{ minHeight: "100vh" }} />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/shop/:cat" element={<Shop />} />
          <Route path="/product/:id" element={<Product />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/login" element={<CustomerLogin />} />
          <Route path="/account/*" element={<Account />} />
          <Route path="/track" element={<TrackOrder />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/faqs" element={<Faqs />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/shipping-policy" element={<ShippingPolicy />} />
          <Route path="/refund-policy" element={<RefundPolicy />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/admin/login" element={<Login />} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="orders" element={<Orders />} />
            <Route path="orders/:id" element={<OrderDetail />} />
            <Route path="products" element={<Products />} />
            <Route path="products/:id" element={<ProductEdit />} />
            <Route path="categories" element={<Categories />} />
            <Route path="customers" element={<ProtectedRoute perm="customers.view"><Customers /></ProtectedRoute>} />
            <Route path="customers/:id" element={<ProtectedRoute perm="customers.view"><CustomerDetail /></ProtectedRoute>} />
            <Route path="messages" element={<Messages />} />
            <Route path="team" element={<ProtectedRoute roles={["owner"]}><Team /></ProtectedRoute>} />
            <Route path="activity" element={<ProtectedRoute roles={["owner", "manager"]}><Activity /></ProtectedRoute>} />
            <Route path="seo" element={<Seo />} />
            <Route path="emails" element={<ProtectedRoute perm="templates.edit"><Emails /></ProtectedRoute>} />
            <Route path="emails/templates/:key" element={<ProtectedRoute perm="templates.edit"><EmailTemplateEdit /></ProtectedRoute>} />
            <Route path="communication/sms" element={<ProtectedRoute perm="sms.settings"><OtpSettings /></ProtectedRoute>} />
            <Route path="communication/logs" element={<ProtectedRoute perm="logs.view"><DeliveryLogs /></ProtectedRoute>} />
            <Route path="settings" element={<Settings />} />
            <Route path="profile" element={<Profile />} />
            <Route path="*" element={<Navigate to="dashboard" replace />} />
          </Route>
        </Routes>
        </Suspense>
      </BrowserRouter>
    </AdminAuthProvider>
  );
}
