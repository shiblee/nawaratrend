# My Project

Full-stack starter with a Node.js/Express + MySQL backend, a React (Vite) frontend with a full admin panel, and an optional Python (FastAPI) service.

## Structure

```
my-project/
├── server/          # Node.js (Express) backend
│   └── src/
│       ├── config/       # MySQL pool + DB init/seed script
│       ├── routes/       # store.js (public shop API) + admin/ (auth, catalog, orders, system)
│       ├── lib/          # input checks, settings, activity log
│       ├── middleware/   # admin/customer sign-in checks and roles
│       ├── app.js
│       └── server.js
│
├── client/          # React (Vite) frontend
│   └── src/
│       ├── components/
│       │   └── admin/    # AdminLayout, ProtectedRoute
│       ├── pages/
│       │   ├── Home.jsx, Shop.jsx, Product.jsx, Checkout.jsx, …  # storefront pages
│       │   └── admin/    # Dashboard, Orders, Products, Categories, Customers, Messages, Team, Activity, Settings, Profile
│       ├── storefront/   # storefront markup, styles and scripts
│       ├── context/       # AdminAuthContext (JWT session)
│       └── services/
│
├── python/          # Python (FastAPI) service
│   └── app/
│       └── main.py
│
└── README.md
```

## Getting started

### Backend (Node + MySQL)

Uses MySQL — configured for MAMP by default (`localhost:8889`, `root`/`root`, database `nawaratrend`).

```bash
cd server
cp .env.example .env   # adjust DB credentials if needed
npm install
npm run init-db         # creates all tables, seeds categories, products and the first owner
npm run dev
```

Runs on http://localhost:5050

Default admin login: `admin@nawaratrend.com` / `Admin@123` — change the password after first login.

### Frontend (React)

```bash
cd client
cp .env.example .env
npm install
npm run dev
```

Runs on http://localhost:3000

- Public site: `/` (shop, product pages, checkout, account, help pages), with live data from the server
- Admin panel: `/admin/login`

### Python service

```bash
cd python
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Runs on http://localhost:8000

## Admin panel

Sign in at `/admin/login`. The first owner is `admin@nawaratrend.com` / `Admin@123`; you're asked to change it on first sign-in.

- **Dashboard**: sales today / 7 / 30 days (vs the previous 30), daily sales chart, orders by status, best sellers, sales by category and payment method, low stock, latest orders and recent activity.
- **Orders**: filter by status, payment, date or search; open an order to confirm → pack → ship → deliver (or cancel/return, which restocks), set courier and tracking, payment status and private notes; download a CSV.
- **Products**: price, MRP, cost and margin, stock (editable from the list), low-stock alert, SKU, sizes, highlights, photos, status (on sale / draft / archived), featured, and sales per product.
- **Categories**, **Customers** (orders, spend, addresses, notes, disable account) and **Messages** from the contact form.
- **Team** (owners): add people as owner / manager / staff, reset passwords, disable access, unlock accounts.
- **Activity log** (owners, managers): every change and sign-in, with who and from where.
- **Settings**: free-delivery threshold, delivery charge, Cash on Delivery on/off, store contact details.

| Role | Can do |
|---|---|
| Owner | Everything, including the team |
| Manager | Everything except the team |
| Staff | Orders, customers, messages and stock levels (view-only for products, categories and settings) |

### Security

- Passwords are hashed with bcrypt; admin passwords need 8+ characters with a letter and a number.
- 5 wrong passwords lock an account for 15 minutes; sign-in endpoints are also rate-limited per connection.
- Admin sessions last 8 hours and are re-checked on every request: changing a password, disabling someone or "Sign out everywhere" ends their sessions at once.
- Customer and admin tokens are separate, so a customer token can never open the admin API.
- The server recalculates every price and the delivery charge, and locks stock while an order is placed.
- `helmet` security headers, CORS limited to `CLIENT_ORIGIN`, 100 kB request limit, and the server refuses to start without a strong `JWT_SECRET`.

## Store API (public)

`GET /api/store/catalog`, `POST /api/store/contact`, `POST /api/store/auth/register|login`, `GET /api/store/auth/me`, `GET /api/store/orders/mine`, `POST /api/store/orders`.

## SEO, cookies and WhatsApp

- **Admin → SEO**: site address, title pattern, home title and description, share image, logo and social profiles; per-page and per-product titles/descriptions with a Google preview; Google Analytics 4, Search Console and Bing codes; indexing switch and extra robots rules; and a health check.
- Every page gets a unique title, description, canonical link, Open Graph / X cards and structured data (Organization, WebSite, Product with price, stock, rating, delivery and returns, BreadcrumbList, FAQPage). Checkout and account pages are `noindex`.
- `/sitemap.xml` (all indexed pages plus every product on sale, with photos) and `/robots.txt` are generated live from the database.
- **Cookie consent** banner with Accept all / Reject non-essential / Customise (necessary, analytics, marketing). Google Analytics loads only after analytics consent, with Google consent mode. "Cookie settings" in the footer reopens it.
- **WhatsApp**: number, greeting and the floating button are set in Admin → Settings; every WhatsApp/phone link and number on the site follows them.

## Going live (production)

**On GoDaddy cPanel, follow [DEPLOY.md](DEPLOY.md)**: `./scripts/build-deploy.sh` makes a ready-to-upload package. The general setup is:

```bash
cd client && VITE_API_URL=/api npm run build      # the shop calls the API on its own domain
cd ../server && SERVE_CLIENT=1 NODE_ENV=production npm start
```

With `SERVE_CLIENT=1` the server serves the built shop and writes each page's SEO tags into the HTML, so search engines see them without running JavaScript; missing pages return a real 404. Then:

1. Admin → SEO → General: set **Site address** to your domain (e.g. `https://nawaratrend.com`).
2. Set `CLIENT_ORIGIN` in `server/.env` to the same domain.
3. Admin → SEO → Tracking: add the Search Console code, then submit `https://your-domain/sitemap.xml` in Search Console.

## Notes

- Frontend uses Vite, so `index.html` lives at `client/index.html` (Vite's required location) instead of `client/public/index.html`; `client/public/` still holds static assets like the favicon.
- Backend port defaults to `5050` (not `5000`) to avoid conflicting with macOS AirPlay Receiver, which commonly occupies port 5000.
- Styling uses Tailwind CSS (via `@tailwindcss/vite`), imported in `client/src/index.css`.
