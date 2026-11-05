# VPS setup (Ubuntu 24.04)

```bash
# 1. Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

# 2. Code
git clone <your-repo-url> ai-outbound && cd ai-outbound
cp .env.example .env
# edit .env: DOMAIN, BASE_PATH (e.g. /outbound, or empty), AUTH_SECRET (openssl rand -base64 32), APP_ENCRYPTION_KEY (openssl rand -hex 32),
#            POSTGRES_PASSWORD, RESEND_API_KEY, EMAIL_FROM, APP_URL=https://$DOMAIN$BASE_PATH, SEED_SUPER_ADMIN_*

# 3. First boot
docker compose up -d db redis
docker compose build web worker
docker compose run --rm worker pnpm db:migrate
docker compose run --rm worker pnpm db:seed      # creates the super admin + demo client
docker compose up -d

# 4. Later deploys
./deploy/deploy.sh
```

Point the domain's A record at the VPS before step 3; Caddy obtains the TLS certificate automatically.

Backups: `docker compose exec db pg_dump -U outbound outbound | gzip > backup-$(date +%F).sql.gz` on a daily cron.
