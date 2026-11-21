#!/usr/bin/env bash
# Builds the store and puts it live on nawaratrend.com over SSH, then restarts the app.
# Usage: ./scripts/deploy.sh   (needs your Mac's SSH key on the server: see DEPLOY.md)
#
# Server layout (set up once, Oct 2026):
#   ~/nawaratrend/{server,client}          the app, outside public_html so .env can't be downloaded
#   ~/nodejs/bin/node                      Node.js 22 (GoDaddy doesn't provide one on this server)
#   ~/public_html/nawaratrend.com/.htaccess  tells Passenger to run the app for nawaratrend.com
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${DEPLOY_HOST:-mjgykn3s9utp@184.168.114.12}"
PKG="$ROOT/deploy/build/nawaratrend"

"$ROOT/scripts/build-deploy.sh"

echo "Installing server libraries…"
(cd "$PKG/server" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund >/dev/null)

echo "Uploading to ${HOST}…"
rsync -rlt --delete --exclude tmp/ -e "ssh -o BatchMode=yes" "$PKG/" "$HOST:nawaratrend/"

# new tables and columns (safe to run every time: it only adds what's missing)
echo "Updating the database…"
ssh -o BatchMode=yes "$HOST" 'cd ~/nawaratrend/server && ~/nodejs/bin/node src/config/initDb.js' 2>&1 | grep -v tput || { echo "Database update failed: the app was NOT restarted"; exit 1; }

echo "Restarting…"
ssh -o BatchMode=yes "$HOST" 'export TERM=dumb; chmod -R u+rwX,go+rX ~/nawaratrend && chmod 600 ~/nawaratrend/server/.env && mkdir -p ~/nawaratrend/server/tmp && touch ~/nawaratrend/server/tmp/restart.txt' 2>&1 | grep -v tput || true

code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 60 https://nawaratrend.com/)"
echo "Done: https://nawaratrend.com answered $code"
