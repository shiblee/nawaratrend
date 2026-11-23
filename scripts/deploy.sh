#!/usr/bin/env bash
# Builds the store and puts it live on nawaratrend.com over SSH, restarts the app, and waits until the new version
# is answering before removing the old files (so visitors never get a page whose scripts are gone).
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
SITE="${DEPLOY_SITE:-https://nawaratrend.com}"

"$ROOT/scripts/build-deploy.sh"

echo "Installing server libraries…"
(cd "$PKG/server" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund >/dev/null)

# Which version this is; /api/health reports it, so we can tell when the new one is really running
BUILD_ID="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo local)-$(date +%Y%m%d%H%M%S)"
echo "$BUILD_ID" > "$PKG/server/BUILD_ID"

remote() { ssh -o BatchMode=yes "$HOST" "export TERM=dumb; $1" 2> >(grep -v tput >&2); }

# 1. Upload the new files next to the old ones. Nothing is deleted yet: the old version keeps running (it holds the
#    old page in memory) and still needs its own scripts and styles. New assets go first, then everything else.
echo "Uploading to ${HOST}…"
rsync -rlt -e "ssh -o BatchMode=yes" "$PKG/client/dist/assets/" "$HOST:nawaratrend/client/dist/assets/"
rsync -rlt --exclude tmp/ -e "ssh -o BatchMode=yes" "$PKG/" "$HOST:nawaratrend/"

# 2. New tables and columns (safe to run every time: it only adds what's missing)
echo "Updating the database…"
remote 'cd ~/nawaratrend/server && ~/nodejs/bin/node src/config/initDb.js' || { echo "Database update failed: the app was NOT restarted, the old version is still running"; exit 1; }

# 3. Restart, then wait until the new version answers several times in a row (Passenger takes a while to notice)
echo "Restarting…"
remote 'chmod -R u+rwX,go+rX ~/nawaratrend && chmod 600 ~/nawaratrend/server/.env && mkdir -p ~/nawaratrend/server/tmp && touch ~/nawaratrend/server/tmp/restart.txt' || { echo "Restart failed: the old version is still running"; exit 1; }
ok=0
for _ in $(seq 1 60); do
  if curl -s --max-time 20 "$SITE/api/health" | grep -q "\"$BUILD_ID\""; then ok=$((ok + 1)); else ok=0; fi
  [ "$ok" -ge 3 ] && break
  sleep 2
done
if [ "$ok" -lt 3 ]; then
  echo "The new version ($BUILD_ID) isn't answering yet. Old files were kept, so nothing is broken by the clean-up."
  echo "Check $SITE, then run this script again."
  exit 1
fi

# 4. Clean up what the new version doesn't have. Old scripts and styles stay for a day, for people with the shop already open.
echo "Cleaning up…"
rsync -rlt --delete --exclude tmp/ --exclude client/dist/assets/ -e "ssh -o BatchMode=yes" "$PKG/" "$HOST:nawaratrend/"
remote 'find ~/nawaratrend/client/dist/assets -type f -mmin +1440 -delete'

# 5. The page and every script and style it needs must load
page="$(curl -s --max-time 60 "$SITE/" || true)"
bad=0
assets="$(grep -oE '/assets/[^"]+\.(js|css)' <<<"$page" | sort -u || true)"
[ -n "$assets" ] || { echo "The home page didn't load properly: check $SITE"; exit 1; }
for a in $assets; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 60 "$SITE$a" || true)"
  [ "$code" = 200 ] || { echo "  $a answered $code"; bad=1; }
done
[ "$bad" = 0 ] || { echo "Some files are missing: run this script again"; exit 1; }
echo "Done: $SITE is running $BUILD_ID"
