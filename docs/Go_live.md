# Go live: putting quidam on the real internet

This guide takes you from "it runs on my laptop" to "anyone can open it at my own address", for a personal, non-commercial project run by a private individual in France. It assumes you have never deployed anything. Follow the steps in order; each one ends with a check, so you always know whether it worked.

Everything that can be automated is automated:

| What | Done by | What you do |
|---|---|---|
| Server setup (users, firewall, Node, Caddy, security updates) | `deploy/cloud-init.yaml` (or `deploy/bootstrap.sh`) | paste one file, once |
| HTTPS certificates, renewals, http→https | Caddy | nothing, ever |
| Legal notice, privacy notice (en/fr/es), `security.txt`, record of processing | `npm run legal` | fill in your details once, in `legal/owner.json` |
| "Is everything ready?" checks | `npm run preflight` | read what it says |
| Upload, restart, health check, automatic rollback | `npm run deploy` | one command per update |
| Security updates of the server, reboots | unattended-upgrades | nothing |
| IP data refresh (DB-IP, Tor, Private Relay) | the server itself | nothing |

Prices and facts below were checked on **25 October 2026**. Hosting prices move; re-check before you pay.

Time needed: about half a day, most of it waiting for a domain or a DNS change.
Money needed: about **€8 a month** for the server and about **€72 a year** for the `.io` domain.

---

## Contents

0. [Two decisions before you spend anything](#0-two-decisions-before-you-spend-anything)
1. [Accounts to open](#1-accounts-to-open)
2. [Buy the domain](#2-buy-the-domain)
3. [Make your SSH key](#3-make-your-ssh-key)
4. [Create the server](#4-create-the-server)
5. [Your legal details (the only personal input)](#5-your-legal-details-the-only-personal-input)
6. [Point the domain at the server (DNS)](#6-point-the-domain-at-the-server-dns)
7. [First deployment](#7-first-deployment)
8. [Check that it really works](#8-check-that-it-really-works)
9. [Monitoring: be told when it breaks](#9-monitoring-be-told-when-it-breaks)
10. [Launch checklist](#10-launch-checklist)
11. [Living with it: updates, spikes, money](#11-living-with-it-updates-spikes-money)
12. [Legal compliance, summed up](#12-legal-compliance-summed-up)
13. [When something goes wrong](#13-when-something-goes-wrong)
14. [Words used in this guide](#14-words-used-in-this-guide)

---

## How it fits together

```
 visitor's browser
   │  https://yourdomain  (and v4.yourdomain, v6.yourdomain)          UDP 3478 (STUN)
   ▼                                                                     │
┌──────────────────────── one small server (Ubuntu 24.04) ───────────────┼──────┐
│  firewall: only 22, 80, 443 and 3478/udp come in                       │      │
│                                                                        ▼      │
│  Caddy (port 80/443) ── HTTPS, certificates ──► Node (127.0.0.1:8080) + STUN  │
│                         no access log           quidam, keeps nothing      │
└───────────────────────────────────────────────────────────────────────────────┘
```

- **Caddy** faces the internet. It handles HTTPS by itself and passes each request to Node.
- **Node** runs quidam. It listens only inside the machine, except for STUN, which must be reachable directly (it is plain UDP and cannot go through Caddy).
- **No third party** sits between visitors and your server (no Cloudflare, no CDN): the site's promise is that only quidam's own server is asked, and that stays true.
- **Three names** point at the server: `yourdomain` (the site), `v4.yourdomain` (IPv4 only) and `v6.yourdomain` (IPv6 only). The last two let the page learn both of a visitor's addresses.

---

## 0. Two decisions before you spend anything

### 0.1 The name: quidam

The site is called **quidam** (French for "an anonymous person"). It was "leakcheck", which is already a commercial breach-search service (LeakCheck at leakcheck.io), then briefly "ombre", dropped because a French mark **OMBRE** (INPI FR 5193192, registered February 2026) covers software and SaaS in class 42. A common word can't be owned on its own, but a company can own it **for a kind of product**, so the check that matters is classes **9** (software), **38** (telecommunications, VPNs), **42** (online services, IT security) and **45** (security services), in [TMview](https://www.tmdn.org/tmview) and [INPI data](https://data.inpi.fr), plus a web search for "quidam VPN", "quidam privacy" and the like.

What the search found on 25 October 2026 (a research summary, not legal advice):

- **QUIDAM**, INPI [FR 4521441](https://data.inpi.fr/marques/FR4521441), Synexser France (an IT consultancy), classes 9 (data-processing hardware only), 18, 35, 36 and **42** (software development, SaaS, cloud). The closest mark. No product under the name was found; registered in May 2019, it is past the five-year mark and can be challenged for non-use if it is still unused.
- **quidam**, INPI [FR 4578161](https://data.inpi.fr/marques/FR4578161), a private individual, class **45** (online social networking only). No product found; also past five years.
- **QUIDAM**, INPI [FR 4534323](https://data.inpi.fr/marques/FR4534323), Laboratoire Therascience, class 9 limited to health and nutrition publications. Weak overlap.
- Cirque du Soleil's "Quidam": its EU mark (000668418) **expired in 2017**; nothing in force for France.
- No VPN, privacy or security product called Quidam is active (only an abandoned 2000s macOS Tor menu-bar app).

Risk: **low to medium**. It stays low as long as the site is **free and non-commercial** (trademark infringement needs use "in the course of trade"). Don't file your own QUIDAM mark in class 42 without advice: it would likely be opposed. Adding ads, paid features or donations raises the risk; read this again first.

Domain: `quidam.fr`, `quidam.eu` and `quidam.app` are taken; **`quidam.io` was free** on 25 October 2026 (step 2).

The name appears in the page text, the legal pages and the server's names (service, user, folders). To list every place, for example if you ever rename again:

The name appears in the page text, the legal pages and the server's names (service, user, folders). To list every place, for example if you ever rename again:

```sh
grep -rn "quidam" public/ scripts/legal.js deploy/ README.md | grep -v "^public/fonts"
```

### 0.2 The licence: GPL-2.0-only

Decided on 25 October 2026: the **GNU GPL version 2** (`LICENSE`), and `package.json` says `"license": "GPL-2.0-only"`. Anyone may reuse the code but must publish their changes under the same licence. `npm run preflight` warns if the two files ever disagree again.

---

## 1. Accounts to open

Open these with an email address you check. **Turn on two-factor authentication (2FA)** on each: whoever gets into these accounts controls your site.

| Account | Why | Cost |
|---|---|---|
| **Hetzner Cloud** ([accounts.hetzner.com](https://accounts.hetzner.com/signUp)) | the server | about €7.19/month incl. VAT |
| **OVHcloud** ([ovhcloud.com](https://www.ovhcloud.com/fr/domains/)) | the domain name | about €71.75/year incl. VAT for a `.io` (€59.79 excl. VAT); check the first-year price in the basket |
| **UptimeRobot** ([uptimerobot.com](https://uptimerobot.com)) | tells you when the site is down (step 9) | free |
| **GitHub** (you already have one) | public source code (optional) | free |

**Hetzner may ask you to prove who you are**: a copy of an ID document, or a first payment with a card in your name. Plan for a delay of a few hours to a day.

**Known problem today: Hetzner's cheap plans are often "currently unavailable".** Since June 2026 Hetzner has limited new cheap servers (shortage of hardware). If you can't order one, see **Plan B** in step 4.3. Nothing else in this guide changes.

### A contact email address for the site

The legal pages publish an email address. Don't use your personal one: it will get spam. Create a separate address used only for the site (a free mailbox, or a forwarding alias). You must actually read it: the law requires that people can reach you.

---

## 2. Buy the domain

1. The name is **`quidam.io`** (step 0.1). Two things to know about `.io`:
   - it costs about **9 times a `.fr`** (about €72 a year);
   - it is the country ending of the British Indian Ocean Territory. The UK–Mauritius treaty on the Chagos Islands leaves its long-term future somewhat uncertain. It is widely expected to keep working, but if it ever winds down you would need a new domain (steps 2, 5, 6 and 7 again).
2. On OVHcloud, search `quidam.io`, add it to the basket, and refuse the extras (hosting, email, "DNS anycast": you need none of them).
3. Owner details: your real name and address. Unlike `.fr`, the `.io` registry doesn't hide a private owner by itself: in the OVHcloud panel (Domains › your domain › General information), check that **owner data masking** ("Masquage des données du propriétaire", OVHcloud's free privacy option) is **on**, so your name and address don't appear in the public WHOIS. Leave the **technical contact** as OVHcloud.
4. Pay. Turn on **automatic renewal** in the OVHcloud control panel (Domains › your domain › Renewal), so the name never lapses.
5. In the same panel, turn on **DNSSEC** (a signature that stops anyone faking your DNS answers): Domains › your domain › DNSSEC › enable. It's one click when OVHcloud also runs your DNS, which it does by default.

**Check:** the domain appears in your OVHcloud panel as "active" (it can take up to an hour), and `whois quidam.io` shows neither your name nor your address.

---

## 3. Make your SSH key

SSH is how your computer talks to the server. A **key** replaces a password: a private half stays on your computer, a public half goes on the server. The server setup turns password logins off entirely, so this key is your only way in.

On your computer (Linux), in a terminal:

```sh
ls ~/.ssh/id_ed25519.pub          # already have a key? then skip the next line
ssh-keygen -t ed25519 -C "quidam"
```

When asked, press Enter for the default file, then **type a passphrase** (a sentence you'll remember). It protects the key if your laptop is stolen.

Show the public half (you'll paste it in step 4):

```sh
cat ~/.ssh/id_ed25519.pub
```

It is one line starting with `ssh-ed25519 AAAA…`. **Never share the file without `.pub`**: that is the private half.

Back up the private key (`~/.ssh/id_ed25519`) in your password manager or on an encrypted USB stick. If you lose it, you lose access to the server. If that happens anyway, you can rebuild the server from scratch in 20 minutes (step 13).

---

## 4. Create the server

### 4.1 Prepare the setup file

Open `deploy/cloud-init.yaml` in an editor. Find this line:

```yaml
      - ssh-ed25519 AAAA... REPLACE_WITH_YOUR_PUBLIC_KEY
```

Don't edit the file in the project (the deploy script refuses to run with uncommitted changes). Work on a copy:

```sh
cp deploy/cloud-init.yaml ~/quidam-cloud-init.yaml
```

In the copy, replace everything after `- ` with your public key from step 3, keeping the spaces and the dash in front. Save.

This file sets up everything on the server's first boot: it creates the `deploy` account (you) and the `quidam` account (runs the site, can't log in), turns off root and password logins, installs Node.js 24 and Caddy, turns on automatic security updates (with a reboot at 04:30 UTC when one needs it), opens only ports 22, 80, 443 and 3478/udp, and keeps the system journal small.

### 4.2 Plan A: Hetzner Cloud

In the [Hetzner Cloud console](https://console.hetzner.cloud): **New project** (call it quidam), then **Add server**:

| Setting | Choose | Why |
|---|---|---|
| Location | **Nuremberg**, **Falkenstein** (Germany) or **Helsinki** (Finland) | in the EU: no data transfer outside the EU. If a plan is unavailable in one, try another. |
| Image | **Ubuntu 24.04** | what the setup file is written for |
| Type | **Shared vCPU › Cost-Optimized**: **CX23** (x86, 2 vCPU, 4 GB, €5.99/month excl. VAT) or **CAX11** (Arm, same size, €6.49) | either works; quidam has no native code |
| Networking | **Public IPv4** ✓ and **Public IPv6** ✓ | both are needed (IPv4 costs €0.50/month, included in the price above) |
| SSH keys | **Add SSH key** › paste your public key | lets you rescue the server from the console if needed |
| Firewalls | skip (the server's own firewall is set up by the setup file) | see note below |
| Backups | off | there is nothing to back up: the server keeps no data (step 11.5) |
| Cloud config | paste the **whole** `~/quidam-cloud-init.yaml` (your copy, with your key) | does the setup |
| Name | `quidam-1` | any name |

Click **Create & Buy now**. Note the **IPv4 address** (like `203.0.113.10`) and the **IPv6 address** (Hetzner shows a block like `2a01:4f8:c012:abcd::/64`; the server's own address is that block with `1` at the end: `2a01:4f8:c012:abcd::1`).

Optional, extra safety: Hetzner's own **Firewall** (free, Firewalls › Create firewall) with inbound rules TCP 22, TCP 80, TCP 443, UDP 443, UDP 3478, ICMP, applied to the server. It duplicates the server's own firewall at the network edge.

**Wait 5 minutes**, then check (replace the address):

```sh
ssh deploy@203.0.113.10 'cloud-init status --wait; node --version; caddy version'
```

The first time, SSH asks whether you trust the server's fingerprint: type `yes`. You should see `status: done`, `v24.…` and a Caddy version. If `status: error`, see step 13.

Then **sign the data processing agreement** (GDPR article 28, required because Hetzner processes visitor IP addresses for you): [accounts.hetzner.com/account/dpa](https://accounts.hetzner.com/account/dpa), tick the box. Done once.

### 4.3 Plan B: if Hetzner has nothing available

Any EU host with a small **Ubuntu 24.04** server, a public IPv4 and IPv6, and open UDP works. Examples checked on 25 October 2026 (re-check prices, traffic terms and whether IPv6 is included):

- **Scaleway** (Paris), DEV1-S: about €6.55/month excl. VAT plus IPv4. Its creation form has a **cloud-init** field: paste your copy `~/quidam-cloud-init.yaml` there as in plan A.
- **OVHcloud** VPS-1: from about €4.57/month incl. VAT, unlimited traffic. If there is no cloud-init field, use the bootstrap script below.

Without a cloud-init field, create the server with Ubuntu 24.04 and your SSH key, then run this once from your computer (the host tells you whether to log in as `root` or `ubuntu`):

```sh
# logged in as root:
ssh root@SERVER_IP 'bash -s' -- "$(cat ~/.ssh/id_ed25519.pub)" < deploy/bootstrap.sh
# or, with an "ubuntu" user:
ssh ubuntu@SERVER_IP 'sudo bash -s' -- "$(cat ~/.ssh/id_ed25519.pub)" < deploy/bootstrap.sh
```

It does exactly what `cloud-init.yaml` does. Then check with `ssh deploy@SERVER_IP 'node --version; caddy version'`.

With another host, also: sign its data processing agreement (every serious EU host offers one), and in `legal/owner.json` (step 5) replace the `host` block with its details. The example file already holds OVHcloud's (`_host_if_you_pick_ovhcloud_instead`).

---

## 5. Your legal details (the only personal input)

This is the one place where you type information about yourself. It stays on your computer: `legal/owner.json` is git-ignored and never goes to GitHub.

```sh
cp legal/owner.example.json legal/owner.json
```

Open `legal/owner.json` and fill in the `you` and `site` parts:

| Field | What to put |
|---|---|
| `you.fullName` | your first name and surname |
| `you.email` | the site's contact address (step 1) |
| `you.publishHomeAddress` | **`false`** (recommended) or `true`, see below |
| `you.homeAddress`, `you.phone` | only if `publishHomeAddress` is `true` |
| `site.domain` | your domain, bare: `mysite.fr` (no `https://`, no slash) |
| `site.sourceCode` | the public repository URL, or `""` if it stays private |
| `site.lastUpdated` | leave `""` (today's date is used) |
| `host` | already filled in for Hetzner; replace if you chose another host |

Then generate the pages:

```sh
npm run legal
```

It writes `public/en|fr|es/legal/index.html` (linked from every page's footer), `public/.well-known/security.txt` and, for you only, `legal/out/registre-des-traitements.md`. Start the site locally (`npm start`) and read `http://localhost:8080/fr/legal/` once: it's your legal text.

### What the choice `publishHomeAddress` means

French law (**LCEN, loi n° 2004-575, article 1-1**, since the SREN law of May 2024) requires every website to publish who runs it, under penalty of up to one year in prison and a €75,000 fine (article 1-2).

- **`false`: the private-individual option (article 1-1 II).** A person publishing **on a non-professional basis** may publish only the host's name, address and phone, **provided they gave their own identity to the host**. You did, when you opened the Hetzner account. Your home address and phone stay private.
- **`true`**: name, home address and phone are published (article 1-1 I).

In both cases your **name and email are published** on the privacy notice. The GDPR (article 13) requires the identity and contact of whoever is responsible for processing visitors' data, and the anonymity option of French law doesn't remove that. Publishing a name and a contact email, but not your address, is the usual middle ground for an individual.

The `false` option holds only while the site stays **non-professional**: no ads, no sales, no paid services. See "Donations" in step 12.

### The other legal documents, automated

- **Record of processing** (GDPR article 30): `legal/out/registre-des-traitements.md`, written from your details. It isn't published. Keep it (in a backup), and show it if the CNIL ever asks. The exemption for small organisations doesn't apply because IP addresses are processed on every visit, not "occasionally".
- **Data processing agreement with the host**: signed online in step 4.2.
- **`security.txt`**: tells security researchers where to report a problem. It expires after a year: running `npm run legal` again renews it, and `npm run preflight` reminds you 30 days before.

---

## 6. Point the domain at the server (DNS)

DNS records tell the world which server answers for which name. In OVHcloud: **Web Cloud › Domain names › your domain › DNS zone**. First **delete** any existing `A`, `AAAA` and `CNAME` records for `@`, `www`, `v4`, `v6` (OVHcloud adds some pointing at a parking page). Then **Add an entry** for each line:

| Type | Sub-domain | Target | Why |
|---|---|---|---|
| A | *(empty)* | your IPv4, e.g. `203.0.113.10` | the site, over IPv4 |
| AAAA | *(empty)* | your IPv6, e.g. `2a01:4f8:c012:abcd::1` | the site, over IPv6 |
| A | `www` | your IPv4 | redirects to the bare domain |
| AAAA | `www` | your IPv6 | same |
| A | `v4` | your IPv4 | **IPv4 only: no AAAA for `v4`** |
| AAAA | `v6` | your IPv6 | **IPv6 only: no A for `v6`** |
| CAA | *(empty)* | `0 issue "letsencrypt.org"` | only these two certificate authorities may issue certificates for you… |
| CAA | *(empty)* | `0 issue "sectigo.com"` | …Let's Encrypt, and ZeroSSL (Sectigo), Caddy's fallback |

Keep the default TTL (time a record is cached). Changes take from a few minutes to an hour to spread.

**Check**, from your computer:

```sh
dig +short A yourdomain       # your IPv4
dig +short AAAA yourdomain    # your IPv6
dig +short A v4.yourdomain    # your IPv4
dig +short AAAA v4.yourdomain # NOTHING (empty line)
dig +short AAAA v6.yourdomain # your IPv6
dig +short A v6.yourdomain    # NOTHING
```

(`dig` is in the `dnsutils` package: `sudo apt install dnsutils`.) The empty answers matter: if `v4` had an IPv6 address, the IPv6 check would quietly stop working.

---

## 7. First deployment

On your computer, in the project folder:

```sh
cp deploy/config.example.sh deploy/config.sh
```

Edit `deploy/config.sh` (git-ignored):

```sh
DOMAIN="yourdomain"          # same as site.domain in legal/owner.json
SERVER="203.0.113.10"        # the server's IPv4
SSH_USER="deploy"
SHIP_VCR_FONT=0              # see step 10, fonts
```

Make sure the fonts are there, then check that everything is ready:

```sh
npm run fonts
npm run preflight -- --production
```

It lists every problem with the fix (missing legal file, placeholders left, domains that disagree, missing fonts…). Fix until it prints `ready for production`. The licence warning (step 0.2) is a warning, not a blocker.

Commit your work (`git add -A && git commit -m "…"`): the deploy script refuses uncommitted changes, so what runs online is always a known version. Then:

```sh
npm run deploy -- --first-run
```

The script tells you what it does, step by step:

1. checks it can log in to the server;
2. runs the unit tests and the type check (stops if they fail);
3. regenerates the legal pages and runs the preflight;
4. uploads the project into a new folder on the server, `/opt/quidam/releases/<date>-<commit>` (without tests, docs, your `owner.json`, or the unlicensed font);
5. installs the dependencies there (`npm ci --omit=dev`);
6. on `--first-run`: installs the Caddy configuration and the service settings for your domain;
7. switches `/opt/quidam/current` to the new folder and restarts quidam;
8. waits for the server's own health check (`/healthz`). If the new version doesn't answer within 30 seconds, it **switches back to the previous version by itself** and shows the error lines.

On the very first start, the server downloads its IP data (DB-IP, about 130 MB, plus the Tor and Private Relay lists). It takes a minute or two; until then the connection check says "lookup unavailable". Caddy also needs a minute to get the certificates. The script tells you if `https://yourdomain/healthz` doesn't answer yet: wait two minutes and open it in your browser. You should see `{"ok":true,"data":true}`.

---

## 8. Check that it really works

Go through this list once after the first deployment, and again after any change to the server or DNS.

**HTTPS and security headers**

```sh
curl -sI https://yourdomain/en/ | grep -iE "^(HTTP|strict-transport|content-security|referrer)"
```

Expect `HTTP/2 200`, a `strict-transport-security` line, a `content-security-policy` line and `referrer-policy: no-referrer`. Also `curl -sI http://yourdomain/` answers with a redirect to `https://`, and `curl -sI https://www.yourdomain/` with a redirect to the bare domain.

**The two single-family names**

```sh
curl -4 -s https://v4.yourdomain/healthz   # {"ok":true,…}
curl -6 -s https://v6.yourdomain/healthz   # same, if your internet connection has IPv6
```

No IPv6 at home? Use your phone on mobile data (most French mobile networks have IPv6): open `https://v6.yourdomain/healthz`.

**The site itself**, in a normal browser window:

- [ ] `https://yourdomain/` sends you to your language; the three language links work.
- [ ] RUN THE SCAN fills the browser section and the summary tiles.
- [ ] SHOW WHAT SITES SEE shows **your real provider and town**, not "this machine or your local network" (that would mean the real visitor address isn't reaching Node: see step 13).
- [ ] Turn a VPN on, check again: the provider changes. Answer "no, that's my VPN" and press TEST MY VPN: three rows appear. Row 2 should read OK or LEAK, not CAN'T TELL. CAN'T TELL there means the STUN port (UDP 3478) is blocked.
- [ ] The footer link opens your legal page, with your name and the host.
- [ ] `https://yourdomain/.well-known/security.txt` shows your contact.
- [ ] On your phone: the page is readable, nothing is cut off.

**Nothing is logged** (your privacy promise):

```sh
ssh deploy@SERVER 'sudo journalctl -u quidam -n 20; sudo journalctl -u caddy -n 50 | grep -cE "([0-9]{1,3}\.){3}[0-9]{1,3}"'
```

The quidam journal holds only startup lines. Caddy's count of IP-looking strings should be `0` or only refer to certificate servers. Caddy writes no access log (there is no `log` line in its configuration, on purpose). Never add one.

---

## 9. Monitoring: be told when it breaks

In **UptimeRobot** (free): Add New Monitor:

- type **Keyword**, URL `https://yourdomain/healthz`, keyword `"data":true`, alert when the keyword is **not** present;
- interval **5 minutes**;
- alert contact: your email (and the phone app, if you like).

You'll get an email if the site is down, or up but without IP data. UptimeRobot only calls `/healthz` from its own servers: no script is added to the site, and no visitor data reaches it.

Optional: a second monitor of type **Port**, `v6.yourdomain`, port 443, to watch the IPv6 name. No free service checks STUN over UDP; the TEST MY VPN check in step 8 covers it when you look.

---

## 10. Launch checklist

Before you tell anyone about the site:

- [ ] **Name** checked in the trademark registers, domain chosen (step 0.1). **Licence** chosen, both files agree (step 0.2).
- [ ] **Translations**: a native French and a native Spanish speaker have read every page, including the new v2 strings (problem cards, "is this you?", "your VPN, checked") and the legal page. The v2 additions are listed in `docs/Review-before-launch-v1.md` under "v2".
- [ ] **Menu names in the fix steps** checked in real browsers (`docs/Review-before-launch-v1.md`, section B), and the browser and VPN facts on the cards (`docs/leakcheck-design-v2.md`, section 10).
- [ ] **Fonts**: VCR OSD Mono ships with no licence. `SHIP_VCR_FONT=0` (the default) leaves it out and the site falls back to VT323, which is free. Switch to `1` only with the author's written permission.
- [ ] **Router probe over HTTPS**: from the HTTPS page, run PROBE MY NETWORK in Chrome, Firefox and Safari at home and note what each shows (`docs/Review-before-launch-v1.md`, section D).
- [ ] Step 8 all ticked; step 9 monitor green.
- [ ] Repository made public (if you want), with `site.sourceCode` set in `legal/owner.json`, then `npm run legal` and `npm run deploy`.

---

## 11. Living with it: updates, spikes, money

### 11.1 Updating the site

```sh
git commit -am "what changed"
npm run deploy
```

Each update goes into its own folder; the last five are kept. To go back to the previous one at once:

```sh
npm run deploy -- --rollback
```

### 11.2 What the server takes care of by itself

- **Security updates**: installed every day; a reboot at 04:30 UTC when the kernel needs one (a few seconds offline).
- **Certificates**: Caddy renews them about 30 days before they expire. Let's Encrypt stopped sending expiry emails in 2025, so the monitor in step 9 is how you'd notice a problem.
- **IP data**: DB-IP weekly, the Tor list hourly, Private Relay daily. A failed download keeps the last good copy.
- **Crashes**: systemd restarts quidam within 2 seconds.

### 11.3 How much traffic it takes

Measured on a laptop core (AMD Ryzen 7 PRO 5850U), on the v2 site, without HTTPS:

| | measured |
|---|---|
| first visit, all files, compressed | **257 KB** |
| repeat visit (files unchanged: "304 Not Modified") | **14 KB** |
| full visits per second, one CPU core | **~300 to 500**, 0 errors, p95 latency 10 to 57 ms |
| IP lookups per second (`/api/whoami`) | ~11,000 |
| server memory | ~330 MB (the IP database lives in memory), capped at 900 MB |

A cloud vCPU is slower than a laptop core, and HTTPS adds work (done by Caddy on the second vCPU). A safe working figure for a CX23 is **about 100 full visits per second**: 360,000 an hour. For scale: the front page of Hacker News typically brings 10 to 30 visits per second at its peak. You can measure your own server once it's online, from your computer (expect some `429` answers: one address is limited to 30 lookups a minute, by design):

```sh
npm run loadtest -- https://yourdomain --seconds 20 --concurrency 50
```

Run it at a quiet hour: it is real traffic.

### 11.4 Money: why a spike can't ruin you

- The server has a **fixed monthly price**. It doesn't grow with visitors: when overloaded, the site slows down; it never costs more.
- **20 TB of outgoing traffic a month are included** (Hetzner, EU). At 257 KB per first visit, that's about **78 million first visits a month** before any extra cost. Beyond, Hetzner charges **€1 per extra TB**: even 10 million extra visits would cost about €3.
- **Hetzner's network-level DDoS protection** is free and always on (floods of packets). Floods of real web requests are slowed by quidam's own limits: 30 lookups a minute per address, 60 STUN answers a minute per address, at most 100,000 addresses tracked at once, 20,000 open connections.
- No paid extra (CDN, load balancer, managed database) is used, so nothing can quietly start billing.

Your total, in a normal year: 12 × €7.19 + €71.75 for the domain ≈ **€158**.

If the site becomes very popular, in this order:

1. **Look first**: `ssh deploy@SERVER 'uptime; free -m'`. A load average above 2 for a long time means the CPU is the limit.
2. **Rescale** in the Hetzner console: power the server off, Rescale › choose a bigger plan (e.g. CX33, 4 vCPU), **untick "upgrade disk"** so you can come back down, power on. About 2 minutes offline; the bigger plan is billed by the hour only while you keep it.
3. **Lighten the page**: the fonts are 70% of a first visit. Keeping only the Latin characters of IBM Plex Mono ("subsetting") would cut a first visit by about half.
4. Only then think about more servers.

### 11.5 Backups

There's nothing on the server to back up: it keeps no visitor data, and everything else comes from the repository. What you must keep safe:

- the git repository (pushed to GitHub, or another copy);
- `legal/owner.json` and `deploy/config.sh` (password manager or encrypted USB stick);
- your SSH private key and its passphrase.

With those, a lost server is rebuilt in 20 minutes: steps 4, 6 (new addresses), 7.

### 11.6 Yearly tasks (put them in your calendar)

- [ ] `npm run legal && npm run deploy`: renews `security.txt` and the "last updated" date.
- [ ] Check that the domain renewed and the card on file at OVHcloud and Hetzner is still valid.
- [ ] Re-read the legal page: is it still true? (Did you add a feature that keeps data, or donations?)
- [ ] Ubuntu 24.04 gets security updates until 2029; plan the move to the next LTS before then (rebuild a server with step 4, deploy, switch DNS).
- [ ] Node 24 is supported until April 2028: update the major version in `deploy/cloud-init.yaml` before then.

---

## 12. Legal compliance, summed up

For a **private individual** running a **free, non-commercial** site in France. This is a careful reading of the rules, not legal advice; if the site changes (ads, sales, accounts, a company), read this again.

| Rule | Applies? | How it's met |
|---|---|---|
| **LCEN art. 1-1**: say who publishes the site | yes | legal page, generated by `npm run legal`; option II keeps your address private (step 5) |
| **GDPR**: visitor IP addresses are personal data | yes (a public site isn't "household" use: CJEU *Lindqvist*, C-101/01) | minimum data, kept one minute in memory, no logs |
| GDPR art. 13: privacy notice | yes | legal page, three languages |
| GDPR art. 28: contract with the host | yes | Hetzner's online agreement (step 4.2) |
| GDPR art. 30: record of processing | yes (processing isn't occasional) | `legal/out/registre-des-traitements.md`, kept privately |
| GDPR art. 37: data protection officer | no | no large-scale monitoring, no sensitive data |
| GDPR: transfers outside the EU | none | server in the EU, no third-party service on the pages |
| **Cookie banner** (ePrivacy, Informatique et Libertés art. 82) | no | no cookies, no storage, no analytics. The device readings run only when the visitor presses the button, for the result they ask for ("strictly necessary for a service expressly requested"), and nothing is stored or sent. The privacy notice says so. |
| Declaring anything to the CNIL | no | declarations ended in 2018 |
| **DSA** (EU Digital Services Act) | no | it covers services that store what users post; this site stores nothing users send |
| **Accessibility** (European Accessibility Act, RGAA) | no legal duty for a private non-commercial site | the site already follows strict accessibility rules (contrast 7:1, keyboard, screen readers) |
| Naming brands in the fixes | allowed | naming a product to describe it is permitted (EU trademark regulation art. 14(1)(c); French CPI L713-6); several options, alphabetical, no affiliate links |
| **DB-IP** data licence (CC BY 4.0) | yes | footer link "IP data by DB-IP" plus licence on the legal page |
| Font licences | yes | IBM Plex Mono and VT323 under OFL, licence files shipped; VCR OSD Mono not shipped (step 10) |
| Consumer law, VAT, invoices | no | nothing is sold |
| **Trademark** of the site's name | check once | step 0.1 (classes 9, 38, 42, 45) |

**Donations.** Adding a donation button doesn't break any of this by itself, but regular income can make the activity look professional, which ends the anonymity option (step 5) and may be taxable (gifts or non-commercial income). Ask the tax office (*service des impôts des particuliers*) before adding one, then update `legal/owner.json` and the record of processing if a payment provider gets involved.

**If someone asks about their data**, answer from the site's contact address within a month: explain that nothing is kept beyond one minute in memory, so there's nothing to give or erase. If someone asks you to remove content (unlikely here), you have to act on clear unlawful content once told about it.

---

## 13. When something goes wrong

| Symptom | Likely cause | What to do |
|---|---|---|
| `ssh: connect … Connection refused` or timeout | server still installing, or wrong address | wait 5 minutes; check the IPv4 in the console |
| `Permission denied (publickey)` | key in `cloud-init.yaml` doesn't match your computer's | compare with `cat ~/.ssh/id_ed25519.pub`. To fix: rebuild the server with the right key (step 4), or use the Hetzner console's **Rescue** tab |
| `cloud-init status: error` | a download failed during setup | `ssh deploy@SERVER 'sudo cat /var/log/cloud-init-output.log | tail -50'`. If you can't log in at all: delete the server and create it again |
| deploy stops at "tests" or "preflight" | the message says what | fix and run again; nothing reached the server |
| deploy says the new version didn't answer, rolled back | the app crashed on start | read the lines it printed; `ssh deploy@SERVER 'sudo journalctl -u quidam -n 50'` |
| browser shows a certificate error | DNS not ready when Caddy asked, or CAA records wrong | check step 6 with `dig`; then `ssh deploy@SERVER 'sudo systemctl reload caddy'`; read `sudo journalctl -u caddy -n 50` |
| connection check says "lookup unavailable" | IP data not downloaded yet, or downloads blocked | wait 2 minutes after a first start; `/healthz` shows `"data":false` until then |
| connection check shows "this machine or your local network" online | Node sees Caddy's address instead of the visitor's | `TRUST_PROXY=127.0.0.1,::1` must be in `/etc/quidam/quidam.env`; run `npm run deploy -- --first-run` again |
| "your VPN, checked" row 2 always CAN'T TELL | UDP 3478 blocked | Hetzner Firewall (if you made one) must allow UDP 3478; `ssh deploy@SERVER 'sudo ufw status'` must list `3478/udp` |
| `quidam's server is busy` for many visitors at once | many people behind one address (school, company, mobile network) reached 30 lookups a minute | raise `limit: 30` in `server/main.js` (for example to 120), commit, deploy |
| site slow under heavy traffic | CPU full | step 11.4 |

To look at the server live:

```sh
ssh deploy@SERVER
sudo systemctl status quidam caddy     # running?
sudo journalctl -u quidam -f           # quidam's messages, live (Ctrl+C to stop)
curl -s http://127.0.0.1:8080/healthz     # the app itself, without Caddy
```

---

## 14. Words used in this guide

- **Domain**: the name people type (`mysite.fr`). Rented by the year from a **registrar** (OVHcloud).
- **DNS**: the internet's directory, turning names into addresses. **A** records point to IPv4 addresses, **AAAA** to IPv6 addresses.
- **IPv4 / IPv6**: the older (`203.0.113.10`) and newer (`2a01:…`) forms of internet addresses. Many connections have both.
- **VPS / cloud server**: a small virtual computer you rent by the month in a data centre.
- **SSH**: a secure way to type commands on the server from your computer.
- **Caddy**: the program in front of quidam that handles HTTPS. **HTTPS / TLS**: encryption between the visitor and the server; the padlock in the browser.
- **Certificate**: proof, signed by an authority such as Let's Encrypt, that the server really is `mysite.fr`. Free and automatic here.
- **HSTS**: a header that tells browsers to use HTTPS for this site from now on, without trying plain HTTP first.
- **STUN**: a tiny UDP service that tells a browser which public address it comes from. quidam runs its own, to spot VPN leaks.
- **Firewall**: the filter that lets only chosen ports in. **Port**: a numbered door on the server (443 for HTTPS).
- **cloud-init**: the standard way to set up a new cloud server on its first boot, from a text file.
- **systemd**: the part of Linux that starts quidam at boot and restarts it if it stops.
- **Health check** (`/healthz`): a small page saying "I'm alive, and my data is loaded", used by the deploy script and the monitor.
- **Rollback**: going back to the previous version.
- **Processor / data processing agreement (DPA)**: in the GDPR, a company that handles personal data on your behalf (your host), and the contract that binds it.
