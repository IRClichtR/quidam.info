#!/usr/bin/env bash
# Puts the current version of quidam on the server, from your computer.
#
#   deploy/deploy.sh --first-run    the very first time (also installs Caddy and service settings)
#   deploy/deploy.sh                every later update
#   deploy/deploy.sh --rollback     go back to the previous version on the server
#
# Options: --allow-dirty  deploy even with uncommitted changes (not recommended).
#
# Each version goes into its own folder on the server, /opt/quidam/releases/<date>-<commit>.
# /opt/quidam/current points to the one in use. If the new version does not answer its
# health check within 30 s, the script points back to the previous one by itself.
set -euo pipefail

cd "$(dirname "$0")/.."

say() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

FIRST_RUN=0
ALLOW_DIRTY=0
ROLLBACK=0
for arg in "$@"; do
  case "$arg" in
    --first-run) FIRST_RUN=1 ;;
    --allow-dirty) ALLOW_DIRTY=1 ;;
    --rollback) ROLLBACK=1 ;;
    *) fail "unknown option: $arg (see the top of deploy/deploy.sh)" ;;
  esac
done

[ -f deploy/config.sh ] || fail "deploy/config.sh is missing. Run: cp deploy/config.example.sh deploy/config.sh, then fill it in."
# shellcheck source=/dev/null
. deploy/config.sh
: "${DOMAIN:?set DOMAIN in deploy/config.sh}" "${SERVER:?set SERVER in deploy/config.sh}"
SSH_USER="${SSH_USER:-deploy}"
SHIP_VCR_FONT="${SHIP_VCR_FONT:-0}"
[ "$DOMAIN" != "example.org" ] || fail "DOMAIN in deploy/config.sh is still the example. Put your own domain."
TARGET="$SSH_USER@$SERVER"
BASE=/opt/quidam

# Run a script on the server. Values are passed as arguments, so nothing is pasted into the script text.
remote() { ssh -o BatchMode=yes "$TARGET" bash -s -- "$@"; }

say "Checking that the server answers over SSH ($TARGET)"
ssh -o BatchMode=yes -o ConnectTimeout=10 "$TARGET" true \
  || fail "cannot log in as $TARGET. Check SERVER in deploy/config.sh and that your SSH key is the one in cloud-init.yaml."

# On the server: point `current` at a release folder and restart, in one atomic step
# (a new link is made beside the old one, then renamed over it).
SWITCH_AND_RESTART='
switch() {
  ln -sfn "$1" '"$BASE"'/current.new
  mv -T '"$BASE"'/current.new '"$BASE"'/current
  sudo /usr/bin/systemctl restart quidam
}
healthy() {
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 2 http://127.0.0.1:8080/healthz >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  return 1
}'

if [ "$ROLLBACK" = 1 ]; then
  say "Going back to the previous version on the server"
  remote <<EOF
set -euo pipefail
$SWITCH_AND_RESTART
cur=\$(readlink -f $BASE/current)
prev=\$(ls -1d $BASE/releases/*/ | sed 's:/\$::' | sort | awk -v cur="\$cur" '\$0 == cur { print last; exit } { last = \$0 }')
[ -n "\$prev" ] || { echo "No older version to go back to."; exit 1; }
echo "From \$(basename "\$cur") to \$(basename "\$prev")"
switch "\$prev"
healthy && echo "The previous version is running." || { echo "The previous version does not answer either. See: sudo journalctl -u quidam -n 50"; exit 1; }
EOF
  exit 0
fi

if [ "$ALLOW_DIRTY" = 0 ] && [ -n "$(git status --porcelain)" ]; then
  fail "you have uncommitted changes (git status). Commit them first, or add --allow-dirty."
fi

say "Running the unit tests and the type check"
npm test
npm run check

say "Writing the legal pages from legal/owner.json"
node scripts/legal.js

say "Checking that everything is ready for production"
node scripts/preflight.js --production

RELEASE="$(date -u +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)"
say "Copying version $RELEASE to the server"
EXCLUDES=(--exclude=/.git --exclude=/node_modules --exclude=/data --exclude=/tests --exclude=/test-results
  --exclude=/playwright-report --exclude=/docs --exclude=/.superpowers --exclude=/deploy/config.sh
  --exclude=/legal/owner.json --exclude='.env*' --exclude=.DS_Store)
if [ "$SHIP_VCR_FONT" != 1 ]; then EXCLUDES+=(--exclude='/public/fonts/VCR*'); fi
# Folders 2750 and files 640: readable by the quidam group only (the folder's setgid gives them that group).
rsync -rlpt --delete --chmod=D2750,F640 "${EXCLUDES[@]}" ./ "$TARGET:$BASE/releases/$RELEASE/"

say "Installing the production dependencies on the server"
remote "$BASE/releases/$RELEASE" <<'EOF'
set -euo pipefail
cd "$1"
npm ci --omit=dev --no-audit --no-fund --loglevel=error
chmod -R g+rX,o-rwx node_modules
EOF

if [ "$FIRST_RUN" = 1 ] || ! remote <<<'test -f /etc/quidam/quidam.env'; then
  say "Installing the Caddy, service and environment settings for $DOMAIN"
  tmp="$(mktemp -d)"
  sed "s/__DOMAIN__/$DOMAIN/g" deploy/Caddyfile.template > "$tmp/Caddyfile"
  sed "s/__DOMAIN__/$DOMAIN/g" deploy/quidam.env.template > "$tmp/quidam.env"
  cp deploy/quidam.service "$tmp/quidam.service"
  rsync -t "$tmp/Caddyfile" "$tmp/quidam.env" "$tmp/quidam.service" "$TARGET:/home/deploy/staging/"
  rm -rf "$tmp"
  remote <<'EOF'
set -euo pipefail
caddy validate --adapter caddyfile --config /home/deploy/staging/Caddyfile >/dev/null
sudo /usr/bin/install -o root -g root -m 0644 /home/deploy/staging/Caddyfile /etc/caddy/Caddyfile
sudo /usr/bin/install -o root -g quidam -m 0640 /home/deploy/staging/quidam.env /etc/quidam/quidam.env
sudo /usr/bin/install -o root -g root -m 0644 /home/deploy/staging/quidam.service /etc/systemd/system/quidam.service
sudo /usr/bin/systemctl daemon-reload
sudo /usr/bin/systemctl enable quidam
sudo /usr/bin/systemctl reload caddy
echo "Caddy will now ask for HTTPS certificates. That works only once the DNS records point to this server."
EOF
fi

say "Switching to version $RELEASE and restarting"
remote <<EOF
set -euo pipefail
$SWITCH_AND_RESTART
prev=\$(readlink -f $BASE/current 2>/dev/null || true)
switch $BASE/releases/$RELEASE
if healthy; then
  echo "Version $RELEASE answers its health check."
else
  echo "Version $RELEASE does not answer. Its last log lines:"
  sudo /usr/bin/journalctl -u quidam -n 30 --no-pager || true
  if [ -n "\$prev" ] && [ -d "\$prev" ]; then
    echo "Going back to \$(basename "\$prev")."
    switch "\$prev"
    healthy && echo "The previous version is running again." || echo "The previous version does not answer either."
  fi
  exit 1
fi
# Keep the 5 newest versions, and never delete the one in use.
cur=\$(readlink -f $BASE/current)
ls -1d $BASE/releases/*/ | sed 's:/\$::' | sort -r | tail -n +6 | while read -r old; do
  [ "\$old" = "\$cur" ] || rm -rf "\$old"
done
EOF

say "Checking https://$DOMAIN/healthz from the internet"
if curl -fsS --max-time 10 "https://$DOMAIN/healthz"; then
  echo
  say "Done: https://$DOMAIN is live with version $RELEASE."
else
  echo
  echo "The server runs version $RELEASE, but https://$DOMAIN/healthz does not answer from here yet."
  echo "Right after a first run this is normal for a few minutes (DNS and certificates)."
  echo "If it lasts, see the troubleshooting section of docs/Go_live.md."
fi
