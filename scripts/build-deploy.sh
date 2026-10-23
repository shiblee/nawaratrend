#!/usr/bin/env bash
# Builds deploy/nawaratrend-deploy.zip for GoDaddy cPanel ("Setup Node.js App").
# Usage: ./scripts/build-deploy.sh   (then follow DEPLOY.md)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/deploy"
PKG="$OUT/build/nawaratrend"
DOMAIN="${DOMAIN:-nawaratrend.com}"

rm -rf "$OUT/build" "$OUT/nawaratrend-deploy.zip"
mkdir -p "$PKG/server" "$PKG/client/src/storefront/policies"

echo "1/3 Building the shop (it will call the API on its own domain: /api)…"
(cd "$ROOT/client" && VITE_API_URL=/api npx vite build --outDir "$PKG/client/dist" --emptyOutDir >/dev/null)

echo "2/3 Copying the server…"
cp -R "$ROOT/server/src" "$PKG/server/src"
cp "$ROOT/server/package.json" "$ROOT/server/package-lock.json" "$ROOT/server/start.cjs" "$PKG/server/"
# the FAQ text is also used by the server for Google's FAQ rich results
cp "$ROOT/client/src/storefront/policies/faqs.js" "$PKG/client/src/storefront/policies/"

# Server settings. A new secret key is made once and reused on later builds,
# so customers and admins stay signed in after an update.
ENV_FILE="$OUT/production.env"
if [ ! -f "$ENV_FILE" ]; then
  SECRET="$(node -e 'console.log(require("crypto").randomBytes(48).toString("hex"))')"
  cat > "$ENV_FILE" <<ENV
# NawaraTrend production settings. Fill in the three DB_ values from cPanel > MySQL Databases.
NODE_ENV=production
SERVE_CLIENT=1
TRUST_PROXY=1
CANONICAL_HOST=$DOMAIN
SITE_URL=https://$DOMAIN
CLIENT_ORIGIN=https://$DOMAIN,https://www.$DOMAIN

DB_HOST=localhost
DB_PORT=3306
DB_NAME=FILL_IN_database_name
DB_USER=FILL_IN_database_user
DB_PASSWORD=FILL_IN_database_password

JWT_SECRET=$SECRET
ENV
  echo "   Created deploy/production.env (keep it private: it holds the secret key)"
fi
cp "$ENV_FILE" "$PKG/server/.env"

echo "3/3 Zipping…"
(cd "$OUT/build" && zip -qr "$OUT/nawaratrend-deploy.zip" nawaratrend)
echo "Done: deploy/nawaratrend-deploy.zip ($(du -h "$OUT/nawaratrend-deploy.zip" | cut -f1))"
