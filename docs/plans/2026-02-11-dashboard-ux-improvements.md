# Dashboard & UX Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the dashboard to a proper shadcn sidebar layout, add folder-like article navigation with reordering, fix the article 404 bug, improve video upload UX, add filters/delete/breadcrumbs, and polish the public docs view with better audience/language switching and scroll-tracked TOC.

**Architecture:** Incremental refactor of the existing Next.js 16 App Router app. Dashboard gets a shadcn sidebar shell. Article management gets a tree view matching the public docs structure. Public docs get polished switchers and breadcrumbs. All changes build on existing Supabase queries and shadcn/ui components.

**Tech Stack:** Next.js 16, shadcn/ui (sidebar, breadcrumb, select, tabs, collapsible, popover, scroll-area, alert-dialog), Tailwind CSS, Supabase, @hello-pangea/dnd (drag-and-drop reordering)

**Prior plan:** `docs/plans/2026-02-09-vidtodoc-implementation.md`

---

## Task 1: Fix Article 404 Bug

**Problem:** The article edit link from the project page passes `?audience=X` but NOT `?lang=Y`. The unique constraint on articles is `(project_id, audience, language, slug)`. When multi-language articles exist, the editor query returns multiple rows, `.single()` fails, and `notFound()` fires.

**Files:**
- Modify: `app/(dashboard)/project/[slug]/page.tsx:76-79` (add language to link)
- Modify: `app/(dashboard)/project/[slug]/article/[articleSlug]/edit/page.tsx:11-22` (add language filter to query)

**Step 1: Add language to article edit links**

In `app/(dashboard)/project/[slug]/page.tsx`, the article query needs to also select `language`, and the link needs `&lang=`:

```typescript
// Change the articles query (line 29-32) to include language:
const { data: articles } = await supabase
  .from("articles")
  .select("id, title, slug, audience, language, status")
  .eq("project_id", project.id)
  .order("created_at", { ascending: false });
```

```typescript
// Change the Link href (line 78) to include language:
href={`/project/${slug}/article/${article.slug}/edit?audience=${article.audience}&lang=${article.language}`}
```

**Step 2: Add language filter to editor page query**

In `app/(dashboard)/project/[slug]/article/[articleSlug]/edit/page.tsx`:

```typescript
export default async function ArticleEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; articleSlug: string }>;
  searchParams: Promise<{ audience?: string; lang?: string }>;
}) {
  const { slug, articleSlug } = await params;
  const { audience = "developers", lang = "en" } = await searchParams;
  const supabase = await createClient();

  const { data: article } = await supabase
    .from("articles")
    .select("*, projects!inner(*), videos(*)")
    .eq("projects.slug", slug)
    .eq("slug", articleSlug)
    .eq("audience", audience)
    .eq("language", lang)
    .single();
```

**Step 3: Verify the fix**

Run: `npm run dev`
Navigate to a project with multi-language articles, click any article. Expected: Editor loads instead of 404.

**Step 4: Commit**

```bash
git add app/\(dashboard\)/project/\[slug\]/page.tsx app/\(dashboard\)/project/\[slug\]/article/\[articleSlug\]/edit/page.tsx
git commit -m "fix: resolve article 404 by including language param in edit links and query"
```

---

## Task 2: Install Additional shadcn Components

**Files:**
- Modify: `components/ui/` (new component files added by shadcn CLI)

**Step 1: Add shadcn sidebar, breadcrumb, tabs, select, scroll-area, collapsible, alert-dialog, popover, progress, skeleton**

```bash
cd /Users/Tim/Documents/Respeak_Experiments/vidtodoc
npx shadcn@latest add sidebar breadcrumb tabs select scroll-area collapsible alert-dialog popover progress skeleton
```

**Step 2: Install drag-and-drop library**

```bash
npm install @hello-pangea/dnd
```

**Step 3: Verify build passes**

```bash
npm run build
```

Expected: Build succeeds.

**Step 4: Commit**

```bash
git add components/ui/ package.json package-lock.json
git commit -m "chore: add shadcn sidebar, breadcrumb, tabs, select and dnd library"
```

---

## Task 3: Dashboard Shell Redesign

Replace the current top-bar-only layout with a proper shadcn sidebar dashboard. Left sidebar has: project switcher at top, nav items in middle, user account at bottom.

**Files:**
- Create: `components/dashboard/app-sidebar.tsx`
- Create: `components/dashboard/project-switcher.tsx`
- Create: `components/dashboard/user-nav.tsx`
- Create: `components/dashboard/breadcrumb-nav.tsx`
- Modify: `app/(dashboard)/layout.tsx` (replace with sidebar shell)
- Modify: `lib/queries/projects.ts` (add getProject helper)

**Step 1: Add getProject query helper**

In `lib/queries/projects.ts`, add:

```typescript
export async function getProject(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("*")
    .eq("slug", slug)
    .single();
  return data;
}
```

**Step 2: Create the project switcher component**

```typescript
// components/dashboard/project-switcher.tsx
"use client";

import { useRouter, useParams } from "next/navigation";
import { ChevronsUpDown, Plus, FolderOpen } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

interface Project {
  id: string;
  name: string;
  slug: string;
}

export function ProjectSwitcher({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const params = useParams();
  const currentSlug = params.slug as string | undefined;
  const currentProject = projects.find((p) => p.slug === currentSlug);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="w-full">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <FolderOpen className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">
                  {currentProject?.name ?? "Select project"}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {currentProject ? `/${currentProject.slug}` : "No project selected"}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] min-w-56" align="start">
            <DropdownMenuLabel>Projects</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {projects.map((project) => (
              <DropdownMenuItem
                key={project.id}
                onClick={() => router.push(`/project/${project.slug}`)}
              >
                <FolderOpen className="mr-2 size-4" />
                {project.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/dashboard")}>
              <Plus className="mr-2 size-4" />
              New project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
```

**Step 3: Create the user nav component**

```typescript
// components/dashboard/user-nav.tsx
"use client";

import { useRouter } from "next/navigation";
import { LogOut, Settings, ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface UserNavProps {
  email: string;
}

export function UserNav({ email }: UserNavProps) {
  const router = useRouter();
  const initials = email.slice(0, 2).toUpperCase();

  async function handleSignOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/login");
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="w-full">
              <Avatar className="size-8">
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] min-w-56" align="start" side="top">
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              <Settings className="mr-2 size-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="mr-2 size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
```

**Step 4: Create the app sidebar component**

```typescript
// components/dashboard/app-sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileText, Upload, Settings, Globe } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { ProjectSwitcher } from "./project-switcher";
import { UserNav } from "./user-nav";

interface Project {
  id: string;
  name: string;
  slug: string;
}

interface AppSidebarProps {
  projects: Project[];
  userEmail: string;
  currentProjectSlug?: string;
}

export function AppSidebar({ projects, userEmail, currentProjectSlug }: AppSidebarProps) {
  const pathname = usePathname();

  const projectNav = currentProjectSlug
    ? [
        {
          title: "Overview",
          href: `/project/${currentProjectSlug}`,
          icon: LayoutDashboard,
        },
        {
          title: "Articles",
          href: `/project/${currentProjectSlug}/articles`,
          icon: FileText,
        },
        {
          title: "Upload Video",
          href: `/project/${currentProjectSlug}/upload`,
          icon: Upload,
        },
        {
          title: "Public Site",
          href: `/${currentProjectSlug}`,
          icon: Globe,
          external: true,
        },
        {
          title: "Settings",
          href: `/project/${currentProjectSlug}/settings`,
          icon: Settings,
        },
      ]
    : [];

  return (
    <Sidebar>
      <SidebarHeader>
        <ProjectSwitcher projects={projects} />
      </SidebarHeader>

      <SidebarContent>
        {currentProjectSlug && (
          <SidebarGroup>
            <SidebarGroupLabel>Project</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {projectNav.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === item.href || pathname.startsWith(item.href + "/")}
                    >
                      <Link
                        href={item.href}
                        target={item.external ? "_blank" : undefined}
                      >
                        <item.icon className="size-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {!currentProjectSlug && (
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === "/dashboard"}>
                    <Link href="/dashboard">
                      <LayoutDashboard className="size-4" />
                      <span>All Projects</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <UserNav email={userEmail} />
      </SidebarFooter>
    </Sidebar>
  );
}
```

**Step 5: Create breadcrumb nav component**

```typescript
// components/dashboard/breadcrumb-nav.tsx
"use client";

import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Fragment } from "react";

interface BreadcrumbNavProps {
  projectName?: string;
  projectSlug?: string;
  items?: { label: string; href?: string }[];
}

export function BreadcrumbNav({ projectName, projectSlug, items = [] }: BreadcrumbNavProps) {
  const crumbs = [
    { label: "Dashboard", href: "/dashboard" },
    ...(projectName && projectSlug
      ? [{ label: projectName, href: `/project/${projectSlug}` }]
      : []),
    ...items,
  ];

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          {crumbs.map((crumb, i) => (
            <Fragment key={i}>
              {i > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {i === crumbs.length - 1 ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink href={crumb.href}>{crumb.label}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  );
}
```

**Step 6: Rewrite the dashboard layout**

Replace `app/(dashboard)/layout.tsx` entirely:

```typescript
// app/(dashboard)/layout.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProjects } from "@/lib/queries/projects";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/app-sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const projects = await getProjects();

  return (
    <SidebarProvider>
      <AppSidebar
        projects={projects}
        userEmail={user.email ?? ""}
      />
      <SidebarInset>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
```

**Step 7: Update dashboard page to include breadcrumbs**

In `app/(dashboard)/dashboard/page.tsx`, wrap content with BreadcrumbNav:

```typescript
import { getProjects } from "@/lib/queries/projects";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BreadcrumbNav } from "@/components/dashboard/breadcrumb-nav";
import Link from "next/link";

export default async function DashboardPage() {
  const projects = await getProjects();

  return (
    <>
      <BreadcrumbNav items={[{ label: "All Projects" }]} />
      <div className="p-6">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Projects</h1>
          <CreateProjectDialog />
        </div>
        {projects.length === 0 ? (
          <p className="text-muted-foreground">
            No projects yet. Create your first one.
          </p>
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
    </>
  );
}
```

**Step 8: Verify the new layout renders**

Run: `npm run dev`
Visit `http://localhost:3000/dashboard`. Expected: Left sidebar with project switcher, nav items, user account at bottom. Content area with breadcrumbs.

**Step 9: Commit**

```bash
git add components/dashboard/ app/\(dashboard\)/layout.tsx app/\(dashboard\)/dashboard/page.tsx lib/queries/projects.ts
git commit -m "feat: redesign dashboard with shadcn sidebar, project switcher, and breadcrumbs"
```

---

## Task 4: Project Overview Page

Replace the current flat project page with a proper overview: stats cards, quick links, recent articles.

**Files:**
- Modify: `app/(dashboard)/project/[slug]/page.tsx` (complete rewrite as overview)
- Create: `app/(dashboard)/project/[slug]/layout.tsx` (project-level layout providing context)

**Step 1: Create project-level layout**

This layout extracts the current project slug and passes it to the sidebar.

```typescript
// app/(dashboard)/project/[slug]/layout.tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, slug")
    .eq("slug", slug)
    .single();

  if (!project) notFound();

  // Children get the project context
  return <>{children}</>;
}
```

**Step 2: Rewrite project overview page**

```typescript
// app/(dashboard)/project/[slug]/page.tsx
import { createClient } from "@/lib/supabase/server";
import { getProjectVideos } from "@/lib/queries/videos";
import { BreadcrumbNav } from "@/components/dashboard/breadcrumb-nav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Video, Globe, Upload, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!project) notFound();

  const videos = await getProjectVideos(project.id);

  const { data: articles } = await supabase
    .from("articles")
    .select("id, title, slug, audience, language, status, created_at")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false });

  const allArticles = articles ?? [];
  const publishedCount = allArticles.filter((a) => a.status === "published").length;
  const draftCount = allArticles.filter((a) => a.status === "draft").length;
  const recentArticles = allArticles.slice(0, 5);

  return (
    <>
      <BreadcrumbNav
        projectName={project.name}
        projectSlug={slug}
        items={[{ label: "Overview" }]}
      />
      <div className="p-6 space-y-6">
        {/* Stats row */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Articles</CardTitle>
              <FileText className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{allArticles.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Published</CardTitle>
              <Globe className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{publishedCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Drafts</CardTitle>
              <FileText className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{draftCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Videos</CardTitle>
              <Video className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{videos.length}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Recent articles */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Recent Articles</CardTitle>
                <CardDescription>Latest documentation updates</CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/project/${slug}/articles`}>View all</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {recentArticles.length === 0 ? (
                <p className="text-sm text-muted-foreground">No articles yet. Upload a video to generate documentation.</p>
              ) : (
                <div className="space-y-3">
                  {recentArticles.map((article) => (
                    <Link
                      key={article.id}
                      href={`/project/${slug}/article/${article.slug}/edit?audience=${article.audience}&lang=${article.language}`}
                      className="flex items-center justify-between rounded-md border p-3 hover:bg-accent transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="size-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm font-medium truncate">{article.title}</span>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <Badge variant="outline" className="text-xs">{article.audience}</Badge>
                        <Badge variant={article.status === "published" ? "default" : "secondary"} className="text-xs">
                          {article.status}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick links */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                <Button variant="outline" className="justify-start" asChild>
                  <Link href={`/project/${slug}/upload`}>
                    <Upload className="mr-2 size-4" />
                    Upload Video
                  </Link>
                </Button>
                <Button variant="outline" className="justify-start" asChild>
                  <Link href={`/project/${slug}/articles`}>
                    <FileText className="mr-2 size-4" />
                    Manage Articles
                  </Link>
                </Button>
                <Button variant="outline" className="justify-start" asChild>
                  <Link href={`/${slug}`} target="_blank">
                    <ExternalLink className="mr-2 size-4" />
                    View Public Site
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Analytics</CardTitle>
                <CardDescription>Coming soon</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Page views, search queries, and audience breakdown will appear here.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
```

**Step 3: Verify overview renders**

Run: `npm run dev`
Visit `http://localhost:3000/project/<slug>`. Expected: Stats cards, recent articles list, quick actions sidebar.

**Step 4: Commit**

```bash
git add app/\(dashboard\)/project/\[slug\]/
git commit -m "feat: add project overview page with stats, recent articles, and quick actions"
```

---

## Task 5: Article Tree Navigation with Filters, Delete, and Reordering

Create a dedicated `/project/[slug]/articles` page with a folder-like tree structure grouped by chapter, audience/status filters, delete capability, and drag-to-reorder.

**Files:**
- Create: `app/(dashboard)/project/[slug]/articles/page.tsx`
- Create: `components/dashboard/article-tree.tsx` (client component with DnD)
- Create: `app/api/articles/reorder/route.ts` (API for saving order)
- Create: `app/api/articles/[id]/route.ts` (DELETE endpoint)
- Create: `app/api/videos/[id]/route.ts` (DELETE endpoint)
- Modify: `lib/queries/articles.ts` (add delete functions)

**Step 1: Add delete functions to article queries**

In `lib/queries/articles.ts`, add:

```typescript
export async function deleteArticle(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("articles").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteVideo(id: string) {
  const supabase = await createClient();
  // Delete associated articles first (cascade should handle this, but be explicit)
  const { error } = await supabase.from("videos").delete().eq("id", id);
  if (error) throw error;
}
```

**Step 2: Create article DELETE API route**

```typescript
// app/api/articles/[id]/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { error } = await supabase.from("articles").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
```

**Step 3: Create video DELETE API route**

```typescript
// app/api/videos/[id]/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  // Get video to find storage path
  const { data: video } = await supabase
    .from("videos")
    .select("storage_path")
    .eq("id", id)
    .single();

  // Delete from storage
  if (video?.storage_path) {
    await supabase.storage.from("videos").remove([video.storage_path]);
  }

  // Delete video record (cascade deletes segments)
  const { error } = await supabase.from("videos").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
```

**Step 4: Create article reorder API**

```typescript
// app/api/articles/reorder/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { items } = await request.json();
  // items: Array<{ id: string; order: number; chapter_id: string | null }>
  const supabase = await createClient();

  for (const item of items) {
    await supabase
      .from("articles")
      .update({ order: item.order, chapter_id: item.chapter_id })
      .eq("id", item.id);
  }

  return NextResponse.json({ success: true });
}
```

**Step 5: Create the article tree client component**

```typescript
// components/dashboard/article-tree.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronRight, GripVertical, FileText, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Article {
  id: string;
  title: string;
  slug: string;
  audience: string;
  language: string;
  status: string;
  order: number;
  chapter_id: string | null;
}

interface Chapter {
  id: string;
  title: string;
  slug: string;
  order: number;
}

interface ArticleTreeProps {
  projectSlug: string;
  chapters: Chapter[];
  articles: Article[];
  audiences: string[];
  languages: string[];
}

export function ArticleTree({
  projectSlug,
  chapters,
  articles: initialArticles,
  audiences,
  languages,
}: ArticleTreeProps) {
  const router = useRouter();
  const [articles, setArticles] = useState(initialArticles);
  const [audienceFilter, setAudienceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [langFilter, setLangFilter] = useState<string>("all");

  const filtered = articles.filter((a) => {
    if (audienceFilter !== "all" && a.audience !== audienceFilter) return false;
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (langFilter !== "all" && a.language !== langFilter) return false;
    return true;
  });

  // Group by chapter
  const grouped = chapters
    .map((ch) => ({
      ...ch,
      articles: filtered
        .filter((a) => a.chapter_id === ch.id)
        .sort((a, b) => a.order - b.order),
    }))
    .filter((ch) => ch.articles.length > 0);

  // Uncategorized articles (no chapter)
  const uncategorized = filtered
    .filter((a) => !a.chapter_id)
    .sort((a, b) => a.order - b.order);

  async function handleDelete(articleId: string) {
    await fetch(`/api/articles/${articleId}`, { method: "DELETE" });
    setArticles((prev) => prev.filter((a) => a.id !== articleId));
    router.refresh();
  }

  async function handleDragEnd(result: DropResult) {
    if (!result.destination) return;

    const sourceChapter = result.source.droppableId;
    const destChapter = result.destination.droppableId;
    const articleId = result.draggableId;

    // Reorder locally
    const updated = [...articles];
    const article = updated.find((a) => a.id === articleId);
    if (!article) return;

    article.chapter_id = destChapter === "uncategorized" ? null : destChapter;
    article.order = result.destination.index;

    setArticles(updated);

    // Persist to backend
    const chapterArticles = updated
      .filter((a) =>
        destChapter === "uncategorized"
          ? !a.chapter_id
          : a.chapter_id === destChapter
      )
      .sort((a, b) => a.order - b.order)
      .map((a, i) => ({
        id: a.id,
        order: i,
        chapter_id: a.chapter_id,
      }));

    await fetch("/api/articles/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: chapterArticles }),
    });
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={audienceFilter} onValueChange={setAudienceFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Audience" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All audiences</SelectItem>
            {audiences.map((a) => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
          </SelectContent>
        </Select>

        <Select value={langFilter} onValueChange={setLangFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Language" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All languages</SelectItem>
            {languages.map((l) => (
              <SelectItem key={l} value={l}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tree */}
      <DragDropContext onDragEnd={handleDragEnd}>
        {grouped.map((chapter) => (
          <Collapsible key={chapter.id} defaultOpen>
            <CollapsibleTrigger className="flex items-center gap-2 py-2 text-sm font-semibold uppercase text-muted-foreground hover:text-foreground w-full">
              <ChevronRight className="size-4 transition-transform [[data-state=open]>&]:rotate-90" />
              {chapter.title}
              <span className="text-xs font-normal ml-auto">{chapter.articles.length}</span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Droppable droppableId={chapter.id}>
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1 ml-4">
                    {chapter.articles.map((article, index) => (
                      <ArticleRow
                        key={article.id}
                        article={article}
                        index={index}
                        projectSlug={projectSlug}
                        onDelete={handleDelete}
                      />
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </CollapsibleContent>
          </Collapsible>
        ))}

        {uncategorized.length > 0 && (
          <div>
            <p className="py-2 text-sm font-semibold uppercase text-muted-foreground">
              Uncategorized
            </p>
            <Droppable droppableId="uncategorized">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1 ml-4">
                  {uncategorized.map((article, index) => (
                    <ArticleRow
                      key={article.id}
                      article={article}
                      index={index}
                      projectSlug={projectSlug}
                      onDelete={handleDelete}
                    />
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        )}
      </DragDropContext>
    </div>
  );
}

function ArticleRow({
  article,
  index,
  projectSlug,
  onDelete,
}: {
  article: Article;
  index: number;
  projectSlug: string;
  onDelete: (id: string) => void;
}) {
  return (
    <Draggable draggableId={article.id} index={index}>
      {(provided) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className="flex items-center gap-2 rounded-md border bg-background p-2 hover:bg-accent/50 transition-colors group"
        >
          <div {...provided.dragHandleProps} className="cursor-grab">
            <GripVertical className="size-4 text-muted-foreground" />
          </div>
          <FileText className="size-4 text-muted-foreground flex-shrink-0" />
          <Link
            href={`/project/${projectSlug}/article/${article.slug}/edit?audience=${article.audience}&lang=${article.language}`}
            className="flex-1 text-sm font-medium truncate hover:underline"
          >
            {article.title}
          </Link>
          <Badge variant="outline" className="text-xs">{article.audience}</Badge>
          <Badge variant="outline" className="text-xs">{article.language}</Badge>
          <Badge
            variant={article.status === "published" ? "default" : "secondary"}
            className="text-xs"
          >
            {article.status}
          </Badge>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete article?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete "{article.title}". This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(article.id)}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </Draggable>
  );
}
```

**Step 6: Create the articles page**

```typescript
// app/(dashboard)/project/[slug]/articles/page.tsx
import { createClient } from "@/lib/supabase/server";
import { BreadcrumbNav } from "@/components/dashboard/breadcrumb-nav";
import { ArticleTree } from "@/components/dashboard/article-tree";
import { notFound } from "next/navigation";

export default async function ArticlesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, slug")
    .eq("slug", slug)
    .single();

  if (!project) notFound();

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, title, slug, order")
    .eq("project_id", project.id)
    .order("order");

  const { data: articles } = await supabase
    .from("articles")
    .select("id, title, slug, audience, language, status, order, chapter_id")
    .eq("project_id", project.id)
    .order("order");

  const allArticles = articles ?? [];
  const audiences = [...new Set(allArticles.map((a) => a.audience))];
  const languages = [...new Set(allArticles.map((a) => a.language))];

  return (
    <>
      <BreadcrumbNav
        projectName={project.name}
        projectSlug={slug}
        items={[{ label: "Articles" }]}
      />
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Articles</h1>
        <ArticleTree
          projectSlug={slug}
          chapters={chapters ?? []}
          articles={allArticles}
          audiences={audiences}
          languages={languages}
        />
      </div>
    </>
  );
}
```

**Step 7: Verify tree view renders**

Run: `npm run dev`
Visit `http://localhost:3000/project/<slug>/articles`. Expected: Grouped tree with filters, drag handles, delete buttons.

**Step 8: Commit**

```bash
git add app/\(dashboard\)/project/\[slug\]/articles/ components/dashboard/article-tree.tsx app/api/articles/ app/api/videos/\[id\]/ lib/queries/articles.ts
git commit -m "feat: add article tree view with filters, reordering, and delete"
```

---

## Task 6: Video Upload Dialog with Two-Column Layout

Replace the inline upload card with a dedicated page at `/project/[slug]/upload`. Two-column layout: left explanations, right form fields.

**Files:**
- Create: `app/(dashboard)/project/[slug]/upload/page.tsx`
- Modify: `components/video-upload.tsx` (redesign to two-column layout)

**Step 1: Create the upload page**

```typescript
// app/(dashboard)/project/[slug]/upload/page.tsx
import { createClient } from "@/lib/supabase/server";
import { BreadcrumbNav } from "@/components/dashboard/breadcrumb-nav";
import { VideoUpload } from "@/components/video-upload";
import { notFound } from "next/navigation";

export default async function UploadPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, slug")
    .eq("slug", slug)
    .single();

  if (!project) notFound();

  return (
    <>
      <BreadcrumbNav
        projectName={project.name}
        projectSlug={slug}
        items={[{ label: "Upload Video" }]}
      />
      <div className="p-6 max-w-4xl">
        <h1 className="text-2xl font-bold mb-2">Upload Video</h1>
        <p className="text-muted-foreground mb-8">
          Upload a product video and we'll generate documentation for your selected audiences.
        </p>
        <VideoUpload projectId={project.id} />
      </div>
    </>
  );
}
```

**Step 2: Redesign VideoUpload to two-column rows**

Rewrite `components/video-upload.tsx`. Each form section becomes a two-column row: left column has a label and description, right column has the input field.

```typescript
// components/video-upload.tsx
"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { ProcessingStatus } from "./processing-status";
import { Upload } from "lucide-react";

const AUDIENCES = [
  { id: "developers", label: "Developers", description: "Technical docs with code snippets and API references" },
  { id: "end-users", label: "End Users", description: "Step-by-step guides with simple language" },
  { id: "ai-agents", label: "AI Agents", description: "LLM-optimized docs for coding assistants" },
];

const LANGUAGES = [
  { id: "en", label: "English", flag: "🇺🇸" },
  { id: "de", label: "Deutsch", flag: "🇩🇪" },
  { id: "es", label: "Espanol", flag: "🇪🇸" },
  { id: "fr", label: "Francais", flag: "🇫🇷" },
  { id: "ja", label: "Japanese", flag: "🇯🇵" },
  { id: "zh", label: "Chinese", flag: "🇨🇳" },
  { id: "ko", label: "Korean", flag: "🇰🇷" },
  { id: "pt", label: "Portugues", flag: "🇧🇷" },
];

export function VideoUpload({ projectId }: { projectId: string }) {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [audiences, setAudiences] = useState<string[]>(["developers"]);
  const [languages, setLanguages] = useState<string[]>(["en"]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [processingVideoId, setProcessingVideoId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const supabase = createClient();

  function toggleAudience(id: string) {
    setAudiences((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }

  function toggleLanguage(id: string) {
    setLanguages((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev;
        return prev.filter((l) => l !== id);
      }
      return [...prev, id];
    });
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      const urlRes = await fetch("/api/videos/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const { videoId, uploadUrl } = await urlRes.json();
      if (!uploadUrl) throw new Error("Failed to get upload URL");

      setUploadProgress(10);
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      setUploadProgress(80);

      await supabase
        .from("videos")
        .update({ title: title || file.name })
        .eq("id", videoId);

      setUploadProgress(100);
      setUploading(false);
      setProcessingVideoId(videoId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setUploading(false);
    }
  }

  function handleProcessingComplete() {
    setProcessingVideoId(null);
    setTitle("");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    router.refresh();
  }

  if (processingVideoId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Processing video</CardTitle>
        </CardHeader>
        <CardContent>
          <ProcessingStatus
            videoId={processingVideoId}
            audiences={audiences}
            languages={languages}
            onComplete={handleProcessingComplete}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleUpload} className="space-y-8">
      {/* Video file */}
      <div className="grid gap-6 md:grid-cols-[1fr_1.5fr]">
        <div>
          <Label className="text-base font-medium">Video file</Label>
          <p className="text-sm text-muted-foreground mt-1">
            Upload an MP4, MOV, or WebM file. Screen recordings, product demos, and tutorials work best.
          </p>
        </div>
        <div className="space-y-3">
          <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary transition-colors">
            <Upload className="size-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground mb-2">
              {file ? file.name : "Drag and drop or click to select"}
            </p>
            <Input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="max-w-xs mx-auto"
              required
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Title */}
      <div className="grid gap-6 md:grid-cols-[1fr_1.5fr]">
        <div>
          <Label className="text-base font-medium">Title</Label>
          <p className="text-sm text-muted-foreground mt-1">
            A name for this video. Used as the default title for generated articles.
          </p>
        </div>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Getting Started Tutorial"
        />
      </div>

      <Separator />

      {/* Audiences */}
      <div className="grid gap-6 md:grid-cols-[1fr_1.5fr]">
        <div>
          <Label className="text-base font-medium">Target audiences</Label>
          <p className="text-sm text-muted-foreground mt-1">
            Each audience gets its own tailored documentation. Select at least one.
          </p>
        </div>
        <div className="space-y-3">
          {AUDIENCES.map((a) => (
            <label
              key={a.id}
              className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent/50 transition-colors"
            >
              <input
                type="checkbox"
                checked={audiences.includes(a.id)}
                onChange={() => toggleAudience(a.id)}
                className="mt-0.5 rounded"
              />
              <div>
                <span className="text-sm font-medium">{a.label}</span>
                <p className="text-xs text-muted-foreground">{a.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <Separator />

      {/* Languages */}
      <div className="grid gap-6 md:grid-cols-[1fr_1.5fr]">
        <div>
          <Label className="text-base font-medium">Languages</Label>
          <p className="text-sm text-muted-foreground mt-1">
            First selected language is the primary. Others will be auto-translated.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((l) => (
            <label
              key={l.id}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                languages.includes(l.id)
                  ? "border-primary bg-primary/5"
                  : "hover:bg-accent/50"
              }`}
            >
              <input
                type="checkbox"
                checked={languages.includes(l.id)}
                onChange={() => toggleLanguage(l.id)}
                className="sr-only"
              />
              <span className="text-base">{l.flag}</span>
              <span className="text-sm">{l.label}</span>
            </label>
          ))}
        </div>
      </div>

      <Separator />

      {/* Upload status */}
      {uploading && <Progress value={uploadProgress} className="w-full" />}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end">
        <Button type="submit" disabled={uploading || !file} size="lg">
          {uploading ? "Uploading..." : "Upload & generate docs"}
        </Button>
      </div>
    </form>
  );
}
```

**Step 3: Verify upload page renders**

Run: `npm run dev`
Visit `http://localhost:3000/project/<slug>/upload`. Expected: Clean two-column form with explanations on left, inputs on right.

**Step 4: Commit**

```bash
git add app/\(dashboard\)/project/\[slug\]/upload/ components/video-upload.tsx
git commit -m "feat: redesign video upload as dedicated page with two-column layout"
```

---

## Task 7: Video Gallery

Move videos out of the overview page and into a small gallery section on the articles page or a dedicated tab.

**Files:**
- Modify: `app/(dashboard)/project/[slug]/articles/page.tsx` (add video gallery section)
- Create: `components/dashboard/video-gallery.tsx`

**Step 1: Create video gallery component**

```typescript
// components/dashboard/video-gallery.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronRight, Video, Trash2 } from "lucide-react";

interface VideoItem {
  id: string;
  title: string;
  status: string;
  created_at: string;
}

export function VideoGallery({ videos: initialVideos }: { videos: VideoItem[] }) {
  const router = useRouter();
  const [videos, setVideos] = useState(initialVideos);

  async function handleDelete(videoId: string) {
    await fetch(`/api/videos/${videoId}`, { method: "DELETE" });
    setVideos((prev) => prev.filter((v) => v.id !== videoId));
    router.refresh();
  }

  if (videos.length === 0) return null;

  return (
    <Collapsible>
      <CollapsibleTrigger className="flex items-center gap-2 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ChevronRight className="size-4 transition-transform [[data-state=open]>&]:rotate-90" />
        <Video className="size-4" />
        Source Videos
        <span className="text-xs font-normal ml-1">({videos.length})</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid gap-2 ml-6 mt-2">
          {videos.map((video) => (
            <div
              key={video.id}
              className="flex items-center justify-between rounded-md border p-2.5 group"
            >
              <div className="flex items-center gap-3">
                <Video className="size-4 text-muted-foreground" />
                <span className="text-sm">{video.title}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    video.status === "ready"
                      ? "default"
                      : video.status === "failed"
                        ? "destructive"
                        : "secondary"
                  }
                  className="text-xs"
                >
                  {video.status}
                </Badge>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete video?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete "{video.title}" and its source file. Generated articles will remain.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(video.id)}>
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
```

**Step 2: Add video gallery to articles page**

In `app/(dashboard)/project/[slug]/articles/page.tsx`, add after the ArticleTree:

```typescript
// Add to imports
import { VideoGallery } from "@/components/dashboard/video-gallery";
import { getProjectVideos } from "@/lib/queries/videos";

// Add inside the component, after fetching articles:
const videos = await getProjectVideos(project.id);

// Add in JSX after ArticleTree:
<Separator className="my-6" />
<VideoGallery videos={videos} />
```

**Step 3: Verify gallery renders**

Run: `npm run dev`
Visit `http://localhost:3000/project/<slug>/articles`. Expected: Collapsible "Source Videos" section below article tree.

**Step 4: Commit**

```bash
git add components/dashboard/video-gallery.tsx app/\(dashboard\)/project/\[slug\]/articles/page.tsx
git commit -m "feat: add collapsible video gallery with delete on articles page"
```

---

## Task 8: Editor Page Breadcrumbs

Add breadcrumb navigation to the article editor page.

**Files:**
- Modify: `app/(dashboard)/project/[slug]/article/[articleSlug]/edit/editor-page-client.tsx`

**Step 1: Add breadcrumbs to editor page**

In `editor-page-client.tsx`, add BreadcrumbNav at the top of the return. The breadcrumb shows: Dashboard > Project Name > Articles > Article Title.

Add to the component props: `projectName: string`

In the parent `page.tsx`, pass `projectName={article.projects.name}`.

In `editor-page-client.tsx`, wrap the existing content:

```typescript
// At the top of the return:
<>
  <BreadcrumbNav
    projectName={projectName}
    projectSlug={projectSlug}
    items={[
      { label: "Articles", href: `/project/${projectSlug}/articles` },
      { label: article.title },
    ]}
  />
  <div className="p-6 space-y-4">
    {/* existing editor content */}
  </div>
</>
```

**Step 2: Verify breadcrumbs render in editor**

Run: `npm run dev`
Open any article editor. Expected: Breadcrumb trail at top.

**Step 3: Commit**

```bash
git add app/\(dashboard\)/project/\[slug\]/article/
git commit -m "feat: add breadcrumb navigation to article editor page"
```

---

## Task 9: Public View — Audience Switcher, Language Dropdown with Flags, and Breadcrumbs

Improve the public docs sidebar: audience switcher becomes more prominent, language selector becomes a dropdown with flag emojis, add breadcrumbs.

**Files:**
- Modify: `components/docs/sidebar.tsx` (redesign switchers)
- Create: `components/docs/docs-breadcrumb.tsx`
- Modify: `app/(docs)/[projectSlug]/[articleSlug]/page.tsx` (add breadcrumbs)
- Modify: `app/(docs)/[projectSlug]/layout.tsx` (add breadcrumbs slot)

**Step 1: Redesign the docs sidebar with improved switchers**

Replace the audience pills with a proper segmented control, and the language pills with a flag dropdown:

```typescript
// components/docs/sidebar.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Menu } from "lucide-react";
import { SearchDialog } from "./search-dialog";

const LANGUAGE_CONFIG: Record<string, { label: string; flag: string }> = {
  en: { label: "English", flag: "🇺🇸" },
  de: { label: "Deutsch", flag: "🇩🇪" },
  es: { label: "Espanol", flag: "🇪🇸" },
  fr: { label: "Francais", flag: "🇫🇷" },
  ja: { label: "日本語", flag: "🇯🇵" },
  zh: { label: "中文", flag: "🇨🇳" },
  ko: { label: "한국어", flag: "🇰🇷" },
  pt: { label: "Portugues", flag: "🇧🇷" },
};

const AUDIENCE_LABELS: Record<string, string> = {
  developers: "Developer Docs",
  "end-users": "User Guide",
};

interface Chapter {
  id: string;
  title: string;
  slug: string;
  articles: {
    id: string;
    title: string;
    slug: string;
    audience: string;
    language: string;
    status: string;
  }[];
}

interface SidebarProps {
  projectId: string;
  projectName: string;
  projectSlug: string;
  chapters: Chapter[];
  audiences: string[];
  languages: string[];
}

function SidebarContent({
  projectId,
  projectName,
  projectSlug,
  chapters,
  audiences,
  languages,
}: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentAudience = searchParams.get("audience") ?? "developers";
  const currentLang = searchParams.get("lang") ?? "en";

  const filteredChapters = chapters
    .map((ch) => ({
      ...ch,
      articles: ch.articles.filter(
        (a) =>
          a.audience === currentAudience &&
          a.language === currentLang &&
          a.status === "published"
      ),
    }))
    .filter((ch) => ch.articles.length > 0);

  const displayAudiences = audiences.filter((a) => a !== "ai-agents");

  function buildQuery(overrides: Record<string, string>) {
    const params: Record<string, string> = {
      audience: currentAudience,
      lang: currentLang,
      ...overrides,
    };
    const parts: string[] = [];
    if (params.audience !== "developers") parts.push(`audience=${params.audience}`);
    if (params.lang !== "en") parts.push(`lang=${params.lang}`);
    return parts.length > 0 ? `?${parts.join("&")}` : "";
  }

  function handleLanguageChange(lang: string) {
    const query = buildQuery({ lang });
    window.location.href = `/${projectSlug}${query}`;
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <Link href={`/${projectSlug}`} className="font-semibold text-lg">
        {projectName}
      </Link>

      <SearchDialog projectId={projectId} projectSlug={projectSlug} />

      {/* Audience switcher — segmented control */}
      {displayAudiences.length > 1 && (
        <div className="flex rounded-lg border p-0.5 bg-muted">
          {displayAudiences.map((a) => (
            <Link
              key={a}
              href={`/${projectSlug}${buildQuery({ audience: a })}`}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-center text-xs font-medium transition-all",
                currentAudience === a
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {AUDIENCE_LABELS[a] ?? a}
            </Link>
          ))}
        </div>
      )}

      {/* Language selector — dropdown with flags */}
      {languages.length > 1 && (
        <Select value={currentLang} onValueChange={handleLanguageChange}>
          <SelectTrigger className="w-full">
            <SelectValue>
              <span className="flex items-center gap-2">
                <span>{LANGUAGE_CONFIG[currentLang]?.flag ?? "🌐"}</span>
                <span>{LANGUAGE_CONFIG[currentLang]?.label ?? currentLang}</span>
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {languages.map((l) => (
              <SelectItem key={l} value={l}>
                <span className="flex items-center gap-2">
                  <span>{LANGUAGE_CONFIG[l]?.flag ?? "🌐"}</span>
                  <span>{LANGUAGE_CONFIG[l]?.label ?? l}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <nav className="flex flex-col gap-1">
        {filteredChapters.map((chapter) => (
          <div key={chapter.id}>
            <p className="text-xs font-semibold uppercase text-muted-foreground mt-4 mb-1 px-2">
              {chapter.title}
            </p>
            {chapter.articles.map((article) => {
              const href = `/${projectSlug}/${article.slug}${buildQuery({})}`;
              const isActive = pathname === `/${projectSlug}/${article.slug}`;
              return (
                <Link
                  key={article.id}
                  href={href}
                  className={cn(
                    "block rounded-md px-2 py-1.5 text-sm transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  )}
                >
                  {article.title}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </div>
  );
}

export function Sidebar(props: SidebarProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="lg:hidden fixed top-3 left-3 z-50">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="h-8 w-8">
              <Menu className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[260px] p-0">
            <SidebarContent {...props} />
          </SheetContent>
        </Sheet>
      </div>

      <aside className="hidden lg:block w-[260px] border-r h-screen sticky top-0 overflow-y-auto flex-shrink-0">
        <SidebarContent {...props} />
      </aside>
    </>
  );
}
```

**Step 2: Create docs breadcrumb component**

```typescript
// components/docs/docs-breadcrumb.tsx
"use client";

import { useSearchParams } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface DocsBreadcrumbProps {
  projectName: string;
  projectSlug: string;
  chapterTitle?: string;
  articleTitle?: string;
}

export function DocsBreadcrumb({
  projectName,
  projectSlug,
  chapterTitle,
  articleTitle,
}: DocsBreadcrumbProps) {
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const qs = queryString ? `?${queryString}` : "";

  return (
    <Breadcrumb className="mb-6">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href={`/${projectSlug}${qs}`}>
            {projectName}
          </BreadcrumbLink>
        </BreadcrumbItem>
        {chapterTitle && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <span className="text-muted-foreground">{chapterTitle}</span>
            </BreadcrumbItem>
          </>
        )}
        {articleTitle && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{articleTitle}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
```

**Step 3: Add breadcrumbs to article page**

In `app/(docs)/[projectSlug]/[articleSlug]/page.tsx`, add the DocsBreadcrumb above the article content. You'll need to join through the chapter to get the chapter title:

```typescript
// Add to the query — also fetch chapter title:
const { data: article } = await supabase
  .from("articles")
  .select("*, videos(*), projects!inner(*), chapters(title)")
  .eq("projects.slug", projectSlug)
  .eq("slug", articleSlug)
  .eq("audience", audience)
  .eq("language", lang)
  .eq("status", "published")
  .single();

// Add in the JSX before the h1:
<DocsBreadcrumb
  projectName={article.projects.name}
  projectSlug={projectSlug}
  chapterTitle={article.chapters?.title}
  articleTitle={article.title}
/>
```

**Step 4: Verify**

Run: `npm run dev`
Visit the public docs site. Expected: Segmented audience switcher, flag dropdown for languages, breadcrumbs on article pages.

**Step 5: Commit**

```bash
git add components/docs/sidebar.tsx components/docs/docs-breadcrumb.tsx app/\(docs\)/
git commit -m "feat: improve public docs with audience switcher, flag language dropdown, and breadcrumbs"
```

---

## Task 10: TOC Scroll Observer Enhancement

The TOC already has IntersectionObserver, but the highlighting needs to be more visible and the scroll behavior smoother.

**Files:**
- Modify: `components/docs/toc.tsx` (better active state styling, smoother scroll offset)

**Step 1: Enhance TOC component**

```typescript
// components/docs/toc.tsx
"use client";

import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";

interface TocItem {
  id: string;
  text: string;
  level: number;
}

export function Toc({ headings }: { headings: TocItem[] }) {
  const [activeId, setActiveId] = useState<string>("");
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    // Disconnect previous observer
    observerRef.current?.disconnect();

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the first heading that is intersecting, going top to bottom
        const visibleEntries = entries.filter((e) => e.isIntersecting);
        if (visibleEntries.length > 0) {
          // Pick the one closest to the top
          const sorted = visibleEntries.sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top
          );
          setActiveId(sorted[0].target.id);
        }
      },
      {
        rootMargin: "-64px 0px -75% 0px",
        threshold: [0, 1],
      }
    );

    observerRef.current = observer;

    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      for (const heading of headings) {
        const element = document.getElementById(heading.id);
        if (element) observer.observe(element);
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <aside className="hidden xl:block w-[200px] flex-shrink-0 sticky top-16 h-fit pr-4">
      <p className="text-xs font-semibold uppercase text-muted-foreground mb-3">
        On this page
      </p>
      <nav className="flex flex-col gap-0.5 relative">
        {/* Active indicator bar */}
        <div className="absolute left-0 top-0 bottom-0 w-px bg-border" />
        {headings.map((h) => (
          <a
            key={h.id}
            href={`#${h.id}`}
            onClick={(e) => {
              e.preventDefault();
              const el = document.getElementById(h.id);
              if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "start" });
                // Update URL hash without jumping
                window.history.replaceState(null, "", `#${h.id}`);
              }
            }}
            className={cn(
              "relative text-xs leading-relaxed py-1 pl-3 transition-colors border-l-2 -ml-px",
              h.level === 3 && "pl-6",
              h.level === 4 && "pl-9",
              activeId === h.id
                ? "border-l-primary text-foreground font-medium"
                : "border-l-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {h.text}
          </a>
        ))}
      </nav>
    </aside>
  );
}
```

**Step 2: Verify scroll tracking**

Run: `npm run dev`
Open a long article in the public docs. Scroll through. Expected: Active heading highlights with a colored left border indicator, smooth scroll when clicking TOC items.

**Step 3: Commit**

```bash
git add components/docs/toc.tsx
git commit -m "feat: enhance TOC with active border indicator and smooth scroll behavior"
```

---

## Task 11: Pass Current Project Slug to Sidebar

The app sidebar needs to know the current project to highlight the correct nav items. Since the sidebar is in the layout and project pages are nested, we need to propagate the project slug.

**Files:**
- Modify: `app/(dashboard)/layout.tsx` (use pathname to extract project slug)
- Modify: `components/dashboard/app-sidebar.tsx` (accept current slug from layout)

**Step 1: Extract project slug from URL in layout**

The dashboard layout can't directly access params from nested routes, but we can use a client-side approach. The simpler path: make the sidebar read the slug from the URL via `usePathname`.

In `components/dashboard/app-sidebar.tsx`, the component is already client-side. Replace the `currentProjectSlug` prop with a derived value:

```typescript
// In AppSidebar, replace the prop with:
const pathname = usePathname();
const projectSlugMatch = pathname.match(/^\/project\/([^/]+)/);
const currentProjectSlug = projectSlugMatch?.[1];
```

Remove `currentProjectSlug` from `AppSidebarProps` interface and from the layout's usage.

**Step 2: Verify sidebar nav highlights correctly**

Navigate between projects and verify the nav items update.

**Step 3: Commit**

```bash
git add components/dashboard/app-sidebar.tsx app/\(dashboard\)/layout.tsx
git commit -m "feat: derive current project from URL for sidebar nav highlighting"
```

---

## Summary

| Task | Description | Depends On |
|------|-------------|------------|
| 1 | Fix article 404 bug (language param) | — |
| 2 | Install additional shadcn components + DnD | — |
| 3 | Dashboard shell redesign (sidebar layout) | 2 |
| 4 | Project overview page | 3 |
| 5 | Article tree with filters, delete, reorder | 2, 3 |
| 6 | Video upload dialog two-column layout | 3 |
| 7 | Video gallery (collapsible on articles page) | 5 |
| 8 | Editor page breadcrumbs | 3 |
| 9 | Public view: audience switcher, flags, breadcrumbs | 2 |
| 10 | TOC scroll observer enhancement | — |
| 11 | Pass current project slug to sidebar | 3 |
