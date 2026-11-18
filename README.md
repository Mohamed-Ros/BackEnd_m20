# M20 Backend API

Express + MongoDB API for the M20 store (store front end, dashboard, Fawaterk payments, Cloudinary media, Meta CAPI).

## Run locally
```bash
cp .env.example .env     # fill in MONGO_URI, JWT_SECRET, Cloudinary, SMTP ...
npm install
npm run dev              # http://localhost:5000  (health: /health)
```

## No seed data
The project ships **no seeders and no demo products**. The database starts empty:
1. Create the first admin: `MASTER_ADMIN_PASSWORD='choose-a-strong-password' npm run setup:admin`
2. Log in to the dashboard and add raw materials, formulas and products there.

## Deploy to a server

### Required environment (production)
| Variable | Notes |
|---|---|
| `NODE_ENV` | `production` |
| `MONGO_URI` | MongoDB Atlas / server URI. Production never falls back to a local DB |
| `JWT_SECRET` | 32+ random characters (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
| `CORS_ORIGIN` | comma-separated store + dashboard domains |
| `CLOUDINARY_*`, `SMTP_*`/`EMAIL_*`, `FAWATERK_*` | see `.env.example` (use the live Fawaterk URL and redirect URL) |

The server exits on start if `MONGO_URI` or `JWT_SECRET` is missing in production.

### Option A: Node + PM2 (VPS)
```bash
npm ci --omit=dev
npm i -g pm2
pm2 start src/server.js --name m20-api
pm2 save && pm2 startup
```
Put nginx (or Caddy) in front for HTTPS and proxy to `127.0.0.1:5000`. The app trusts one proxy hop (`trust proxy 1`) so rate limiting sees real client IPs.

### Option B: Docker
```bash
docker build -t m20-api .
docker run -d --name m20-api --env-file .env -p 5000:5000 m20-api
```

### Option C: Render / Railway
Build command `npm ci --omit=dev`, start command `npm start`, set the env vars above, health check path `/health`.

### After deploying
- `GET /health` returns 200.
- Front end: set `VITE_API_URL=https://api.your-domain/api`. Dashboard: same value.
- On Vercel (store front end) also set `API_URL` to the same value so link previews and the sitemap work.
- Run `npm run backup` on a schedule (cron) for MongoDB dumps, if you do not use Atlas backups.
