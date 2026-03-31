# IONOS Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy Reeldocs to IONOS VPS at `docs.respeak.io` with disabled registration and Supabase Cloud backend.

**Architecture:** Dockerized Next.js standalone app behind existing Traefik reverse proxy on IONOS. Supabase Cloud (free tier, EU region) for database, auth, and storage. Cloudflare DNS A record for `docs.respeak.io` pointing to the VPS.

**Tech Stack:** Next.js 16 (standalone output), Docker multi-stage build, pnpm 10, Node 22, Traefik v3.2, Supabase Cloud, Cloudflare DNS.

**Spec:** `docs/superpowers/specs/2026-03-31-ionos-deployment-design.md`

---

### Task 1: Enable Next.js Standalone Output

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Update next.config.ts**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

- [ ] **Step 2: Verify the build still works**

Run: `pnpm build`
Expected: Build succeeds with "Standalone output enabled" or similar message in output. A `.next/standalone` directory should be created.

- [ ] **Step 3: Commit**

```bash
git add next.config.ts
git commit --no-gpg-sign -m "feat: enable standalone output for Docker deployment"
```

---

### Task 2: Create Dockerfile

**Files:**
- Create: `Dockerfile`

This is a monorepo with `pnpm-workspace.yaml` and a workspace dependency (`"reeldocs": "workspace:*"` referencing `packages/cli`). The Dockerfile must handle this correctly.

- [ ] **Step 1: Create the Dockerfile**

```dockerfile
FROM node:22-alpine AS base

# --- Stage 1: Install dependencies ---
FROM base AS deps
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

# Copy workspace root config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy workspace package manifests
COPY packages/cli/package.json packages/cli/

# Install all dependencies (including workspace packages)
RUN pnpm install --frozen-lockfile

# --- Stage 2: Build the application ---
FROM base AS builder
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/cli/node_modules ./packages/cli/node_modules
COPY . .

# Build arguments for public env vars (needed at build time by Next.js)
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

RUN pnpm build

# --- Stage 3: Production runtime ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy public assets
COPY --from=builder /app/public ./public

# Copy standalone output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
```

- [ ] **Step 2: Test the Docker build locally**

Run: `docker build --build-arg NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=test -t reeldocs .`
Expected: Build completes successfully. Image size should be ~150-250MB.

Check image size: `docker images reeldocs`

- [ ] **Step 3: Test the container runs**

Run: `docker run --rm -p 3000:3000 -e SUPABASE_SERVICE_ROLE_KEY=test -e GEMINI_API_KEY=test reeldocs`
Expected: Server starts on port 3000. Visit `http://localhost:3000` — you should see the login page (it will fail to connect to Supabase, but the app should render).

Press Ctrl+C to stop.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile
git commit --no-gpg-sign -m "feat: add multi-stage Dockerfile for production deployment"
```

---

### Task 3: Create .dockerignore

**Files:**
- Create: `.dockerignore`

- [ ] **Step 1: Create .dockerignore**

```
node_modules
.next
.git
.gitignore
supabase
.env*
!.env.example
*.md
e2e
test-results
playwright-report
.superpowers
.agents
.claude
generated
plan.yaml
test-plan.yaml
skills-lock.json
.worktrees
.playwright-mcp
.DS_Store
.vercel
gallery
```

- [ ] **Step 2: Commit**

```bash
git add .dockerignore
git commit --no-gpg-sign -m "feat: add .dockerignore for clean build context"
```

---

### Task 4: Create docker-compose.yml

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Create docker-compose.yml**

```yaml
services:
  reeldocs:
    build:
      context: .
      args:
        - NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
        - NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
    restart: unless-stopped
    env_file:
      - .env
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.reeldocs.rule=Host(`docs.respeak.io`)"
      - "traefik.http.routers.reeldocs.entrypoints=websecure"
      - "traefik.http.routers.reeldocs.tls.certresolver=myresolver"
      - "traefik.http.services.reeldocs.loadbalancer.server.port=3000"
    ports:
      - "3000:3000"
```

Note: `NEXT_PUBLIC_*` vars are passed as build args because Next.js inlines them at build time. Runtime-only vars (`SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`) are passed via `env_file`.

- [ ] **Step 2: Commit**

```bash
git add docker-compose.yml
git commit --no-gpg-sign -m "feat: add docker-compose with Traefik labels for docs.respeak.io"
```

---

### Task 5: Disable Registration — Signup Page

**Files:**
- Modify: `app/(auth)/signup/page.tsx`

- [ ] **Step 1: Replace signup page with closed-registration notice**

Replace the entire file content with:

```tsx
import Link from "next/link";
import { Mail } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SignupPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrations closed</CardTitle>
        <CardDescription>
          We are not accepting new sign-ups at this time.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="rounded-lg border bg-muted/50 p-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 mb-2 font-medium text-foreground">
            <Mail className="size-4" />
            Request access
          </div>
          <p>
            Please email{" "}
            <a
              href="mailto:info@respeak.io"
              className="underline text-foreground hover:text-primary"
            >
              info@respeak.io
            </a>{" "}
            to request an account.
          </p>
        </div>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
```

This page is now a server component (no "use client" needed since there's no state or interactivity).

- [ ] **Step 2: Verify locally**

Run: `pnpm dev`
Navigate to `http://localhost:3000/signup`.
Expected: Card showing "Registrations closed" message with the email link and a "Sign in" link.

- [ ] **Step 3: Commit**

```bash
git add app/\(auth\)/signup/page.tsx
git commit --no-gpg-sign -m "feat: disable registration with closed-notice and email contact"
```

---

### Task 6: Disable Registration — Remove Signup Link from Login Page

**Files:**
- Modify: `app/(auth)/login/page.tsx`

- [ ] **Step 1: Remove the signup link from the login page**

In `app/(auth)/login/page.tsx`, remove the `Link` import and the signup paragraph at the bottom of the form.

Remove the `Link` import (line 5):
```tsx
import Link from "next/link";
```

Remove the signup link paragraph (lines 96-101):
```tsx
          <p className="text-center text-sm text-muted-foreground">
            No account?{" "}
            <Link href="/signup" className="underline">
              Sign up
            </Link>
          </p>
```

- [ ] **Step 2: Verify locally**

Navigate to `http://localhost:3000/login`.
Expected: Login form with email, password, sign-in button, and GitHub login. No "Sign up" link at the bottom.

- [ ] **Step 3: Commit**

```bash
git add app/\(auth\)/login/page.tsx
git commit --no-gpg-sign -m "feat: remove signup link from login page"
```

---

### Task 7: Fix Page Titles and Metadata

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/(docs)/[projectSlug]/[articleSlug]/page.tsx`

The root layout currently says "Create Next App". We need:
- Default title: "Reeldocs" with a template for sub-pages
- Dashboard pages: "Page | Reeldocs" (via the template)
- Public docs pages: "Article Title | Project Name" (dynamic, per-article)

- [ ] **Step 1: Update root layout metadata**

In `app/layout.tsx`, change the metadata export (lines 16-19) from:

```ts
export const metadata: Metadata = {
  title: "Create Next App",
  description: "Generated by create next app",
};
```

to:

```ts
export const metadata: Metadata = {
  title: {
    default: "Reeldocs",
    template: "%s | Reeldocs",
  },
  description: "AI-powered video-to-documentation platform",
};
```

This sets "Reeldocs" as the default tab title and provides a template so any child page that sets `metadata.title = "Dashboard"` will render as "Dashboard | Reeldocs".

- [ ] **Step 2: Add dynamic metadata to public docs article page**

In `app/(docs)/[projectSlug]/[articleSlug]/page.tsx`, add a `generateMetadata` export before the default export. Add this import at the top:

```ts
import type { Metadata } from "next";
```

Then add this function before the `ArticlePage` component:

```ts
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ projectSlug: string; articleSlug: string }>;
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const { projectSlug, articleSlug } = await params;
  const { lang = "en" } = await searchParams;
  const supabase = await createClient();

  const { data: article } = await supabase
    .from("articles")
    .select("title, projects!inner(name)")
    .eq("projects.slug", projectSlug)
    .eq("slug", articleSlug)
    .eq("language", lang)
    .eq("status", "published")
    .single();

  if (!article) return { title: "Not Found" };

  const projectName = (article.projects as unknown as { name: string }).name;
  return {
    title: `${article.title} | ${projectName}`,
  };
}
```

This produces tab titles like "Getting Started | My Product Docs" for public docs pages.

- [ ] **Step 3: Verify locally**

Run: `pnpm dev`
- Visit `http://localhost:3000/login` — tab should show "Reeldocs"
- Visit a public docs article — tab should show "Article Title | Project Name"

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx app/\(docs\)/\[projectSlug\]/\[articleSlug\]/page.tsx
git commit --no-gpg-sign -m "feat: set proper page titles and metadata"
```

---

### Task 8: Replace Default Root Page with Redirect

**Files:**
- Modify: `app/page.tsx`

The root page currently shows the default Next.js "Create Next App" template. Replace it with a redirect to the dashboard (which itself redirects to login if not authenticated).

- [ ] **Step 1: Replace app/page.tsx**

Replace the entire file content with:

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
```

- [ ] **Step 2: Verify locally**

Navigate to `http://localhost:3000/`.
Expected: Immediately redirects to `/dashboard` (or `/login` if not authenticated).

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit --no-gpg-sign -m "feat: redirect root page to dashboard"
```

---

### Task 9: Update .env.example with Production Notes

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Update .env.example with comments**

```bash
# Supabase Cloud credentials (from https://supabase.com/dashboard)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Google Gemini API key (for video processing)
GEMINI_API_KEY=
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit --no-gpg-sign -m "docs: add comments to .env.example for production setup"
```

---

### Task 10: Final Build Verification

- [ ] **Step 1: Run lint**

Run: `pnpm lint`
Expected: No errors.

- [ ] **Step 2: Run a full production build**

Run: `pnpm build`
Expected: Build succeeds. `.next/standalone` directory is created.

- [ ] **Step 3: Run the Docker build end-to-end**

```bash
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=test \
  -t reeldocs .
```

Expected: Build completes. Run `docker images reeldocs` to verify image size is reasonable (~150-250MB).

- [ ] **Step 4: Push to remote**

```bash
git push origin main
```

---

### Task 11: Supabase Cloud Setup (manual, on supabase.com)

These steps are performed in the browser and Supabase CLI — not automated.

- [ ] **Step 1: Create Supabase project**

Go to [supabase.com/dashboard](https://supabase.com/dashboard). Create an account if needed. Create a new project in the EU West region. Note the project reference ID.

- [ ] **Step 2: Link and push migrations**

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Expected: All 15 migration files applied successfully.

- [ ] **Step 3: Set Site URL**

In Supabase Dashboard: Authentication > URL Configuration > set Site URL to `https://docs.respeak.io`

- [ ] **Step 4: Create user account**

In Supabase Dashboard: Authentication > Add User. Enter your email and password. The database trigger `handle_new_user()` will automatically create your organization.

- [ ] **Step 5: Disable signups**

In Supabase Dashboard: Authentication > Settings > toggle off "Allow new users to sign up".

- [ ] **Step 6: Note credentials**

From Project Settings > API, copy:
- Project URL → `NEXT_PUBLIC_SUPABASE_URL`
- Anon public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Service role key → `SUPABASE_SERVICE_ROLE_KEY`

---

### Task 12: Cloudflare DNS Setup (manual, on Cloudflare)

- [ ] **Step 1: Add A record**

In Cloudflare Dashboard > `respeak.io` zone > DNS > Add Record:
- Type: `A`
- Name: `docs`
- Content: `212.227.180.167`
- Proxy: OFF (DNS only, grey cloud)

- [ ] **Step 2: Verify DNS propagation**

Run (from any machine): `dig docs.respeak.io +short`
Expected: `212.227.180.167`

---

### Task 13: Deploy to IONOS Server (manual, via SSH)

- [ ] **Step 1: Clone the repository**

```bash
ssh root@212.227.180.167
cd ~
git clone <your-repo-url> reeldocs
cd reeldocs
```

- [ ] **Step 2: Create .env file**

```bash
cat > .env << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
GEMINI_API_KEY=AIza...
EOF
```

Replace placeholders with actual values from Task 11 Step 6.

- [ ] **Step 3: Build and start**

```bash
docker compose up --build -d
```

Expected: Container builds and starts. Check logs:

```bash
docker compose logs -f reeldocs
```

Expected: `Ready on http://0.0.0.0:3000`

- [ ] **Step 4: Verify Traefik picks up the route**

```bash
curl -I https://docs.respeak.io
```

Expected: HTTP 200 (or 307 redirect to /login). TLS certificate issued by Let's Encrypt.

- [ ] **Step 5: Test login**

Open `https://docs.respeak.io` in browser. Login with credentials created in Task 9 Step 4. Verify dashboard loads and is functional.

- [ ] **Step 6: Test registration is disabled**

Navigate to `https://docs.respeak.io/signup`. Verify the "Registrations closed" notice appears with the info@respeak.io email link.
