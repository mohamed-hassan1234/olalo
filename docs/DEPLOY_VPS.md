# Deploy to a VPS: https://zdu.elivateict.com

One Ubuntu server (22.04 or 24.04) runs everything:

| URL | Served by |
| --- | --- |
| `https://zdu.elivateict.com/` | nginx → static site (`apps/web/out`) |
| `https://zdu.elivateict.com/console/` | nginx → admin app (`apps/admin/dist`) |
| `/v1/*`, `/admin/v1/*` | nginx → Node API on `127.0.0.1:4100` (systemd `lattice-api`) |
| MongoDB | local `mongod`, listening on 127.0.0.1 only, with authentication |

## 0. DNS

At your DNS provider (Namecheap BasicDNS for `elivateict.com`), add an **A record**: `zdu` → your VPS public IP (`104.237.2.66`). Wait until `nslookup zdu.elivateict.com` shows that IP.

The site moved from `zakariye.elivateict.com` to `zdu.elivateict.com` in November 2026; see [DOMAIN_MIGRATION.md](DOMAIN_MIGRATION.md). The old hostname only redirects here.

## 1. Server packages (once)

```bash
sudo apt-get update && sudo apt-get install -y git curl gnupg nginx build-essential ufw
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs
sudo snap install --classic certbot && sudo ln -sf /snap/bin/certbot /usr/bin/certbot
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw --force enable
```

MongoDB 8.0 (official repository):

```bash
curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/8.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list
sudo apt-get update && sudo apt-get install -y mongodb-org
sudo systemctl enable --now mongod
```

Create the database user (the password is generated; keep it for step 3):

```bash
MONGO_PW=$(openssl rand -hex 24); echo "Mongo password: $MONGO_PW"
mongosh --quiet --eval "db.getSiblingDB('admin').createUser({user:'lattice',pwd:'$MONGO_PW',roles:[{role:'readWrite',db:'lattice'}]})"
sudo sed -i 's/^#security:/security:\n  authorization: enabled/' /etc/mongod.conf
grep -q 'authorization: enabled' /etc/mongod.conf || printf 'security:\n  authorization: enabled\n' | sudo tee -a /etc/mongod.conf
sudo systemctl restart mongod
```

## 2. Code (once)

```bash
sudo useradd --system --home /var/www/zakariye --shell /usr/sbin/nologin lattice || true
sudo mkdir -p /var/www && sudo chown $USER:$USER /var/www
git clone https://github.com/mohamed-hassan1234/olalo.git /var/www/zakariye
```

## 3. API secrets (once)

```bash
sudo mkdir -p /etc/lattice
sudo tee /etc/lattice/api.env >/dev/null <<EOF
NODE_ENV=production
PORT=4100
MONGODB_URI=mongodb://lattice:${MONGO_PW}@127.0.0.1:27017/lattice?authSource=admin
MONGODB_DB=lattice
PUBLIC_ORIGINS=https://zdu.elivateict.com
ADMIN_ORIGIN=https://zdu.elivateict.com
TOTP_ENC_KEY=$(openssl rand -base64 32)
COOKIE_SECURE=true
TRUST_PROXY=1
REQUIRE_2FA=true
AGG_INTERVAL_MS=900000
EOF
sudo chmod 600 /etc/lattice/api.env && sudo chown lattice:lattice /etc/lattice/api.env
```

(If you run this in a new shell, set `MONGO_PW` to the password from step 1 first.)

## 4. Services (once)

```bash
cd /var/www/zakariye
sudo cp deploy/lattice-api.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable lattice-api
sudo cp deploy/nginx/lattice-ratelimit.conf /etc/nginx/conf.d/
sudo cp deploy/nginx/zdu.elivateict.com.conf /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/zdu.elivateict.com.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
```

## 5. Build and start

```bash
cd /var/www/zakariye && bash deploy/deploy.sh
```

## 6. HTTPS

```bash
sudo certbot --nginx -d zdu.elivateict.com --redirect -m you@example.org --agree-tos -n
```

Replace `you@example.org` with your email address for certificate expiry notices.

## 7. First admin account (once)

```bash
cd /var/www/zakariye
sudo bash -c 'set -a; . /etc/lattice/api.env; set +a; ADMIN_PASSWORD="choose-a-long-passphrase-here" npm run admin:create -w @lattice/api -- --email you@example.org --role owner'
```

Then open `https://zdu.elivateict.com/console/`, sign in, and turn on two-factor authentication under **Your account** (required for publishing and user management).

## Updating after new pushes

```bash
cd /var/www/zakariye && bash deploy/deploy.sh
```

## Checks and logs

```bash
curl -s https://zdu.elivateict.com/v1/health
sudo systemctl status lattice-api --no-pager
sudo journalctl -u lattice-api -n 100 --no-pager
sudo tail -n 50 /var/log/nginx/error.log
```

## Backups

```bash
cd /var/www/zakariye/apps/api && sudo bash -c 'set -a; . /etc/lattice/api.env; set +a; npm run backup'
```

Copy the `backups/` folder off the server regularly. The site stays a **preview** (ribbon, no search indexing) until the items in [LAUNCH.md](LAUNCH.md) are done.
