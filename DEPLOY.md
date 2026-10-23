# Putting NawaraTrend live on nawaratrend.com (GoDaddy cPanel)

Takes about 30–45 minutes the first time. Your **email is not affected**: it runs on `mail.nawaratrend.com`, which we don't touch.

You'll need: your GoDaddy login, and this project on your Mac.

> **Your hosting has more than one site.** The main domain is misoftwaresolutions.com, whose files are in `public_html`.
> nawaratrend.com is an extra ("addon") domain whose files are in **`public_html/nawaratrend.com`**.
> Only ever change that `nawaratrend.com` folder, so misoftwaresolutions.com keeps working.

---

## Step 1 — Back up the old site (5 min)

The old site at nawaratrend.com is currently broken (it shows a server error), but keep a copy anyway.

1. GoDaddy → **My Products** → **Web Hosting** → **Manage** → **cPanel Admin**.
2. cPanel → **File Manager** → open **public_html** → **nawaratrend.com**.
3. Click **Select All** → **Compress** → *Zip Archive* → name it `old-site-backup.zip` → **Compress Files**.
4. Right-click `old-site-backup.zip` → **Download**. Keep it on your computer.

## Step 2 — Create the database (5 min)

1. cPanel → **MySQL® Database Wizard**.
2. **Database name**: `nawaratrend` → **Next Step**. cPanel adds a prefix, so the real name is something like `abc123_nawaratrend`. **Write it down.**
3. **Username**: `nawaradb`, and click **Password Generator** for a strong password → **Create User**. Write down the full username (e.g. `abc123_nawaradb`) and the password.
4. Tick **ALL PRIVILEGES** → **Next Step**.

## Step 3 — Put the database details in the package (2 min, on your Mac)

1. In VS Code, open `deploy/production.env`.
2. Replace the three `FILL_IN_…` values with what you wrote down:
   ```
   DB_NAME=abc123_nawaratrend
   DB_USER=abc123_nawaradb
   DB_PASSWORD=the-generated-password
   ```
3. Save, then rebuild the package in the VS Code terminal:
   ```bash
   ./scripts/build-deploy.sh
   ```
   This makes `deploy/nawaratrend-deploy.zip`. **Never share `production.env` or the zip**: they contain your database password and the site's secret key. (Both are excluded from GitHub.)

## Step 4 — Upload the store (5 min)

1. cPanel → **File Manager** → go to your **home folder** (the top level, `/home/yourname`, *not* public_html: files inside public_html can be downloaded by anyone, and the package contains your passwords).
2. **Upload** → choose `deploy/nawaratrend-deploy.zip`. Wait until it says 100%, then go back.
3. Right-click the zip → **Extract** → **Extract Files**. You now have a folder `nawaratrend` with `server` and `client` inside.
4. Delete the zip from the server (it contains your passwords).

## Step 5 — Clear the old site out of public_html/nawaratrend.com (2 min)

1. Open **public_html** → **nawaratrend.com** (not public_html itself: that's misoftwaresolutions.com).
2. **Select All**, then **untick** `.well-known` and `cgi-bin` if they're there (they're needed for the SSL certificate).
3. **Move** → type `/old-nawaratrend-site` → **Move Files**. (Nothing is deleted; it's all in that folder and in your backup zip.)

## Step 6 — Start the Node.js app (10 min)

1. cPanel → **Software** → **Setup Node.js App** → **Create Application**.
   - **Node.js version**: the highest available (needs **18 or newer**; 20 or 22 is best).
   - **Application mode**: Production
   - **Application root**: `nawaratrend/server`
   - **Application URL**: `nawaratrend.com` (leave the box after it empty)
   - **Application startup file**: `start.cjs`
   - Click **Create**.
2. On the same page click **Run NPM Install** and wait for it to finish (1–3 minutes).
3. Create the tables and starting products: in **Run JS script**, choose **init-db** → **Run**. You should see "Database initialized successfully".
4. Click **Restart**.

> Don't see "Setup Node.js App"? Your hosting plan doesn't support Node.js. Stop here and tell me; we'll pick another option.

## Step 7 — Check the security certificate (2 min)

1. cPanel → **SSL/TLS Status**.
2. Make sure `nawaratrend.com` and `www.nawaratrend.com` show a green padlock. If not, tick them and click **Run AutoSSL**, then wait 10 minutes.

## Step 8 — Check the site (5 min)

Open these in your browser:

| Address | What you should see |
|---|---|
| https://nawaratrend.com | The new shop with 8 products and the cookie banner |
| https://www.nawaratrend.com | Jumps to https://nawaratrend.com |
| https://nawaratrend.com/product/shirt | The shirt's product page |
| https://nawaratrend.com/sitemap.xml | A list of addresses starting with https://nawaratrend.com |
| https://nawaratrend.com/admin/login | The admin sign-in |

## Step 9 — Secure the admin and finish setup (5 min)

1. Sign in at https://nawaratrend.com/admin/login with `admin@nawaratrend.com` / `Admin@123`.
2. You're taken to **My profile**: **change the password right away** (the default is public on GitHub).
3. **Settings**: check the phone number, WhatsApp number and delivery charges.
4. **Products**: add real photos and products when ready.

## Step 10 — Tell Google about the site (10 min)

1. Go to https://search.google.com/search-console → **Add property** → **URL prefix** → `https://nawaratrend.com`.
2. Choose **HTML tag**. Copy only the code inside `content="…"`.
3. Admin → **SEO** → **Tracking & verification** → paste it into **Google Search Console verification** → **Save**.
4. Back in Search Console click **Verify**, then **Sitemaps** → enter `sitemap.xml` → **Submit**.

---

## Updating the site later

When you (or I) change the code:

1. On your Mac: `./scripts/build-deploy.sh`
2. cPanel → File Manager → home folder → upload the new zip → **Extract** (say yes to overwrite) → delete the zip.
3. Setup Node.js App → **Run NPM Install** → **Restart**.

Your products, orders and settings live in the database, so they're not affected by updates.

## If something goes wrong

| Problem | What to do |
|---|---|
| "We're sorry, but something went wrong" or a blank page | File Manager → `nawaratrend/server/stderr.log` shows the error. Send it to me. |
| Error mentions `Access denied for user` | The database name/user/password in `production.env` don't match cPanel. Re-check Step 2 and 3, rebuild, re-upload. |
| Error mentions `Unexpected token` or an old Node version | In Setup Node.js App, choose a newer Node.js version (18+), then Restart. |
| The old site still shows | public_html/nawaratrend.com still has old files (Step 5), or your browser cached it: try a private window. |
| "Not secure" warning | Step 7: run AutoSSL and wait. |
