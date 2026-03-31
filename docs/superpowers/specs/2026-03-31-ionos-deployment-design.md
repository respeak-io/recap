# IONOS Deployment Design

## Overview

Deploy Reeldocs to an IONOS VPS at `docs.respeak.io`, using Supabase Cloud for database/auth/storage and a Dockerized Next.js app behind the existing Traefik reverse proxy.

## Architecture

```
User browser
    │
    ▼ HTTPS (port 443)
┌──────────────────────────────────────────────────┐
│  IONOS VPS (212.227.180.167)                     │
│                                                  │
│  Traefik (host network, port 443)                │
│    ├── fom.respeak.io → localhost:8001            │
│    ├── docs.respeak.io → localhost:3000  ← NEW   │
│    └── ... other services                        │
│                                                  │
│  Docker: reeldocs container (port 3000)           │
│    └── Next.js standalone (production)           │
└──────────────────────────────────────────────────┘
    │
    ▼ HTTPS
┌──────────────────────────────────────────────────┐
│  Supabase Cloud (EU region)                      │
│    ├── PostgreSQL (schema from migrations)       │
│    ├── GoTrue (auth, signups disabled)           │
│    └── Storage (file uploads)                    │
└──────────────────────────────────────────────────┘
```

## Components

### 1. Supabase Cloud Setup (manual, one-time)

- Create Supabase account and project (EU West region)
- Note: project URL, anon key, service role key
- Link local project and push migrations:
  ```bash
  supabase link --project-ref <ref>
  supabase db push
  ```
- Set Site URL to `https://docs.respeak.io` in Authentication > URL Configuration
- Create user account via Authentication > Add User (email + password)
- Disable signups: Authentication > Settings > toggle off "Allow new users to sign up"
- (Optional) Update GitHub OAuth callback URL to `https://docs.respeak.io/callback` if using GitHub login

### 2. Dockerfile (multi-stage, standalone)

Three-stage build for a slim production image (~150MB):

- **Stage 1 (deps):** Install production dependencies with pnpm
- **Stage 2 (build):** Build Next.js with `output: "standalone"`
- **Stage 3 (runtime):** Copy standalone output, public assets, static files into a minimal Node.js image

### 3. docker-compose.yml

Single-service compose file, committed to the repo root. On the IONOS server, the repo is cloned to `~/reeldocs/`:

```yaml
services:
  reeldocs:
    build: .
    restart: unless-stopped
    env_file:
      - .env
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.reeldocs.rule=Host(`docs.respeak.io`)"
      - "traefik.http.routers.reeldocs.entrypoints=websecure"
      - "traefik.http.routers.reeldocs.tls.certresolver=myresolver"
    ports:
      - "3000:3000"
```

### 4. Environment variables (.env on server)

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
GEMINI_API_KEY=AIza...
```

### 5. Next.js config change

Enable standalone output in `next.config.ts`:

```ts
output: "standalone"
```

### 6. .dockerignore

Exclude unnecessary files from the Docker build context:

```
node_modules
.next
.git
supabase
.env*
*.md
e2e
.superpowers
.agents
.claude
generated
```

### 7. Cloudflare DNS (manual, one-time)

Add an A record in the `respeak.io` zone:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | docs | 212.227.180.167 | Off (DNS only) |

Proxy must be OFF — Traefik handles TLS via Let's Encrypt with Cloudflare DNS challenge.

### 8. Disable Registration (frontend changes)

- **Signup page** (`app/(auth)/signup/page.tsx`): Replace the form with a notice:
  > "Registrations are currently closed. Please email info@respeak.io for access."
- **Login page** (`app/(auth)/login/page.tsx`): Remove the "Sign up" link
- Keep login page fully functional

### 9. Deployment Flow

```bash
# On IONOS server
cd ~/reeldocs
git pull origin main
docker compose up --build -d

# Check logs
docker compose logs -f reeldocs
```

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Database hosting | Supabase Cloud (free tier) | Zero ops, free, easy migration to self-hosted later |
| Subdomain | `docs.respeak.io` (single) | Dashboard + public docs on same domain, simplest setup |
| Registration | Disabled (FE + Supabase setting) | Closed beta, email info@respeak.io for access |
| User creation | Supabase Dashboard UI | One-time, no script needed |
| CI/CD | Manual (git pull + docker compose) | Simple, can add GitHub Actions later |
| Port | 3000 | Verified free on IONOS server |

## Post-Deployment Checklist

- [ ] Supabase project created and linked
- [ ] Migrations pushed to cloud DB
- [ ] Site URL set to `https://docs.respeak.io`
- [ ] User account created in Supabase dashboard
- [ ] Signups disabled in Supabase dashboard
- [ ] Cloudflare A record added (proxy off)
- [ ] `.env` file created on IONOS server with production values
- [ ] `docker compose up --build -d` succeeds
- [ ] `https://docs.respeak.io` loads login page
- [ ] Login works with created account
- [ ] Dashboard functional, can create/edit projects
- [ ] Public docs pages render correctly
- [ ] (Optional) GitHub OAuth callback updated
