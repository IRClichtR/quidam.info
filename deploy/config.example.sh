# Copy this file to deploy/config.sh and fill it in. config.sh is git-ignored: it stays on your computer.
#   cp deploy/config.example.sh deploy/config.sh

# Your domain, without https:// and without www (for example: quidam.example).
DOMAIN="example.org"

# Other domains you own that should send visitors to DOMAIN (and their www), separated by
# spaces, for example: EXTRA_DOMAINS="quidam.online quidam.tech". Leave "" if you have none.
# Each needs A and AAAA records pointing at the server (docs/Go_live.md, step 6).
# After changing it, run: npm run deploy -- --first-run
EXTRA_DOMAINS=""

# The server's public IPv4 address (shown in the Hetzner console), or a name that points to it.
SERVER="203.0.113.10"

# The login user created by deploy/cloud-init.yaml. Keep it as is.
SSH_USER="deploy"

# 1 only once you have written permission to redistribute the VCR OSD Mono font
# (see docs/Review-before-launch-v1.md, section F). 0 = the site uses VT323 instead.
SHIP_VCR_FONT=0
