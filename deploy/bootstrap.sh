#!/usr/bin/env bash
# Sets up a fresh Ubuntu 24.04 server for quidam, for hosts that have no "cloud config" box
# (on Hetzner, paste deploy/cloud-init.yaml at creation instead: it does exactly the same).
# Keep the two files in step: any change to one belongs in the other.
#
# Run it ONCE, from your computer, right after the host gives you the new server:
#
#   ssh root@SERVER_IP 'bash -s' -- "$(cat ~/.ssh/id_ed25519.pub)" < deploy/bootstrap.sh
#
# If the host gave you a user such as `ubuntu` instead of root:
#
#   ssh ubuntu@SERVER_IP 'sudo bash -s' -- "$(cat ~/.ssh/id_ed25519.pub)" < deploy/bootstrap.sh
#
# At the end, root and password logins are switched off: from then on you log in as `deploy`,
# with your SSH key only. The script checks the key first, so you cannot lock yourself out with a typo.
set -euo pipefail

KEY="${1:-}"
[ "$(id -u)" -eq 0 ] || { echo "Run this as root (see the top of the file)."; exit 1; }
[[ "$KEY" =~ ^ssh-(ed25519|rsa)\ [A-Za-z0-9+/=]{60,} ]] || { echo "Pass your PUBLIC key (the line in ~/.ssh/id_ed25519.pub) as the first argument."; exit 1; }
. /etc/os-release
[ "${ID:-}" = ubuntu ] || echo "Warning: written for Ubuntu 24.04; this is ${PRETTY_NAME:-unknown}. Continuing."

say() { printf '\n==> %s\n' "$*"; }

say "Updating the system and installing the basics"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y upgrade
apt-get install -y ca-certificates curl gnupg debian-keyring debian-archive-keyring apt-transport-https rsync ufw unattended-upgrades

say "Creating the accounts: deploy (you, by SSH key) and quidam (runs the site, cannot log in)"
id quidam >/dev/null 2>&1 || useradd --system --shell /usr/sbin/nologin --no-create-home --home-dir /nonexistent quidam
id deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash deploy
# deploy must be in the quidam group, so the releases it uploads can be given that group (the service reads them as quidam).
usermod -aG quidam deploy
passwd -l deploy >/dev/null
install -d -o deploy -g deploy -m 0700 /home/deploy/.ssh
printf '%s\n' "$KEY" > /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 0600 /home/deploy/.ssh/authorized_keys

say "SSH: keys only, no root"
cat > /etc/ssh/sshd_config.d/10-quidam.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
AllowUsers deploy
EOF

say "Automatic security updates, with a reboot at 04:30 UTC when one needs it"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
cat > /etc/apt/apt.conf.d/52quidam-upgrades <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF
timedatectl set-timezone Etc/UTC

say "A small system journal, kept 7 days"
install -d /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/10-quidam.conf <<'EOF'
[Journal]
SystemMaxUse=200M
MaxRetentionSec=7day
EOF

say "The admin commands deploy.sh may run without a password"
cat > /etc/sudoers.d/10-quidam-deploy <<'EOF'
Cmnd_Alias LEAKCHECK_DEPLOY = \
  /usr/bin/systemctl restart quidam, \
  /usr/bin/systemctl status quidam, \
  /usr/bin/systemctl status caddy, \
  /usr/bin/systemctl reload caddy, \
  /usr/bin/systemctl daemon-reload, \
  /usr/bin/systemctl enable quidam, \
  /usr/bin/journalctl -u quidam *, \
  /usr/bin/journalctl -u caddy *, \
  /usr/bin/install -o root -g root -m 0644 /home/deploy/staging/Caddyfile /etc/caddy/Caddyfile, \
  /usr/bin/install -o root -g quidam -m 0640 /home/deploy/staging/quidam.env /etc/quidam/quidam.env, \
  /usr/bin/install -o root -g root -m 0644 /home/deploy/staging/quidam.service /etc/systemd/system/quidam.service
deploy ALL=(root) NOPASSWD: LEAKCHECK_DEPLOY
EOF
chmod 0440 /etc/sudoers.d/10-quidam-deploy
visudo -cf /etc/sudoers.d/10-quidam-deploy

say "Node.js 24 and Caddy, from their official package repositories"
install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt -o /etc/apt/sources.list.d/caddy-stable.list
chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get install -y nodejs caddy

say "Folders for the site"
install -d -o deploy -g quidam -m 2750 /opt/quidam /opt/quidam/releases
install -d -o root -g quidam -m 0750 /etc/quidam
install -d -o quidam -g quidam -m 0750 /var/lib/quidam
install -d -o deploy -g deploy -m 0700 /home/deploy/staging

say "Firewall: only SSH, web and STUN come in"
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw allow 3478/udp
ufw --force enable

systemctl restart systemd-journald
systemctl enable --now unattended-upgrades
systemctl enable --now caddy
# Last, because it ends root and password logins.
systemctl restart ssh

say "Done. Test from your computer:  ssh deploy@<this server's address>"
echo "Then run deploy/deploy.sh --first-run from your computer."
