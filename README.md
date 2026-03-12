<p align="center">
  <img src="https://img.shields.io/badge/node-20+-339933?logo=node.js&logoColor=white" alt="Node">
  <img src="https://img.shields.io/badge/express-4.x-000000?logo=express&logoColor=white" alt="Express">
  <img src="https://img.shields.io/badge/mysql-8.0-4479A1?logo=mysql&logoColor=white" alt="MySQL">
  <img src="https://img.shields.io/badge/docker-ready-2496ED?logo=docker&logoColor=white" alt="Docker">
</p>

# LockDrop

Secure file sharing platform with password-protected links, expiration controls, and a drag & drop admin panel.

## Features

- **Drag & Drop Admin** — Upload files and entire folders, create folder trees, breadcrumb navigation
- **Password-Protected Sharing** — Every share link requires a password (bcrypt, cost 12)
- **Expiration & Limits** — Configurable TTL (1h → 30 days) and optional max download count
- **ZIP Downloads** — Recipients can download entire shared folders as a single ZIP
- **Security First** — Helmet CSP, CSRF tokens, rate-limiting, UUID storage, secure sessions

---

## Quick Start (Docker)

```bash
git clone https://github.com/sn0walice/lockdrop.seqlense.com.git
cd lockdrop.seqlense.com
cp .env.example .env   # edit with your values
docker compose up -d
```

App runs on `http://localhost:3000`.

## Quick Start (local dev)

```bash
cp .env.example .env
# Set DB_HOST=localhost and point to a running MySQL instance

npm install
npm run css:build
npm run dev
```

---

## Configuration

Copy `.env.example` to `.env` and fill in values:

```env
# Server
PORT=3000
NODE_ENV=production
SESSION_SECRET=          # openssl rand -hex 32

# Admin
ADMIN_USER=admin
ADMIN_PASSWORD=          # strong password

# Database
DB_HOST=mysql            # "mysql" for Docker, "localhost" for local
DB_PORT=3306
DB_NAME=lockdrop
DB_USER=lockdrop
DB_PASSWORD=             # strong password

# Upload
MAX_FILE_SIZE_MB=500
UPLOAD_DIR=./uploads

# App
APP_URL=https://lockdrop.yourdomain.com
```

> **Behind a reverse proxy?** Make sure it forwards `X-Forwarded-Proto` and `X-Forwarded-For`. LockDrop sets `trust proxy = 1` and uses `proxy: true` on session cookies when `APP_URL` starts with `https`.

---

## Production Deployment

Use `docker-compose.prod.yml` for production with Traefik or any reverse proxy:

```bash
cp .env.example .env    # configure with real values
docker compose -f docker-compose.prod.yml up -d
```

The production compose file:
- Pulls the pre-built image from GHCR (`ghcr.io/sn0walice/lockdrop`)
- Binds MySQL to internal network only (no exposed ports)
- Named volumes for uploads and database persistence
- Health checks on MySQL before app starts
- Auto-restart on failure

---

## CI/CD

Pushes to `main` and version tags (`v*`) automatically build and push a Docker image to GitHub Container Registry via GitHub Actions.

```
ghcr.io/sn0walice/lockdrop:latest
ghcr.io/sn0walice/lockdrop:sha-abc1234
ghcr.io/sn0walice/lockdrop:v1.0.0
```

---

## Architecture

```
src/
├── app.ts                  # Express entry point
├── config/database.ts      # Sequelize connection
├── middleware/
│   ├── auth.ts             # Admin session guard
│   ├── security.ts         # Helmet, rate-limit, CSRF
│   └── upload.ts           # Multer config (UUID filenames)
├── models/
│   ├── File.ts             # Uploaded file metadata
│   ├── Folder.ts           # Folder tree (self-referencing)
│   └── ShareLink.ts        # Password-protected share links
├── routes/
│   ├── auth.ts             # Login / logout
│   ├── admin.ts            # Dashboard, upload, CRUD
│   └── share.ts            # Public share pages, downloads
└── views/                  # EJS templates
```

## Share Link Flow

1. Admin uploads files via the dashboard
2. Admin creates a share link → sets password, expiration, optional download limit
3. Admin copies the link (`/s/:uuid`) and sends it to the recipient
4. Recipient opens the link → enters password → downloads files or ZIP
5. Link auto-expires after TTL or download limit

## Security

| Layer | Detail |
|---|---|
| Passwords | bcrypt (cost 12) |
| Rate-limiting | 5 attempts/min per share link, 10 login attempts/15min |
| CSP | Helmet with strict Content-Security-Policy |
| CSRF | Token per session on all POST/PUT/DELETE |
| File storage | UUID filenames (no path traversal) |
| Sessions | MySQL-backed, httpOnly, sameSite=lax, secure behind HTTPS proxy |
| Uploads | Size cap via `MAX_FILE_SIZE_MB` |

## License

MIT
