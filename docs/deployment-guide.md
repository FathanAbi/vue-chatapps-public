# Deployment Guide — VPS Architecture & Go-Live Checklist

> Recommendations are based on the application as it exists at commit `fdefa70`, **after** the Stage A items in [`remediation-plan.md`](./remediation-plan.md) are complete.
> **Do not apply any of these changes without explicit authorization.** Nothing here has been applied to any system.
>
> **Note (updated 2026-10-30).** Most repository-side changes listed in section 3 (Dockerfiles,
> `.dockerignore`, compose file, nginx vhosts) are **already present in the repository** at HEAD.
> They are reproduced here as reference and to document the intended production shape; the VPS
> steps (section 4 onward) are still unapplied.

---

## 1. Scope of this guide

| Change type | Where it applies |
|---|---|
| **Repository change** | Files inside `vue-chatapps-public/` — access functions, config, Dockerfiles, nginx vhost, compose file |
| **VPS change** | nginx configuration, TLS certificate, firewall rules, Docker network, service manager, backups, monitoring |
| **External prerequisite** | A domain name with DNS pointing at the VPS; a TLS certificate (Let's Encrypt or equivalent); an SMTP account; off-host backup storage |

---

## 2. Target architecture

A minimal, secure topology for a personal portfolio project: **one public IP, one TLS terminator, one application server, one private database.**

Two supported shapes are shown. **Shape A (repository default)** terminates TLS in the SPA
container's nginx and proxies `/api/` to the backend on one origin. **Shape B** uses a host nginx
as the TLS terminator and hosts the SPA and API on separate subdomains.

```
Shape A (single origin, repository default):
                    Internet
                       |
                   :443 (TLS)
                       |
              +--------+--------+      vue-frontend/default.conf
              | nginx (SPA ctr) |      TLS termination, security headers,
              |  :80 -> :443    |      rate limiting, SPA + /api proxy
              +--------+--------+
                       |
              :3000 (internal, docker bridge)
                       |
              +--------+--------+
              | Payload CMS     |      Next.js 16.4.3 + Payload 3.92.1
              | container       |
              +--------+--------+
                       |
              private docker network / 127.0.0.1:27017
                       |
              +--------+--------+
              |   MongoDB 7     |      auth enabled, no published port
              +-----------------+

Shape B (separate API subdomain):
                    Internet
                       |
                   :443 (TLS)
                       |
              +--------+--------+
              |  nginx (host)   |      TLS termination, security headers,
              |  :80 -> :443    |      rate limiting, reverse proxy
              +--------+--------+
                       |
         +-------------+-------------+
         |                           |
     app.example.com             api.example.com  ->  :3000 (docker bridge)
         |                           |
   +-----+-----+             +-------+-------+
   | Vue SPA   |             | Payload CMS  |   Next.js 16.4.3 + Payload 3.92.1
   | (static)  |             | container    |
   +-----------+             +-------+-------+
                                     |
                          private docker network / 127.0.0.1:27017
                                     |
                             +-------+-------+
                             |   MongoDB 7   |   auth enabled, no published port
                             +---------------+
```

**Design decisions and their reasons:**

| Decision | Reason |
|---|---|
| **The Vue SPA is served as static files, not as a running container** | Vite produces a static `dist/`. A container that only runs `nginx` to serve four files adds a process, a port and an image to maintain for no benefit. Serve it from the host's nginx with `root /var/www/chat/dist`. |
| **MongoDB is not published to the host** | SEC-012: the current compose file publishes `27017:27017` with no authentication — an unauthenticated internet-facing database. Bind it to `127.0.0.1` or to a private Docker network and never to `0.0.0.0`. |
| **Payload listens only on the internal Docker bridge** | The backend should be reachable only through nginx, which enforces TLS, adds headers and rate-limits. A direct backend port would bypass all of that. |
| **The API is on a separate subdomain** (`api.example.com`) | It makes the CORS allow-list exact rather than a wildcard, lets the cookie `Domain` be scoped, and lets nginx apply stricter limits to `/api` than to static assets. Same-origin hosting also works and is simpler — but then CORS is moot and you cannot set a strict `connect-src`. |
| **No WebSocket / SSE tier** | The app polls over HTTP; there is no long-lived connection to load-balance or idle-timeout. |
| **Two containers, one host** | Appropriate for a portfolio project. A VPS with 2 vCPU / 2 GB RAM is sufficient for the expected load (a handful of concurrent users polling every 3–4 s, backing off to 30 s). |

### Sizing

| Concurrent users | Approx. request rate | Minimum VPS |
|---|---|---|
| 1–5 | ~2 req/s | 1 vCPU / 1 GB |
| 5–20 | ~7 req/s | 2 vCPU / 2 GB |
| 20–50 | ~17 req/s | 2 vCPU / 4 GB |

The dominant cost is client polling, not message volume. B7 (exponential backoff + a visibility
pause, now implemented) reduces it substantially — a backgrounded tab issues no requests, and an
idle view backs off from 3–4 s to 30 s.

---

## 3. Repository changes

> As noted at the top, the repository-side changes in this section (3.1–3.5) are **already present
> at HEAD**; they are reproduced as reference. The remaining VPS work is in section 4.

These are the file changes the deployment depends on. They overlap with Stage A of the remediation plan.

### 3.1 `payload-be/Dockerfile`

> **Implemented in the repository.** The current `payload-be/Dockerfile` is:

```dockerfile
FROM node:22-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

# --- deps: install exactly what the lockfile pins ---------------------------
FROM base AS deps
COPY package*.json ./
RUN npm ci

# --- build: compile the Admin Panel and the server --------------------------
FROM base AS build
ENV NODE_ENV=development
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- prod-deps: production dependencies only --------------------------------
FROM base AS prod-deps
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# --- runtime ----------------------------------------------------------------
FROM base AS runtime
RUN addgroup -S app && adduser -S app -G app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public 2>/dev/null || true
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.mjs ./next.config.mjs
USER app
EXPOSE 3000
CMD ["npm", "run", "start"]
```

Notes:
- `npm ci` honours the committed lockfile (SEC-012: `pnpm install` did not).
- The `prod-deps` stage excludes dev dependencies, which drops the production image size and the Playwright/Vitest attack surface.
- `EXPOSE 3000` — the real port (SEC-012: the old file said 50010).
- The container runs as the unprivileged `app` user.
- The upload directory is provided by the `payload-media` volume (see §3.3), owned by the app user.

### 3.2 `payload-be/.dockerignore`

> **Implemented in the repository.** The current file is:

```
.git
.gitignore
.env
.env.*
!.env.example
node_modules
.next
dist
build
media
tmp
test.env
*.log
coverage
.vscode
.idea
```

`vue-frontend/.dockerignore` follows the same pattern (minus `.next`/`media`/`tmp`).

### 3.3 `payload-be/docker-compose.yml` (development; production variant below)

> **The current repository compose file is a development configuration** — it mounts the source
> tree and runs `npm ci && npm run dev` inside a `node:22-alpine` container (with MongoDB on the
> private `expose`d port and authentication enabled). For production, replace it with the
> build-based variant shown after it.

Current repository file (development):

```yaml
services:
  payload:
    image: node:22-alpine
    ports:
      - '3000:3000'
    volumes:
      - .:/home/node/app
      - node_modules:/home/node/app/node_modules
    working_dir: /home/node/app/
    command: sh -c "npm ci && npm run dev"
    depends_on:
      mongo:
        condition: service_healthy
    env_file:
      - .env
    user: 'node'
    healthcheck:
      test: ['CMD-SHELL', 'wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1 || exit 1']
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 60s
    logging:
      driver: json-file
      options: { max-size: '10m', max-file: '3' }

  mongo:
    image: mongo:7
    expose:
      - '27017'
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_ROOT_USERNAME:-chatadmin}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_ROOT_PASSWORD:-change-me}
    command: ['--storageEngine=wiredTiger', '--bind_ip_all']
    volumes:
      - data:/data/db
    healthcheck:
      test: ['CMD-SHELL', 'mongosh --quiet --eval "db.adminCommand(''ping'')" >/dev/null 2>&1 || exit 1']
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 30s
    logging:
      driver: json-file
      options: { max-size: '10m', max-file: '3' }

volumes:
  data:
  node_modules:
```

Recommended production variant (build the image rather than run `npm run dev`):

```yaml
services:
  mongo:
    image: mongo:7
    restart: unless-stopped
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_ROOT_USERNAME}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_ROOT_PASSWORD}
    volumes:
      - mongo-data:/data/db
    networks: [internal]
    # NOT published. Reachable only via the internal network.
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping')"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 30s

  payload:
    build:
      context: .
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PAYLOAD_SECRET: ${PAYLOAD_SECRET}
      DATABASE_URI: ${DATABASE_URI}
      SERVER_URL: ${SERVER_URL}
      FRONTEND_ORIGINS: ${FRONTEND_ORIGINS}
    depends_on:
      mongo:
        condition: service_healthy
    volumes:
      - payload-media:/app/media
    networks: [internal]
    # NOT published. Only the SPA's nginx reaches it (`http://payload:3000`).

networks:
  internal:
    driver: bridge

volumes:
  mongo-data:
  payload-media:
```

**Key properties (already true of the repository file):** nothing is published to the host for
either service (`expose` only), MongoDB authentication is enabled, `mongo:7` is pinned instead of
`mongo:latest`, both images are `node:22`, and both services have healthchecks and bounded
`json-file` logging.

### 3.4 `vue-frontend` build

The SPA builds to static assets; no container is needed in production.

```bash
cd vue-frontend
echo "VITE_API_URL=https://api.example.com" > .env.production
npm ci
npm run build
sudo rsync -a --delete dist/ /var/www/chat/
```

Note that `VITE_API_URL` is **inlined into the bundle at build time** — it is public configuration, not a secret. Rebuild whenever it changes.

### 3.5 nginx — TLS terminator and reverse proxy

> **Two shapes are supported.** The repository ships a **single-origin** vhost
> (`vue-frontend/default.conf`) that terminates TLS, serves the SPA and proxies `/api/` to the
> Payload container (`http://payload:3000`) — this is the DNS-simplest option. The
> **separate-API-subdomain** vhost below is the stricter option (exact CORS allow-list, a strict
> `connect-src`). Pick one; only the second is reproduced here for reference. Whichever you choose,
> the isolated **media origin** (`payload-be/nginx/media-origin.conf`, SEC-004) is recommended
> alongside it.

Reference `/etc/nginx/sites-available/chat` (separate-API-subdomain shape):

```nginx
# ---- Rate limiting zones (SEC-009) ----
limit_req_zone $binary_remote_addr zone=api_general:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=api_login:10m   rate=5r/m;
limit_req_zone $binary_remote_addr zone=api_register:10m rate=3r/h;
limit_req_zone $binary_remote_addr zone=api_upload:10m  rate=10r/h;
limit_conn_zone $binary_remote_addr zone=conn_per_ip:10m;

# ---- HTTP -> HTTPS ----
server {
    listen 80;
    listen [::]:80;
    server_name app.example.com api.example.com;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://$host$request_uri; }
}

# ---- Frontend ----
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name app.example.com;

    ssl_certificate     /etc/letsencrypt/live/app.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.example.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_stapling on;
    ssl_stapling_verify on;

    # Security headers (SEC-014)
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=(), interest-cohort=()" always;
    add_header Content-Security-Policy "default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://api.example.com; script-src 'self'; style-src 'self' 'unsafe-inline'; upgrade-insecure-requests" always;

    server_tokens off;
    client_max_body_size 2m;   # SEC-009: bound request bodies

    root /var/www/chat;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    gzip_min_length 512;

    # Hashed assets are immutable
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}

# ---- API ----
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name api.example.com;

    ssl_certificate     /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_session_cache   shared:SSL:10m;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    server_tokens off;
    client_max_body_size 2m;

    limit_conn conn_per_ip 20;

    # Proxy to the Payload container on the docker bridge
    location / {
        limit_req zone=api_general burst=20 nodelay;

        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
        proxy_connect_timeout 10s;
    }

    # Stricter limits on the auth endpoints
    location = /api/penggunas/login {
        limit_req zone=api_login burst=5 nodelay;
        proxy_pass http://127.0.0.1:3000;
        include /etc/nginx/snippets/proxy_headers.conf;
    }

    location = /api/penggunas {
        limit_req zone=api_register burst=3 nodelay;
        proxy_pass http://127.0.0.1:3000;
        include /etc/nginx/snippets/proxy_headers.conf;
    }

    location = /api/media {
        limit_req zone=api_upload burst=5 nodelay;
        client_max_body_size 6m;   # 5 MB file + 1 MB multipart headroom, matching payload.config.ts requestSizeLimit (SEC-004)
        proxy_pass http://127.0.0.1:3000;
        include /etc/nginx/snippets/proxy_headers.conf;
    }

    # Redirect direct file serving to the isolated media origin (SEC-004)
    # location /api/media/file/ {
    #     return 302 https://media.example.com$request_uri;
    # }

    # The admin panel is optional hardening: restrict by source IP if you have a stable one.
    # (The repository's single-origin `default.conf` instead returns 404 for /admin.)
    # location /admin { allow 203.0.113.10; deny all; proxy_pass http://127.0.0.1:3000; ... }
}

# ---- Isolated Media Origin (SEC-004) ----
# The full configuration is committed at payload-be/nginx/media-origin.conf
# (server_name media.example.com; only /media/file/ proxied to the backend;
#  sandbox CSP, nosniff, Cross-Origin-Resource-Policy; its own rate-limit zones).
```

**Notes.**
- `proxy_set_header X-Forwarded-For` is set by nginx itself — the application must not trust a client-supplied `X-Forwarded-For`. If the application ever reads the client IP, it must read the value nginx sets, not a header the client can forge.
- `client_max_body_size 2m` bounds ordinary request bodies at the edge (SEC-009); the `/api/media` location raises it to `6m` to admit the 5 MB upload limit plus multipart boundaries.
- The `CSP` `connect-src` lists `https://api.example.com` — this must match `VITE_API_URL` exactly, or the SPA's fetches will be blocked.
- `style-src 'unsafe-inline'` is required because Vue SFCs inject scoped styles at runtime. Removing it needs a nonce strategy (Stage C, C10).
- `limit_req` with `nodelay` queues rather than delaying, and returns 429 above the limit.
- The repository's `vue-frontend/default.conf` additionally declares an `api_directory` zone (20 r/m) for `GET /api/penggunas/directory` and returns `404` for `/admin` (SEC-013, A9).

### 3.6 Backend environment file

`/opt/chat/payload/.env` on the VPS — **mode 600, owned by root, never in the repository**:

```
NODE_ENV=production
PAYLOAD_SECRET=<64+ random characters>
DATABASE_URI=mongodb://MONGO_ROOT_USERNAME:MONGO_ROOT_PASSWORD@mongo:27017/chat?authSource=admin
SERVER_URL=https://api.example.com
FRONTEND_ORIGINS=https://app.example.com
# Optional:
# APP_URL=https://app.example.com
# COOKIE_SECURE=true
MONGO_ROOT_USERNAME=<generated>
MONGO_ROOT_PASSWORD=<generated>
# Password-reset mail (B1); when SMTP_HOST is empty the mail is logged instead.
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=no-reply@example.com
SMTP_FROM_NAME=Aplikasi Chat
```

> The compose file reads `MONGO_ROOT_USERNAME` / `MONGO_ROOT_PASSWORD`. `PORT` is not required —
> the app defaults to 3000 and the container exposes 3000. Every variable above is documented in
> `payload-be/.env.example`.

Generate the secret:
```bash
openssl rand -base64 48 | tr -d '\n'
```

**If `PAYLOAD_SECRET` has ever been used in a public or shared environment, rotate it.** Rotating invalidates all sessions (users log in again) — which is the desired effect — but it also invalidates any data encrypted with the old secret.

### 3.7 Systemd (if not using Docker Compose's restart policy)

`/etc/systemd/system/chat-payload.service`:

```ini
[Unit]
Description=Payload CMS backend
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=/opt/chat/payload
EnvironmentFile=/opt/chat/payload/.env
ExecStart=/usr/bin/docker compose up -d payload
ExecStop=/usr/bin/docker compose down
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

---

## 4. Deployment sequence

Run these **in order**. Each step has an observable success criterion.

```bash
# 1. System preparation
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx certbot python3-certbot-nginx rsync ufw docker.io docker-compose-plugin
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```
**Criterion:** `ufw status` shows only 22, 80 and 443 allowed.

```bash
# 2. DNS
#    app.example.com  A  <vps-ip>
#    api.example.com  A  <vps-ip>
dig +short app.example.com
```
**Criterion:** both resolve to the VPS IP.

```bash
# 3. Application checkout and build
sudo mkdir -p /opt/chat/payload && sudo chown "$USER" /opt/chat/payload
git clone <repo-url> /opt/chat/payload/src
cd /opt/chat/payload/src/payload-be
npm ci
npm run build
```
**Criterion:** `npm run build` exits 0.

```bash
# 4. Environment
sudo tee /opt/chat/payload/.env > /dev/null <<'EOF'
NODE_ENV=production
PAYLOAD_SECRET=<<<generated>>>
DATABASE_URI=mongodb://<<<user>>>:<<<pass>>>@mongo:27017/chat?authSource=admin
SERVER_URL=https://api.example.com
FRONTEND_ORIGINS=https://app.example.com
MONGO_ROOT_USERNAME=<<<generated>>>
MONGO_ROOT_PASSWORD=<<<generated>>>
EOF
sudo chmod 600 /opt/chat/payload/.env
```
**Criterion:** `ls -l` shows `-rw-------` and owner `root`.

```bash
# 5. Start the containers
cd /opt/chat/payload
docker compose up -d
docker compose ps
curl -s http://127.0.0.1:3000/api/health
```
**Criterion:** both containers report `healthy`; `/api/health` returns 200.

```bash
# 6. Frontend build and deploy
cd /opt/chat/payload/src/vue-frontend
echo "VITE_API_URL=https://api.example.com" > .env.production
npm ci && npm run build
sudo mkdir -p /var/www/chat
sudo rsync -a --delete dist/ /var/www/chat/
```
**Criterion:** `/var/www/chat/index.html` exists and references `/assets/`.

```bash
# 7. nginx + TLS
sudo cp chat-nginx.conf /etc/nginx/sites-available/chat
sudo ln -sf /etc/nginx/sites-available/chat /etc/nginx/sites-enabled/chat
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d app.example.com -d api.example.com
sudo certbot renew --dry-run
```
**Criterion:** `nginx -t` passes; `certbot renew --dry-run` succeeds.

```bash
# 8. First admin account
#    Provision through a controlled path so /api/penggunas/first-register
#    and /api/users/first-register are closed.
cd /opt/chat/payload/src/payload-be
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='<a-strong-password>' npx tsx scripts/create-first-admin.ts
```
**Criterion:** the script reports success; `POST /api/users/first-register` returns 403.

```bash
# 9. Backup job
sudo cp /opt/chat/backup.sh /usr/local/bin/chat-backup
sudo chmod +x /usr/local/bin/chat-backup
( crontab -l 2>/dev/null; echo "30 3 * * * /usr/local/bin/chat-backup >> /var/log/chat-backup.log 2>&1" ) | crontab -
/usr/local/bin/chat-backup
```
**Criterion:** the backup command produces a non-empty archive at the expected path.

```bash
# 10. Restore rehearsal (do this before launch, not after)
docker run --rm -v chat-restore:/data mongo:7 mongodump --archive=/data/restore.archive
docker run --rm -v chat-restore:/data mongo:7 mongorestore --archive=/data/restore.archive --nsInclude='chat.*' --drop
docker exec -it <mongo-container> mongosh chat --quiet --eval 'db.messages.countDocuments()'
```
**Criterion:** the restored counts match the source counts.

---

## 5. VPS verification checklist

Every item must be verified **on the actual host**. Nothing in this list can be confirmed from the repository.

| # | Check | Command / method | Expected |
|---|---|---|---|
| V1 | Only 22/80/443 are open | `sudo nmap -p- <vps-ip>` from an external host | All other ports `closed` |
| V2 | MongoDB is not reachable externally | `nmap -p 27017 <vps-ip>` from an external host | `closed` |
| V3 | MongoDB requires authentication | `mongosh "mongodb://mongo:27017/chat"` without credentials | `Authentication failed` |
| V4 | TLS certificate is valid and covers both hosts | `echo \| openssl s_client -connect api.example.com:443 -servername api.example.com` and `certbot certificates` | Valid, not expired, covers both names |
| V5 | HTTP redirects to HTTPS | `curl -sI http://app.example.com` | `301`/`308` with a `https://` location |
| V6 | Security headers are present | `curl -sI https://app.example.com` | HSTS, CSP with `frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` |
| V7 | The session cookie is `Secure` | `curl -sI -X POST https://api.example.com/api/penggunas/login -d '{"email":"...","password":"..."}'` | `Set-Cookie` contains `Secure`, `HttpOnly`, `SameSite=Lax` |
| V8 | CORS rejects a foreign origin | `curl -si -X OPTIONS https://api.example.com/api/penggunas -H "Origin: https://evil.example"` | No `Access-Control-Allow-Origin` |
| V9 | CORS accepts the real origin | `curl -si -X OPTIONS https://api.example.com/api/penggunas -H "Origin: https://app.example.com"` | Origin echoed, `Access-Control-Allow-Credentials: true` |
| V10 | CSRF rejects a foreign origin on a mutation | `curl -si -X POST https://api.example.com/api/penggunas/login -H "Origin: https://evil.example" -d '{}'` | `403` |
| V11 | Anonymous access is refused | `curl -si https://api.example.com/api/messages` | `401`/`403` |
| V12 | Rate limiting is active | 50 concurrent `curl` requests to `/api/messages` | Some `429` responses |
| V13 | Request bodies are bounded | `curl -si -X POST https://api.example.com/api/messages -d @<(head -c 5M /dev/zero)` | `413` |
| V14 | The `.env` is not web-readable | `curl -si https://app.example.com/.env` and `https://api.example.com/.env` | `404` |
| V15 | The `.env` is not in any image layer | `docker history --no-trunc <image> \| grep -i "PAYLOAD_SECRET"` | No match |
| V16 | The admin panel is not publicly served | `curl -si https://app.example.com/admin` | `404` at the SPA edge (the repository vhost returns 404 for `/admin`, A9). Reaching the panel requires a route that is deliberately not exposed, or an IP allow-list |
| V17 | First-register is closed | `curl -si -X POST https://api.example.com/api/penggunas/first-register -d '{}'` | `403` |
| V18 | Containers run as non-root | `docker exec <container> id` | Not `uid=0` |
| V19 | The upload directory is not world-writable | `ls -ld /var/lib/docker/volumes/.../media` | Owned by the app user, `755` or tighter |
| V20 | No source or backup files are exposed | `curl -si https://app.example.com/.git/config`, `.../backup.tar.gz` | `404` |
| V21 | Security updates are applied | `apt list --upgradable` and `docker images` | No critical updates pending |
| V22 | The OS is not running a development server | `ss -tlnp` | Only nginx on 80/443, nothing else public |
| V23 | The backup ran and the restore works | See step 10 above | Counts match |
| V24 | Logs are rotating | `docker inspect <container> --format '{{.HostConfig.LogConfig}}'` | `max-size` set |

---

## 6. Go-live checklist

Every item needs an **observable** completion criterion.

### 6.1 Dependencies

| # | Item | Completion criterion |
|---|---|---|
| D1 | `payload` upgraded to 3.92.1 | `npm ls payload` shows `3.92.1` |
| D2 | `next` upgraded to >= 15.5.28 (resolved: 16.4.3) | `npm ls next` shows the target version |
| D3 | `mongoose` >= 8.24.1 | `npm ls mongoose` shows the target version |
| D4 | `sharp` >= 0.35.5 | `npm ls sharp` shows the target version |
| D5 | `qs` >= 6.16.1 (frontend) | `npm ls qs` shows the target version |
| D6 | OSV scan clean | The query for each of the five packages returns zero records |
| D7 | Lockfiles committed and honoured by the build | `npm ci` succeeds from a clean checkout; `docker history` shows no `pnpm install` |

### 6.2 Security fixes and regression tests

| # | Item | Completion criterion |
|---|---|---|
| S1 | Access control rewritten | No `() => true` remains in `payload-be/src/collections/` |
| S2 | Sender derived from the session | T-IMP-01..04 pass |
| S3 | Password writes rejected | T-AUTHZ-03 passes; Bob's password still works |
| S4 | Authz regression suite green | Every test in remediation-plan section 6 passes |
| S5 | Upload hardening | T-UPL-01..06 pass |
| S6 | Admin surface restricted | T-AUTHZ-15 and V17 pass |

### 6.3 Secrets and credentials

| # | Item | Completion criterion |
|---|---|---|
| C1 | `PAYLOAD_SECRET` is 64+ random characters | `/opt/chat/payload/.env` holds it; the length is verified |
| C2 | Secret rotated if it was ever exposed | Users are logged out after the change; old sessions are rejected |
| C3 | MongoDB credentials generated and unique | `MONGO_ROOT_PASSWORD` is not a default value |
| C4 | `.env` permissions | `ls -l` shows `-rw-------`, owner `root` |
| C5 | `.env` absent from Git and from images | `git log -p --all \| grep PAYLOAD_SECRET` shows only the placeholder; V15 passes |
| C6 | The admin account uses a unique password | The admin cannot log in with a common password |
| C7 | The admin account is not shared | Only one named administrator exists; access is individually attributable |

### 6.4 Production build and configuration

| # | Item | Completion criterion |
|---|---|---|
| P1 | Backend built in production mode | `npm run build` exits 0 with `NODE_ENV=production` |
| P2 | Frontend built with the correct API URL | The bundle contains `https://api.example.com` and no `localhost` |
| P3 | `SERVER_URL` set | `config.serverURL` resolves to `https://api.example.com` |
| P4 | `FRONTEND_ORIGINS` set | It contains exactly the deployed frontend origin |
| P5 | The hardcoded IP is gone | `grep -r "103.103.21.102" .` returns nothing |
| P6 | `cookies.secure = true` | V7 passes |
| P7 | `debug` is off | Production error responses are generic |

### 6.5 Database and storage

| # | Item | Completion criterion |
|---|---|---|
| B1 | MongoDB is not published | V1 and V2 pass |
| B2 | MongoDB requires authentication | V3 passes |
| B3 | The database is on a persistent volume | `docker volume ls` shows the volume; data survives `docker compose down && up` |
| B4 | The upload directory is persistent and correctly owned | V19 passes; files survive a restart |
| B5 | The database is not reachable from the public internet | V2 passes from an external host |

### 6.6 HTTPS and reverse proxy

| # | Item | Completion criterion |
|---|---|---|
| H1 | A valid certificate covers both hosts | V4 passes; `certbot certificates` shows no expiry warning |
| H2 | Auto-renewal is configured and tested | `certbot renew --dry-run` succeeds; a systemd timer is active |
| H3 | HTTP redirects to HTTPS | V5 passes |
| H4 | Security headers are present | V6 passes |
| H5 | `server_tokens off` | `Server` header absent or shows only `nginx` |
| H6 | The backend port is not public | V22 shows nothing but nginx on 80/443 |

### 6.7 Firewall, ports and services

| # | Item | Completion criterion |
|---|---|---|
| F1 | Default-deny inbound | `ufw status` shows `default deny incoming` |
| F2 | Only 22/80/443 allowed | V1 passes |
| F3 | SSH is key-only | `PasswordAuthentication no` in `sshd_config`; a password login is rejected |
| F4 | The development server is not running | `ss -tlnp` shows no `:5173` |
| F5 | No debug endpoints are exposed | `/_next/*` internals and `/my-route` are removed or unreachable |

### 6.8 Health, logging and monitoring

| # | Item | Completion criterion |
|---|---|---|
| O1 | Health endpoint exists and checks the DB | `curl -s https://api.example.com/api/health` returns 200 with a DB result |
| O2 | Container health checks are configured | `docker ps` shows both containers `healthy` |
| O3 | Logs are rotated | V24 passes |
| O4 | Logs are shipped off-host | The log destination is confirmed outside the VPS |
| O5 | There is a disk-space alert | A test alert fires |

### 6.9 Backups and recovery

| # | Item | Completion criterion |
|---|---|---|
| R1 | A scheduled backup runs | The crontab entry exists; a run appears in the log |
| R2 | The backup is off-host | The archive is in remote storage, not only on the VPS |
| R3 | The backup is encrypted | The archive cannot be read without the key |
| R4 | Retention is set | Backups older than 7–14 days are removed |
| R5 | **A restore has been rehearsed** | The restore into a scratch DB succeeded and the counts matched |
| R6 | The rollback procedure is documented | A written procedure exists and someone has followed it |

### 6.10 Rollback

| # | Item | Completion criterion |
|---|---|---|
| K1 | Previous images are tagged and retained | `docker images` shows at least one prior version per service |
| K2 | A rollback command is documented | A written procedure names the exact commands |
| K3 | A schema-change rollback is considered | If any collection shape changed, the rollback path is written down |
| K4 | A rollback has been rehearsed | The previous image was redeployed and the app verified, at least once |

### 6.11 Final retest

| # | Item | Completion criterion |
|---|---|---|
| T1 | The full authz suite passes against the deployed environment | Every test in remediation-plan section 6 passes against the real host (not just the local container) |
| T2 | The dependency scan is clean | OSV returns zero records for all five packages |
| T3 | The secret scan is clean | No secret appears in the repository, the images or the deployed files |
| T4 | The backup of the live database is verified | A fresh backup exists and its checksum is recorded |
| T5 | The deployment is documented | A short runbook records how to restart, restore and roll back |

---

## 7. Operational runbook

### Restart

```bash
cd /opt/chat/payload && docker compose restart payload
sudo systemctl reload nginx
```

### Deploy a new version

```bash
cd /opt/chat/payload/src && git pull
cd payload-be && npm ci && npm run build
cd ../../vue-frontend && npm ci && npm run build && sudo rsync -a --delete dist/ /var/www/chat/
cd /opt/chat/payload && docker compose up -d --build payload
curl -s https://api.example.com/api/health
```

### Restore from backup

```bash
# 1. Stop writes
cd /opt/chat/payload && docker compose stop payload
# 2. Restore into a scratch DB first and verify
docker run --rm -v chat-restore:/data mongo:7 mongorestore --archive=/data/<backup>.archive --nsInclude='chat.*' --drop
# 3. Restore for real
docker run --rm -v chat-restore:/data mongo:7 mongorestore --archive=/data/<backup>.archive --nsInclude='chat.*' --drop
# 4. Restart and verify
docker compose start payload
curl -s https://api.example.com/api/health
```

### Roll back

```bash
cd /opt/chat/payload
docker compose down
# edit docker-compose.yml to pin the previous image tag
docker compose up -d
```

### Rotate `PAYLOAD_SECRET`

```bash
sudo sed -i "s|^PAYLOAD_SECRET=.*|PAYLOAD_SECRET=$(openssl rand -base64 48 | tr -d '\n')|" /opt/chat/payload/.env
cd /opt/chat/payload && docker compose up -d --force-recreate payload
```
All users are logged out. Verify the admin can log in again.

---

## 8. Explicitly not recommended

| Not recommended | Why |
|---|---|
| Running `vite dev` on the VPS | The Vite dev server has 7 known advisories (path traversal, arbitrary file read via WebSocket, cross-origin script execution). It must never be exposed. |
| Running `next dev` on the VPS | The development server is not hardened and exposes source maps and internals. Use `next build` + `next start`. |
| Publishing MongoDB to the host | Unauthenticated internet-facing database. Bind it to loopback. |
| A wildcard `cors: '*'` | Would allow any origin to make credentialed requests. Use an exact allow-list. |
| Disabling CSRF protection | The `SameSite=Lax` cookie plus origin checks are the defence. Disabling them removes protection entirely. |
| `trust proxy` semantics the app reads from a client-supplied header | `X-Forwarded-For` must be set by nginx, never trusted from the client. |
| Running the app as root | Both Dockerfiles should keep `USER app`. |
| `mongo:latest` | Unpinned base images make builds irreproducible and can change behaviour under you. |
| Exposing the Payload Admin Panel without IP restriction | It is a full CMS. Restrict it by IP if you have a stable one. |

---

## 9. Limitations

- This guide was written from the repository at commit `fdefa70` (originally `1b33cc7`). It has **not** been applied to any system, and none of the configuration above has been executed or validated against a live host.
- The domain names, IP addresses, ports and certificate paths are placeholders.
- The sizing table is an estimate based on the client polling cadence (3–4 s base, backing off to 30 s after B7); actual capacity depends on the MongoDB query plans for the message-history queries.
- The restore rehearsal in step 10 is written for a MongoDB container; adapt the paths if your backups live elsewhere.
- A successful go-live checklist does not mean the application is free of vulnerabilities. It means the **known** blockers from this audit are closed, the automated checks pass, and the operational basics are in place. Residual risk remains — particularly in the areas this audit could not verify: the VPS's own configuration, the MongoDB's internal security, and the behaviour of the code paths that were analysed statically but never executed.
