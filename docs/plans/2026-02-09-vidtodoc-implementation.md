# vidtodoc Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a web app that converts product videos into audience-tailored documentation with a Mintlify-style reading experience.

**Architecture:** Next.js 16 App Router monolith with Supabase for database/storage/auth. Video processing via Gemini API (multimodal). Tiptap editor for doc polishing. Org-scoped multi-tenancy from day one.

**Tech Stack:** Next.js 16, TypeScript, shadcn/ui, Tailwind CSS, Tiptap, Supabase (Postgres + Storage + Auth), Google Gemini API (@google/genai), Vercel

**Design doc:** `docs/plans/2026-02-09-vidtodoc-design.md`

---

## Task 1: Project Scaffolding

**Files:**
- Create: `vidtodoc/` (Next.js project root)
- Create: `.env.local`
- Create: `.env.example`

**Step 1: Initialize Next.js 16 project**

Run from the parent directory (`Respeak_Experiments/`):
```bash
cd /Users/Tim/Documents/Respeak_Experiments
npx create-next-app@latest vidtodoc --yes
```

This creates a Next.js 16 project with TypeScript, App Router, Tailwind CSS, ESLint, and Turbopack enabled by default.

**Step 2: Initialize shadcn/ui**

```bash
cd /Users/Tim/Documents/Respeak_Experiments/vidtodoc
npx shadcn@latest init -y
```

**Step 3: Add initial shadcn components**

```bash
npx shadcn@latest add button card dialog dropdown-menu input label separator sheet command badge tooltip avatar
```

**Step 4: Install remaining dependencies**

```bash
# Tiptap editor
npm install @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-image @tiptap/extension-placeholder @tiptap/extension-code-block-lowlight lowlight

# Supabase
npm install @supabase/supabase-js @supabase/ssr

# Gemini API
npm install @google/genai

# Utilities
npm install zustand nanoid slugify
```

**Step 5: Install Supabase CLI and initialize**

```bash
npm install supabase --save-dev
npx supabase init
```

**Step 6: Create environment files**

Create `.env.example`:
```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
```

Create `.env.local` with actual values (user fills these in).

**Step 7: Verify the app starts**

```bash
npm run dev
```

Expected: App starts on `http://localhost:3000` with the default Next.js page.

**Step 8: Commit**

```bash
git init
git add .
git commit -m "chore: scaffold next.js 16 project with shadcn, tiptap, supabase"
```

---

## Task 2: Supabase Client Utilities

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/middleware.ts`
- Create: `src/middleware.ts`

**Step 1: Create browser client**

```typescript
// src/lib/supabase/client.ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

**Step 2: Create server client**

```typescript
// src/lib/supabase/server.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  );
}
```

**Step 3: Create middleware helper**

```typescript
// src/lib/supabase/middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getUser();

  return supabaseResponse;
}
```

**Step 4: Create Next.js middleware**

```typescript
// src/middleware.ts
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

**Step 5: Verify build passes**

```bash
npm run build
```

Expected: Build succeeds without errors.

**Step 6: Commit**

```bash
git add src/lib/supabase/ src/middleware.ts
git commit -m "feat: add supabase client utilities and auth middleware"
```

---

## Task 3: Database Schema Migration

**Files:**
- Create: `supabase/migrations/00001_init_schema.sql`

**Step 1: Create the migration file**

```bash
npx supabase migration new init_schema
```

**Step 2: Write the schema**

Edit the generated migration file at `supabase/migrations/<timestamp>_init_schema.sql`:

```sql
-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- Organizations
create table organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

-- Organization members
create table organization_members (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

-- Projects (a docs site)
create table projects (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  is_public boolean not null default true,
  password_hash text,
  created_at timestamptz not null default now(),
  unique (org_id, slug)
);

-- Chapters (sidebar grouping)
create table chapters (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  slug text not null,
  "order" integer not null default 0,
  unique (project_id, slug)
);

-- Videos
create table videos (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  storage_path text,
  vtt_content text,
  duration_seconds integer,
  status text not null default 'uploading' check (status in ('uploading', 'processing', 'ready', 'failed')),
  created_at timestamptz not null default now()
);

-- Video segments (intermediate extraction from Gemini)
create table video_segments (
  id uuid primary key default uuid_generate_v4(),
  video_id uuid not null references videos(id) on delete cascade,
  start_time numeric not null,
  end_time numeric not null,
  spoken_content text,
  visual_context text,
  "order" integer not null default 0
);

-- Articles
create table articles (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  video_id uuid references videos(id) on delete set null,
  chapter_id uuid references chapters(id) on delete set null,
  title text not null,
  slug text not null,
  audience text not null default 'developers',
  content_json jsonb not null default '{}',
  content_text text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published')),
  "order" integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, audience, slug)
);

-- Full-text search index on articles
alter table articles add column fts tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content_text, '')), 'B')
  ) stored;

create index articles_fts_idx on articles using gin(fts);

-- Full-text search index on video VTT content
alter table videos add column fts tsvector
  generated always as (
    to_tsvector('english', coalesce(vtt_content, ''))
  ) stored;

create index videos_fts_idx on videos using gin(fts);

-- Updated_at trigger
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger articles_updated_at
  before update on articles
  for each row execute function update_updated_at();

-- Auto-create organization on user signup
create or replace function handle_new_user()
returns trigger as $$
declare
  org_id uuid;
begin
  insert into organizations (name, slug)
  values (
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.id::text
  )
  returning id into org_id;

  insert into organization_members (org_id, user_id, role)
  values (org_id, new.id, 'owner');

  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
```

**Step 3: Apply migration locally**

```bash
npx supabase start
npx supabase migration up
```

Expected: Migration applies successfully. Check at `http://localhost:54323` (Supabase Studio).

**Step 4: Commit**

```bash
git add supabase/
git commit -m "feat: add database schema with org-scoped multi-tenancy"
```

---

## Task 4: RLS Policies

**Files:**
- Create: `supabase/migrations/00002_rls_policies.sql`

**Step 1: Create the migration**

```bash
npx supabase migration new rls_policies
```

**Step 2: Write RLS policies**

```sql
-- Enable RLS on all tables
alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table projects enable row level security;
alter table chapters enable row level security;
alter table videos enable row level security;
alter table video_segments enable row level security;
alter table articles enable row level security;

-- Helper: check if user is member of org
create or replace function is_org_member(org uuid)
returns boolean as $$
  select exists (
    select 1 from organization_members
    where organization_members.org_id = org
    and organization_members.user_id = auth.uid()
  );
$$ language sql security definer;

-- Helper: check if user has write role in org
create or replace function is_org_writer(org uuid)
returns boolean as $$
  select exists (
    select 1 from organization_members
    where organization_members.org_id = org
    and organization_members.user_id = auth.uid()
    and organization_members.role in ('owner', 'editor')
  );
$$ language sql security definer;

-- Organizations: members can read, owners can update
create policy "org_select" on organizations for select using (is_org_member(id));
create policy "org_update" on organizations for update using (
  exists (
    select 1 from organization_members
    where org_id = organizations.id
    and user_id = auth.uid()
    and role = 'owner'
  )
);

-- Organization members: members can read their own org
create policy "members_select" on organization_members for select using (is_org_member(org_id));

-- Projects: org members can read, writers can insert/update/delete
create policy "projects_select" on projects for select using (is_org_member(org_id));
create policy "projects_insert" on projects for insert with check (is_org_writer(org_id));
create policy "projects_update" on projects for update using (is_org_writer(org_id));
create policy "projects_delete" on projects for delete using (is_org_writer(org_id));

-- Public project access (for published docs site, no auth required)
create policy "projects_public_select" on projects for select using (is_public = true);

-- Chapters: access through project's org
create policy "chapters_select" on chapters for select using (
  exists (select 1 from projects where projects.id = project_id and (is_org_member(projects.org_id) or projects.is_public))
);
create policy "chapters_insert" on chapters for insert with check (
  exists (select 1 from projects where projects.id = project_id and is_org_writer(projects.org_id))
);
create policy "chapters_update" on chapters for update using (
  exists (select 1 from projects where projects.id = project_id and is_org_writer(projects.org_id))
);
create policy "chapters_delete" on chapters for delete using (
  exists (select 1 from projects where projects.id = project_id and is_org_writer(projects.org_id))
);

-- Videos: access through project's org
create policy "videos_select" on videos for select using (
  exists (select 1 from projects where projects.id = project_id and is_org_member(projects.org_id))
);
create policy "videos_insert" on videos for insert with check (
  exists (select 1 from projects where projects.id = project_id and is_org_writer(projects.org_id))
);
create policy "videos_update" on videos for update using (
  exists (select 1 from projects where projects.id = project_id and is_org_writer(projects.org_id))
);
create policy "videos_delete" on videos for delete using (
  exists (select 1 from projects where projects.id = project_id and is_org_writer(projects.org_id))
);

-- Video segments: access through video's project's org
create policy "segments_select" on video_segments for select using (
  exists (
    select 1 from videos
    join projects on projects.id = videos.project_id
    where videos.id = video_id and is_org_member(projects.org_id)
  )
);
create policy "segments_insert" on video_segments for insert with check (
  exists (
    select 1 from videos
    join projects on projects.id = videos.project_id
    where videos.id = video_id and is_org_writer(projects.org_id)
  )
);

-- Articles: org members can read, writers can modify, public can read published
create policy "articles_select" on articles for select using (
  exists (select 1 from projects where projects.id = project_id and is_org_member(projects.org_id))
);
create policy "articles_public_select" on articles for select using (
  status = 'published' and exists (select 1 from projects where projects.id = project_id and is_public)
);
create policy "articles_insert" on articles for insert with check (
  exists (select 1 from projects where projects.id = project_id and is_org_writer(projects.org_id))
);
create policy "articles_update" on articles for update using (
  exists (select 1 from projects where projects.id = project_id and is_org_writer(projects.org_id))
);
create policy "articles_delete" on articles for delete using (
  exists (select 1 from projects where projects.id = project_id and is_org_writer(projects.org_id))
);
```

**Step 3: Apply migration**

```bash
npx supabase migration up
```

Expected: Migration applies. Verify in Supabase Studio that RLS is enabled on all tables.

**Step 4: Commit**

```bash
git add supabase/
git commit -m "feat: add row-level security policies for org-scoped access"
```

---

## Task 5: Supabase Storage Bucket

**Files:**
- Create: `supabase/migrations/00003_storage.sql`

**Step 1: Create the migration**

```bash
npx supabase migration new storage
```

**Step 2: Configure storage bucket**

```sql
-- Create videos bucket
insert into storage.buckets (id, name, public)
values ('videos', 'videos', false);

-- Storage policies: org writers can upload videos
create policy "videos_upload" on storage.objects for insert
with check (
  bucket_id = 'videos'
  and auth.role() = 'authenticated'
);

-- Org members can read their videos (path format: org_id/project_id/video_id.mp4)
create policy "videos_read" on storage.objects for select
using (
  bucket_id = 'videos'
  and auth.role() = 'authenticated'
);

-- Public read for videos linked to public projects (served via signed URLs instead)
-- We'll use signed URLs from the API for public video access
```

**Step 3: Apply migration**

```bash
npx supabase migration up
```

**Step 4: Commit**

```bash
git add supabase/
git commit -m "feat: add supabase storage bucket for videos"
```

---

## Task 6: Authentication Pages

**Files:**
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/app/(auth)/signup/page.tsx`
- Create: `src/app/(auth)/callback/route.ts`
- Create: `src/app/(auth)/layout.tsx`

**Step 1: Create auth layout (centered card)**

```typescript
// src/app/(auth)/layout.tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
```

**Step 2: Create login page**

```typescript
// src/app/(auth)/login/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  async function handleGitHubLogin() {
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${window.location.origin}/callback` },
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Sign in to your vidtodoc account</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleLogin} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading}>{loading ? "Signing in..." : "Sign in"}</Button>
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">Or</span></div>
          </div>
          <Button type="button" variant="outline" onClick={handleGitHubLogin}>Continue with GitHub</Button>
          <p className="text-center text-sm text-muted-foreground">
            No account? <Link href="/signup" className="underline">Sign up</Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
```

**Step 3: Create signup page**

```typescript
// src/app/(auth)/signup/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/callback` },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create account</CardTitle>
        <CardDescription>Get started with vidtodoc</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSignup} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading}>{loading ? "Creating account..." : "Sign up"}</Button>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account? <Link href="/login" className="underline">Sign in</Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
```

**Step 4: Create OAuth callback handler**

```typescript
// src/app/(auth)/callback/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
```

**Step 5: Verify auth pages render**

```bash
npm run dev
```

Visit `http://localhost:3000/login` and `http://localhost:3000/signup`.
Expected: Clean shadcn cards with form fields render correctly.

**Step 6: Commit**

```bash
git add src/app/\(auth\)/
git commit -m "feat: add login, signup, and oauth callback pages"
```

---

## Task 7: Dashboard Layout & Project CRUD

**Files:**
- Create: `src/app/(dashboard)/layout.tsx`
- Create: `src/app/(dashboard)/dashboard/page.tsx`
- Create: `src/lib/queries/projects.ts`
- Create: `src/components/create-project-dialog.tsx`

**Step 1: Create dashboard layout with top nav**

```typescript
// src/app/(dashboard)/layout.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="container flex h-14 items-center justify-between">
          <Link href="/dashboard" className="font-semibold">vidtodoc</Link>
          <form action="/api/auth/signout" method="post">
            <Button variant="ghost" size="sm" type="submit">Sign out</Button>
          </form>
        </div>
      </header>
      <main className="container py-8">{children}</main>
    </div>
  );
}
```

**Step 2: Create project queries**

```typescript
// src/lib/queries/projects.ts
import { createClient } from "@/lib/supabase/server";

export async function getUserOrg() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  return membership?.org_id;
}

export async function getProjects() {
  const supabase = await createClient();
  const orgId = await getUserOrg();

  const { data } = await supabase
    .from("projects")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  return data ?? [];
}

export async function createProject(name: string, slug: string) {
  const supabase = await createClient();
  const orgId = await getUserOrg();

  const { data, error } = await supabase
    .from("projects")
    .insert({ org_id: orgId, name, slug })
    .select()
    .single();

  if (error) throw error;
  return data;
}
```

**Step 3: Create dashboard page listing projects**

```typescript
// src/app/(dashboard)/dashboard/page.tsx
import { getProjects } from "@/lib/queries/projects";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import Link from "next/link";

export default async function DashboardPage() {
  const projects = await getProjects();

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Projects</h1>
        <CreateProjectDialog />
      </div>
      {projects.length === 0 ? (
        <p className="text-muted-foreground">No projects yet. Create your first one.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link key={project.id} href={`/project/${project.slug}`}>
              <Card className="hover:border-primary transition-colors">
                <CardHeader>
                  <CardTitle>{project.name}</CardTitle>
                  <CardDescription>/{project.slug}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 4: Create the "new project" dialog component**

This is a client component with a form inside a shadcn Dialog. It calls a server action to create the project and refreshes the page.

**Step 5: Create signout API route**

```typescript
// src/app/api/auth/signout/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_SUPABASE_URL).origin);
}
```

**Step 6: Verify dashboard loads**

Sign up a test user, verify redirect to `/dashboard`, verify empty state shows.

**Step 7: Commit**

```bash
git add src/app/\(dashboard\)/ src/lib/queries/ src/components/create-project-dialog.tsx src/app/api/auth/
git commit -m "feat: add dashboard with project listing and creation"
```

---

## Task 8: Project Detail Page & Video Upload

**Files:**
- Create: `src/app/(dashboard)/project/[slug]/page.tsx`
- Create: `src/app/api/videos/upload-url/route.ts`
- Create: `src/components/video-upload.tsx`
- Create: `src/lib/queries/videos.ts`

**Step 1: Create video queries**

```typescript
// src/lib/queries/videos.ts
import { createClient } from "@/lib/supabase/server";

export async function getProjectVideos(projectId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("videos")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  return data ?? [];
}
```

**Step 2: Create presigned upload URL API route**

```typescript
// src/app/api/videos/upload-url/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { projectId } = await request.json();

  // Verify user has access to project
  const { data: project } = await supabase
    .from("projects")
    .select("id, org_id")
    .eq("id", projectId)
    .single();

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const videoId = nanoid();
  const storagePath = `${project.org_id}/${projectId}/${videoId}.mp4`;

  // Create video record
  const { data: video } = await supabase
    .from("videos")
    .insert({
      id: videoId,
      project_id: projectId,
      title: "Untitled Video",
      storage_path: storagePath,
      status: "uploading",
    })
    .select()
    .single();

  // Generate signed upload URL
  const { data: uploadData } = await supabase.storage
    .from("videos")
    .createSignedUploadUrl(storagePath);

  return NextResponse.json({
    videoId: video?.id,
    uploadUrl: uploadData?.signedUrl,
    storagePath,
  });
}
```

**Step 3: Create video upload component**

A client component with:
- File input (accept `video/*`)
- Audience selection (checkboxes: "Developers", "End Users", "AI Agents")
- Title input
- Upload progress bar
- Uploads directly to Supabase Storage via the presigned URL
- After upload completes, calls the processing API (Task 9)

**Step 4: Create project detail page**

Shows project name, list of videos with their status, and the upload component. Each video links to its generated articles.

**Step 5: Verify upload flow**

Upload a small test video, verify it appears in Supabase Storage.

**Step 6: Commit**

```bash
git add src/app/\(dashboard\)/project/ src/app/api/videos/ src/components/video-upload.tsx src/lib/queries/videos.ts
git commit -m "feat: add project detail page with video upload"
```

---

## Task 9: Video Processing Pipeline (Gemini)

**Files:**
- Create: `src/lib/ai/gemini.ts`
- Create: `src/lib/ai/prompts.ts`
- Create: `src/app/api/videos/process/route.ts`

**Step 1: Create Gemini client wrapper**

```typescript
// src/lib/ai/gemini.ts
import { GoogleGenAI, createUserContent, createPartFromUri } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function uploadAndProcessVideo(videoUrl: string) {
  // Upload video to Gemini Files API
  const uploadResponse = await ai.files.upload({
    file: videoUrl,
    config: { mimeType: "video/mp4" },
  });

  // Wait for processing
  let fileInfo = await ai.files.get({ name: uploadResponse.name! });
  while (fileInfo.state === "PROCESSING") {
    await new Promise((r) => setTimeout(r, 5000));
    fileInfo = await ai.files.get({ name: uploadResponse.name! });
  }

  if (fileInfo.state === "FAILED") {
    throw new Error("Gemini video processing failed");
  }

  return fileInfo;
}

export async function extractVideoContent(fileUri: string, fileMimeType: string) {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: createUserContent([
      createPartFromUri(fileUri, fileMimeType),
      `Analyze this video and return a JSON array of segments. Each segment should cover a logical section of the video (30-120 seconds each).

For each segment provide:
- "start_time": start in seconds (number)
- "end_time": end in seconds (number)
- "spoken_content": what is being said (transcription)
- "visual_context": what is visually happening on screen (UI elements, code, clicks, navigation)
- "topic": a short title for this segment

Return ONLY valid JSON, no markdown fences.`,
    ]),
    config: {
      responseMimeType: "application/json",
    },
  });

  return JSON.parse(response.text!);
}
```

**Step 2: Create audience-specific prompts**

```typescript
// src/lib/ai/prompts.ts
export function getDocGenerationPrompt(audience: string, segments: any[]) {
  const audienceInstructions: Record<string, string> = {
    developers: `Write for software developers. Include technical details, API references, code snippets, and configuration. Be precise and concise. Use technical terminology freely.`,
    "end-users": `Write for non-technical end users. Focus on what they can do, not how it works internally. Use simple language, step-by-step instructions, and reference UI elements by name.`,
    "ai-agents": `Write for LLM consumption (AI coding assistants, agents, RAG systems). Optimize for token efficiency and machine parsing:
- No filler words, no conversational tone, no redundancy
- Use structured formats: tables for parameters, typed signatures for APIs, enums for options
- Every code snippet must be complete and copy-pasteable
- Include explicit error codes, edge cases, and version/compatibility notes
- Use consistent heading hierarchy for reliable section extraction
- Prefer lists and key-value pairs over prose paragraphs`,
  };

  const instruction = audienceInstructions[audience] ?? audienceInstructions.developers;

  return `You are a technical writer creating documentation from a product video.

Target audience: ${audience}
${instruction}

Video segments (with timestamps and visual context):
${JSON.stringify(segments, null, 2)}

Generate a structured documentation article in JSON format:
{
  "title": "Article title",
  "chapters": [
    {
      "title": "Chapter title",
      "sections": [
        {
          "heading": "Section heading",
          "content": "Markdown content with video timestamp references like [video:MM:SS]",
          "timestamp_ref": "MM:SS"
        }
      ]
    }
  ]
}

Rules:
- Reference specific video timestamps using [video:MM:SS] format
- Each section should be self-contained and readable
- Group related content into chapters
- Include code snippets for developer audience where relevant
- Return ONLY valid JSON, no markdown fences.`;
}
```

**Step 3: Create processing API route**

```typescript
// src/app/api/videos/process/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { uploadAndProcessVideo, extractVideoContent } from "@/lib/ai/gemini";
import { getDocGenerationPrompt } from "@/lib/ai/prompts";
import { GoogleGenAI } from "@google/genai";
import slugify from "slugify";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function POST(request: Request) {
  const supabase = await createClient();
  const { videoId, audiences } = await request.json();

  // Get video record
  const { data: video } = await supabase
    .from("videos")
    .select("*, projects(*)")
    .eq("id", videoId)
    .single();

  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Update status to processing
  await supabase.from("videos").update({ status: "processing" }).eq("id", videoId);

  try {
    // Get signed URL for the video file
    const { data: urlData } = await supabase.storage
      .from("videos")
      .createSignedUrl(video.storage_path, 3600);

    // Step 1: Upload to Gemini and extract content
    const fileInfo = await uploadAndProcessVideo(urlData!.signedUrl);
    const segments = await extractVideoContent(fileInfo.uri!, fileInfo.mimeType!);

    // Save segments
    const segmentRows = segments.map((seg: any, i: number) => ({
      video_id: videoId,
      start_time: seg.start_time,
      end_time: seg.end_time,
      spoken_content: seg.spoken_content,
      visual_context: seg.visual_context,
      order: i,
    }));
    await supabase.from("video_segments").insert(segmentRows);

    // Step 2: Generate docs for each audience
    for (const audience of audiences) {
      const prompt = getDocGenerationPrompt(audience, segments);

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json" },
      });

      const doc = JSON.parse(response.text!);

      // Create chapter and article records
      for (const chapter of doc.chapters) {
        const { data: chapterRow } = await supabase
          .from("chapters")
          .upsert({
            project_id: video.project_id,
            title: chapter.title,
            slug: slugify(chapter.title, { lower: true, strict: true }),
          }, { onConflict: "project_id,slug" })
          .select()
          .single();

        // Combine sections into Tiptap-compatible JSON and plain text
        const contentText = chapter.sections.map((s: any) => `${s.heading}\n${s.content}`).join("\n\n");

        await supabase.from("articles").insert({
          project_id: video.project_id,
          video_id: videoId,
          chapter_id: chapterRow?.id,
          title: chapter.title,
          slug: slugify(chapter.title, { lower: true, strict: true }),
          audience,
          content_json: buildTiptapJson(chapter.sections),
          content_text: contentText,
          status: "draft",
        });
      }
    }

    // Mark video as ready
    await supabase.from("videos").update({ status: "ready" }).eq("id", videoId);

    return NextResponse.json({ success: true });
  } catch (error) {
    await supabase.from("videos").update({ status: "failed" }).eq("id", videoId);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

// Convert sections into basic Tiptap JSON structure
function buildTiptapJson(sections: any[]) {
  const content: any[] = [];
  for (const section of sections) {
    content.push({
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: section.heading }],
    });
    // Split content by paragraphs
    const paragraphs = section.content.split("\n\n");
    for (const para of paragraphs) {
      content.push({
        type: "paragraph",
        content: [{ type: "text", text: para }],
      });
    }
  }
  return { type: "doc", content };
}
```

**Step 4: Test with a real video**

Upload a short (1-2 min) screen recording and trigger processing. Verify:
- Segments are saved to `video_segments`
- Articles are created for each audience
- Video status transitions: `uploading` → `processing` → `ready`

**Step 5: Commit**

```bash
git add src/lib/ai/ src/app/api/videos/process/
git commit -m "feat: add video processing pipeline with gemini and doc generation"
```

---

## Task 10: Tiptap Editor Setup

**Files:**
- Create: `src/editor/editor.tsx`
- Create: `src/editor/extensions/timestamp-link.ts`
- Create: `src/editor/extensions/callout.ts`
- Create: `src/editor/toolbar.tsx`

**Step 1: Create the base Tiptap editor component**

```typescript
// src/editor/editor.tsx
"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { TimestampLink } from "./extensions/timestamp-link";
import { Callout } from "./extensions/callout";
import { Toolbar } from "./toolbar";

interface EditorProps {
  content: any; // Tiptap JSON
  onUpdate: (json: any) => void;
  onTimestampClick?: (seconds: number) => void;
}

export function Editor({ content, onUpdate, onTimestampClick }: EditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
      }),
      Image,
      Placeholder.configure({ placeholder: "Start writing..." }),
      TimestampLink.configure({ onTimestampClick }),
      Callout,
    ],
    content,
    onUpdate: ({ editor }) => {
      onUpdate(editor.getJSON());
    },
  });

  if (!editor) return null;

  return (
    <div className="border rounded-lg">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} className="prose prose-sm max-w-none p-4" />
    </div>
  );
}
```

**Step 2: Create timestamp link extension**

A custom Tiptap node that renders as an inline badge `▶ 2:34`. Stores `seconds` as an attribute. On click, calls `onTimestampClick(seconds)`.

**Step 3: Create callout block extension**

A custom Tiptap node for info/warning/tip callouts. Renders with an icon and colored background matching Mintlify style.

**Step 4: Create toolbar component**

A horizontal bar with buttons for: bold, italic, headings dropdown, bullet list, ordered list, code block, image upload, timestamp insert, callout insert. Use shadcn `Button` and `Tooltip` components.

**Step 5: Verify editor renders**

Create a test page that loads the editor with sample Tiptap JSON. Verify formatting, toolbar actions, and timestamp badges work.

**Step 6: Commit**

```bash
git add src/editor/
git commit -m "feat: add tiptap editor with toolbar, timestamp links, and callouts"
```

---

## Task 11: Article Editor Page

**Files:**
- Create: `src/app/(dashboard)/project/[slug]/article/[articleSlug]/edit/page.tsx`
- Create: `src/lib/queries/articles.ts`
- Create: `src/components/video-player.tsx`

**Step 1: Create article queries**

```typescript
// src/lib/queries/articles.ts
import { createClient } from "@/lib/supabase/server";

export async function getArticle(projectSlug: string, articleSlug: string, audience: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("articles")
    .select("*, projects!inner(*), videos(*)")
    .eq("projects.slug", projectSlug)
    .eq("slug", articleSlug)
    .eq("audience", audience)
    .single();

  return data;
}

export async function updateArticle(id: string, contentJson: any, contentText: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("articles")
    .update({ content_json: contentJson, content_text: contentText })
    .eq("id", id);

  if (error) throw error;
}

export async function publishArticle(id: string) {
  const supabase = await createClient();
  await supabase.from("articles").update({ status: "published" }).eq("id", id);
}
```

**Step 2: Create video player component**

A client component wrapping an HTML5 `<video>` element with:
- `ref` exposed for seeking (`player.currentTime = seconds`)
- VTT subtitle track
- Play/pause, seek bar, time display
- `seekTo(seconds)` method called when timestamp links are clicked in the editor

**Step 3: Create editor page layout**

Three-panel layout:
- Left: document outline (headings extracted from Tiptap JSON, clickable to scroll)
- Center: the Tiptap `Editor` component
- Right: the `VideoPlayer` component with VTT transcript below it

Top bar: Save button, Publish/Unpublish toggle, Preview button.

**Step 4: Wire up save/publish**

- Save: POST the Tiptap JSON to a server action that calls `updateArticle`
- Publish: calls `publishArticle`
- Auto-extract `content_text` from Tiptap JSON for search indexing (strip formatting, concatenate text nodes)

**Step 5: Verify end-to-end editor flow**

Process a video, open the generated article in the editor, make changes, save, verify JSON is persisted.

**Step 6: Commit**

```bash
git add src/app/\(dashboard\)/project/\[slug\]/article/ src/lib/queries/articles.ts src/components/video-player.tsx
git commit -m "feat: add article editor page with video player and save/publish"
```

---

## Task 12: Public Docs Site (Reader View)

**Files:**
- Create: `src/app/(docs)/[projectSlug]/layout.tsx`
- Create: `src/app/(docs)/[projectSlug]/page.tsx`
- Create: `src/app/(docs)/[projectSlug]/[articleSlug]/page.tsx`
- Create: `src/components/docs/sidebar.tsx`
- Create: `src/components/docs/toc.tsx`
- Create: `src/components/docs/article-renderer.tsx`

**Step 1: Create docs layout (three-column Mintlify style)**

```typescript
// src/app/(docs)/[projectSlug]/layout.tsx
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/docs/sidebar";
import { notFound } from "next/navigation";

export default async function DocsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { projectSlug: string };
}) {
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("*, chapters(*, articles(id, title, slug, audience, status))")
    .eq("slug", params.projectSlug)
    .eq("is_public", true)
    .single();

  if (!project) notFound();

  return (
    <div className="flex min-h-screen">
      <Sidebar project={project} chapters={project.chapters} />
      <div className="flex-1">{children}</div>
    </div>
  );
}
```

**Step 2: Create sidebar component**

Left sidebar showing:
- Project name at top
- Audience switcher dropdown
- Chapter groups, each expandable to show article links
- Active article highlighted
- Collapsible on mobile (sheet/drawer)

**Step 3: Create table of contents component**

Right sidebar showing:
- Headings extracted from article content
- Highlights active heading on scroll (IntersectionObserver)
- Sticky positioning

**Step 4: Create article renderer**

Converts Tiptap JSON to React components:
- Renders headings with anchor IDs (for TOC linking)
- Renders timestamp links as clickable `▶ MM:SS` badges
- Renders callout blocks with styled boxes
- Renders code blocks with syntax highlighting

**Step 5: Create article page**

```typescript
// src/app/(docs)/[projectSlug]/[articleSlug]/page.tsx
import { createClient } from "@/lib/supabase/server";
import { ArticleRenderer } from "@/components/docs/article-renderer";
import { Toc } from "@/components/docs/toc";
import { VideoPlayer } from "@/components/video-player";
import { notFound } from "next/navigation";

export default async function ArticlePage({
  params,
  searchParams,
}: {
  params: { projectSlug: string; articleSlug: string };
  searchParams: { audience?: string };
}) {
  const audience = searchParams.audience ?? "developers";
  const supabase = await createClient();

  const { data: article } = await supabase
    .from("articles")
    .select("*, videos(*), projects!inner(*)")
    .eq("projects.slug", params.projectSlug)
    .eq("slug", params.articleSlug)
    .eq("audience", audience)
    .eq("status", "published")
    .single();

  if (!article) notFound();

  return (
    <div className="flex">
      <article className="flex-1 max-w-3xl mx-auto px-8 py-12">
        {article.videos && <VideoPlayer video={article.videos} />}
        <h1 className="text-3xl font-bold mt-8 mb-4">{article.title}</h1>
        <ArticleRenderer content={article.content_json} />
      </article>
      <Toc content={article.content_json} />
    </div>
  );
}
```

**Step 6: Verify public docs render**

Publish an article, visit `http://localhost:3000/<project-slug>/<article-slug>`. Verify three-column layout, sidebar navigation, TOC, and video player all work.

**Step 7: Commit**

```bash
git add src/app/\(docs\)/ src/components/docs/
git commit -m "feat: add public docs site with mintlify-style three-column layout"
```

---

## Task 13: Search (Full-Text + LLM Answers)

**Files:**
- Create: `src/app/api/search/route.ts`
- Create: `src/app/api/search/answer/route.ts`
- Create: `src/components/docs/search-dialog.tsx`

**Step 1: Create full-text search API**

```typescript
// src/app/api/search/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const projectId = searchParams.get("projectId");
  const audience = searchParams.get("audience");

  if (!query || !projectId) {
    return NextResponse.json({ results: [] });
  }

  const supabase = await createClient();

  // Search articles using full-text search
  let articlesQuery = supabase
    .from("articles")
    .select("id, title, slug, audience, content_text, project_id")
    .eq("project_id", projectId)
    .eq("status", "published")
    .textSearch("fts", query, { type: "websearch" })
    .limit(10);

  if (audience) {
    articlesQuery = articlesQuery.eq("audience", audience);
  }

  const { data: articles } = await articlesQuery;

  // Also search video transcripts
  const { data: videos } = await supabase
    .from("videos")
    .select("id, title, vtt_content, project_id")
    .eq("project_id", projectId)
    .textSearch("fts", query, { type: "websearch" })
    .limit(5);

  return NextResponse.json({
    articles: articles ?? [],
    videos: videos ?? [],
  });
}
```

**Step 2: Create LLM answer synthesis API**

```typescript
// src/app/api/search/answer/route.ts
import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function POST(request: Request) {
  const { query, articles } = await request.json();

  const context = articles
    .map((a: any) => `### ${a.title} (${a.audience})\n${a.content_text.slice(0, 1000)}`)
    .join("\n\n");

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Based on the following documentation, answer this question concisely: "${query}"

${context}

If you reference a specific article, mention its title. If you reference a video timestamp, include it as [video:MM:SS]. Keep your answer to 2-3 sentences.`,
          },
        ],
      },
    ],
  });

  return NextResponse.json({ answer: response.text });
}
```

**Step 3: Create search dialog component**

A Cmd+K modal using shadcn `Command` component:
- Text input with keyboard shortcut listener
- Debounced search (300ms) calling the search API
- Results list with article title, snippet, audience badge
- "AI Answer" card at the top (loads asynchronously after results)
- Optional audience filter tabs
- Clicking a result navigates to the article

**Step 4: Add search dialog to docs layout**

Add the search dialog to the docs layout so it's accessible on every page.

**Step 5: Verify search works**

Publish a few articles, search for terms that appear in them. Verify results appear and the LLM answer card shows.

**Step 6: Commit**

```bash
git add src/app/api/search/ src/components/docs/search-dialog.tsx
git commit -m "feat: add full-text search with llm answer synthesis"
```

---

## Task 14: Processing Status UI

**Files:**
- Create: `src/components/processing-status.tsx`
- Modify: `src/app/api/videos/process/route.ts` (add SSE support)

**Step 1: Add SSE to processing route**

Modify the processing API to stream status updates as Server-Sent Events. Each step sends an event:
- `{ step: "transcribing", progress: 0.2 }`
- `{ step: "analyzing_visuals", progress: 0.4 }`
- `{ step: "generating_docs", audience: "developers", progress: 0.6 }`
- `{ step: "generating_docs", audience: "end-users", progress: 0.8 }`
- `{ step: "complete", progress: 1.0 }`

**Step 2: Create processing status component**

A card showing:
- Current step as text ("Transcribing video...")
- Progress bar
- Animated spinner
- Checkmarks for completed steps
- Links to generated articles when complete

**Step 3: Add to video upload flow**

After upload completes, show the processing status component. It connects to the SSE endpoint and updates in real-time.

**Step 4: Verify the status UI**

Upload a video and watch the processing steps animate through.

**Step 5: Commit**

```bash
git add src/components/processing-status.tsx src/app/api/videos/process/
git commit -m "feat: add real-time processing status with SSE"
```

---

## Task 15: llms.txt Generation & Context7 Integration

**Files:**
- Create: `src/lib/llms-txt.ts`
- Create: `src/app/(docs)/[projectSlug]/llms.txt/route.ts`
- Create: `src/app/(docs)/[projectSlug]/llms-full.txt/route.ts`
- Create: `src/app/api/context7/publish/route.ts`
- Modify: `src/app/(dashboard)/project/[slug]/page.tsx` (add Context7 settings)

**Step 1: Create llms.txt generator**

```typescript
// src/lib/llms-txt.ts
import { createClient } from "@/lib/supabase/server";

export async function generateLlmsTxt(projectSlug: string) {
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("*, chapters(*, articles(id, title, slug, audience, status, content_text))")
    .eq("slug", projectSlug)
    .eq("is_public", true)
    .single();

  if (!project) return null;

  // Filter to published AI Agents articles
  const chapters = project.chapters
    .map((ch: any) => ({
      ...ch,
      articles: ch.articles.filter(
        (a: any) => a.audience === "ai-agents" && a.status === "published"
      ),
    }))
    .filter((ch: any) => ch.articles.length > 0);

  // Generate llms.txt (navigation only)
  const lines = [`# ${project.name}\n`];
  lines.push(`> Documentation for ${project.name}, optimized for LLM consumption.\n`);

  for (const chapter of chapters) {
    lines.push(`## ${chapter.title}`);
    for (const article of chapter.articles) {
      const url = `/${projectSlug}/${article.slug}?audience=ai-agents`;
      lines.push(`- [${article.title}](${url}): ${article.content_text.slice(0, 120)}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export async function generateLlmsFullTxt(projectSlug: string) {
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("*, chapters(*, articles(id, title, slug, audience, status, content_text))")
    .eq("slug", projectSlug)
    .eq("is_public", true)
    .single();

  if (!project) return null;

  const chapters = project.chapters
    .map((ch: any) => ({
      ...ch,
      articles: ch.articles.filter(
        (a: any) => a.audience === "ai-agents" && a.status === "published"
      ),
    }))
    .filter((ch: any) => ch.articles.length > 0);

  // Generate llms-full.txt (complete content)
  const lines = [`# ${project.name}\n`];
  lines.push(`> Complete documentation for ${project.name}.\n`);

  for (const chapter of chapters) {
    lines.push(`## ${chapter.title}\n`);
    for (const article of chapter.articles) {
      lines.push(`### ${article.title}\n`);
      lines.push(article.content_text);
      lines.push("");
    }
  }

  return lines.join("\n");
}
```

**Step 2: Create llms.txt route**

```typescript
// src/app/(docs)/[projectSlug]/llms.txt/route.ts
import { generateLlmsTxt } from "@/lib/llms-txt";
import { NextResponse } from "next/server";

export async function GET(_: Request, { params }: { params: { projectSlug: string } }) {
  const content = await generateLlmsTxt(params.projectSlug);
  if (!content) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(content, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
```

**Step 3: Create llms-full.txt route**

Same pattern as above but calls `generateLlmsFullTxt`. Serves at `/<projectSlug>/llms-full.txt`.

**Step 4: Auto-regenerate on publish**

Modify the `publishArticle` function in `src/lib/queries/articles.ts`. After publishing an article with `audience === "ai-agents"`, trigger regeneration of the cached llms.txt files. For MVP, generate on each request (no caching needed yet — these are small text files).

**Step 5: Add Context7 publish API route**

```typescript
// src/app/api/context7/publish/route.ts
import { NextResponse } from "next/server";
import { generateLlmsFullTxt } from "@/lib/llms-txt";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { projectSlug } = await request.json();
  const supabase = await createClient();

  // Verify user owns the project
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, slug")
    .eq("slug", projectSlug)
    .single();

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Generate the full docs content
  const content = await generateLlmsFullTxt(projectSlug);
  if (!content) return NextResponse.json({ error: "No AI Agents docs published" }, { status: 400 });

  // Push to Context7 via their API
  // Context7 uses a GitHub Action (rennf93/upsert-context7@v1) for publishing.
  // For in-app push, we trigger the same underlying API.
  // The user can also set up the GitHub Action in their repo for automatic syncing.

  // For MVP: generate a downloadable llms-full.txt that the user can commit to their repo,
  // which triggers the Context7 GitHub Action automatically.
  // Future: direct API integration with Context7.

  return NextResponse.json({
    success: true,
    content,
    instructions: "Add this content to your repo as llms-full.txt and set up the upsert-context7 GitHub Action for automatic syncing.",
  });
}
```

**Step 6: Add Context7 section to project settings**

Add a card in the project detail page with:
- "Publish to Context7" button that calls the API and downloads/copies the llms-full.txt
- Instructions for setting up the GitHub Action for automatic syncing
- Display Context7 library ID if configured

**Step 7: Verify llms.txt endpoints**

1. Publish at least one article with "AI Agents" audience
2. Visit `http://localhost:3000/<project-slug>/llms.txt` — should return markdown navigation
3. Visit `http://localhost:3000/<project-slug>/llms-full.txt` — should return full content
4. Test the Context7 publish flow

**Step 8: Commit**

```bash
git add src/lib/llms-txt.ts src/app/\(docs\)/\[projectSlug\]/llms.txt/ src/app/\(docs\)/\[projectSlug\]/llms-full.txt/ src/app/api/context7/
git commit -m "feat: add llms.txt generation and context7 integration for ai agents audience"
```

---

## Task 16: Polish & Typography

**Files:**
- Modify: `src/app/globals.css` (add Mintlify-like typography)
- Modify: `src/app/(docs)/[projectSlug]/layout.tsx` (refine spacing)
- Modify: `src/components/docs/article-renderer.tsx` (prose styling)

**Step 1: Add typography styles**

Add Tailwind typography plugin if not already included. Configure prose styles to match Mintlify:
- Clean sans-serif font
- Generous line height (1.75)
- Proper heading hierarchy with spacing
- Code blocks with rounded corners and subtle background
- Callout blocks with left border and icon

**Step 2: Refine docs layout spacing**

- Left sidebar: 260px wide, border-right, sticky top
- Content area: max-width 720px, centered
- Right TOC: 200px wide, sticky top with offset for header

**Step 3: Add responsive breakpoints**

- Desktop: three columns
- Tablet: hide right TOC
- Mobile: collapsible left sidebar (sheet), hide right TOC

**Step 4: Verify visual quality**

Compare side-by-side with Mintlify. Ensure typography, spacing, and colors feel professional.

**Step 5: Commit**

```bash
git add src/app/globals.css src/app/\(docs\)/ src/components/docs/
git commit -m "feat: polish docs site with mintlify-style typography and responsive layout"
```

---

## Task 17: End-to-End Smoke Test

**Step 1: Full workflow test**

Run through the complete workflow:
1. Start the app (`npm run dev`)
2. Sign up a new account
3. Create a project
4. Upload a video (2-3 min screen recording)
5. Select "Developers", "End Users", and "AI Agents" audiences
6. Watch processing complete
7. Open generated developer article in editor
8. Make a small edit, save
9. Publish the article (all three audiences)
10. View the article on the public docs site
11. Use Cmd+K search to find content
12. Switch audience view
13. Click a video timestamp badge
14. Visit `/<project-slug>/llms.txt` — verify LLM-optimized navigation renders
15. Visit `/<project-slug>/llms-full.txt` — verify full AI Agents content renders
16. Test Context7 publish flow

**Step 2: Fix any issues found**

Address bugs, styling issues, or broken flows discovered during the smoke test.

**Step 3: Commit any fixes**

```bash
git add .
git commit -m "fix: address issues found during end-to-end smoke test"
```

---

## Task 18: Multi-Language Support

> **Addendum — added during implementation.** Observation: Gemini natively handles cross-language video analysis (e.g. German speech → English docs) with high quality. This makes multi-language doc generation a natural extension.

**Files:**
- Modify: `supabase/migrations/` (new migration for `language` column)
- Modify: `lib/ai/prompts.ts` (add translation prompt)
- Create: `lib/ai/translate.ts`
- Modify: `app/api/videos/process/route.ts` (generate per-language variants)
- Modify: `components/video-upload.tsx` (language selection UI)
- Modify: `components/docs/sidebar.tsx` (language switcher)
- Create: `lib/vtt.ts` (VTT generation + translation)

**Step 1: Schema migration — add `language` column**

```sql
-- Add language to articles
alter table articles add column language text not null default 'en';

-- Update unique constraint to include language
alter table articles drop constraint articles_project_id_audience_slug_key;
alter table articles add constraint articles_project_id_audience_language_slug_key
  unique (project_id, audience, language, slug);

-- Add VTT storage per language on videos
alter table videos add column vtt_languages jsonb not null default '{}';
-- Format: { "en": "WEBVTT\n00:00...", "de": "WEBVTT\n00:00..." }
```

**Step 2: VTT generation during video processing**

During the Gemini extraction step, we already get `spoken_content` with timestamps per segment. Use this to:
1. Generate a VTT file in the source language (detected from video)
2. Store as `vtt_content` on the video record
3. Store structured VTT in `vtt_languages` JSON field

```typescript
// lib/vtt.ts
export function segmentsToVtt(segments: { start_time: number; end_time: number; spoken_content: string }[]): string {
  let vtt = "WEBVTT\n\n";
  for (const seg of segments) {
    vtt += `${formatTime(seg.start_time)} --> ${formatTime(seg.end_time)}\n`;
    vtt += `${seg.spoken_content}\n\n`;
  }
  return vtt;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}
```

**Step 3: Translation pipeline**

After generating docs in the primary language:
1. For each additional target language, send the article `content_text` to an LLM with a translation prompt
2. Create a new article row with the same `audience` + `slug` but different `language`
3. Translate the VTT file similarly (preserving timestamps, translating only the text cues)

```typescript
// lib/ai/translate.ts
export function getTranslationPrompt(targetLanguage: string, content: string) {
  return `Translate the following documentation to ${targetLanguage}.
Preserve all formatting, code snippets, [video:MM:SS] timestamp references, and technical terms.
Only translate the natural language text.

${content}`;
}
```

**Step 4: Video upload UI — language selection**

Add to the upload form:
- **Source language** (auto-detected, but user can override): dropdown with common languages
- **Target languages** (multi-select checkboxes): which languages to generate docs in
- Default: source language only. User can add more.

**Step 5: Docs site — language switcher**

Add a language dropdown to the docs sidebar (alongside the audience switcher):
- Shows available languages for the current project
- Switching language reloads the article in the selected language
- Falls back to primary language if a specific article isn't translated yet
- URL pattern: `/<project>/<article>?audience=developers&lang=de`

**Step 6: Video player — multi-language subtitles**

- Load VTT tracks for all available languages
- Add a subtitle language selector on the video player
- Default to the current docs language

**Step 7: llms.txt — per-language generation**

- `/<project>/llms.txt?lang=en` and `/<project>/llms-full.txt?lang=de`
- Default (no param) serves the primary language

---

## Summary

| Task | Description | Depends On |
|------|-------------|------------|
| 1 | Project scaffolding | — |
| 2 | Supabase client utilities | 1 |
| 3 | Database schema migration | 1 |
| 4 | RLS policies | 3 |
| 5 | Storage bucket | 3 |
| 6 | Auth pages (login/signup) | 2 |
| 7 | Dashboard & project CRUD | 2, 3, 6 |
| 8 | Project detail & video upload | 5, 7 |
| 9 | Video processing pipeline (Gemini) | 3, 8 |
| 10 | Tiptap editor setup | 1 |
| 11 | Article editor page | 9, 10 |
| 12 | Public docs site (reader view) | 9 |
| 13 | Search (full-text + LLM) | 12 |
| 14 | Processing status UI | 9 |
| 15 | llms.txt generation & Context7 integration | 12 |
| 16 | Polish & typography | 12 |
| 17 | End-to-end smoke test | all (1-16) |
| 18 | Multi-language support | 17 |
