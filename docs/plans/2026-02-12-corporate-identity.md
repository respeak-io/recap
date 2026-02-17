# Corporate Identity (CI) Customization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users customize the look of their public docs site to match their corporate identity — logo, brand colors, font choice, favicon, and optional custom CSS — all configurable from the dashboard settings page.

**Architecture:** Add a `theme` JSONB column on the `projects` table to store all CI settings. A new dashboard settings page (`/project/[slug]/settings`) lets users upload a logo, pick brand colors, select from curated font pairings, and add a custom favicon. The public docs layout reads the theme config and injects CSS custom properties + dynamic `<head>` elements. Logo and favicon are stored in a new `assets` Supabase storage bucket. No new tables needed — everything lives on the existing projects record.

**Tech Stack:** Supabase (JSONB column, Storage), Next.js API routes, Tailwind CSS custom properties, shadcn/ui form components

---

### Task 1: Database Migration — Theme Column + Assets Bucket

**Files:**
- Create: `supabase/migrations/20260212100000_project_theme.sql`

**Step 1: Write the migration**

```sql
-- Add theme JSONB column to projects
-- Structure:
-- {
--   "logo_path": "string | null",          -- Storage path in assets bucket
--   "favicon_path": "string | null",       -- Storage path in assets bucket
--   "colors": {
--     "primary": "#hex",                   -- Brand primary color
--     "primary_foreground": "#hex",        -- Text on primary
--     "background": "#hex",               -- Page background
--     "foreground": "#hex",               -- Body text color
--     "accent": "#hex",                   -- Accent/link color
--     "sidebar_background": "#hex",       -- Sidebar bg
--     "sidebar_foreground": "#hex"        -- Sidebar text
--   },
--   "font": "inter" | "system" | "geist" | "ibm-plex" | "source-serif",
--   "custom_css": "string | null",        -- Raw CSS overrides
--   "hide_powered_by": boolean
-- }
alter table projects add column theme jsonb not null default '{}';

-- Create assets storage bucket (public, since logos/favicons are shown on public docs)
insert into storage.buckets (id, name, public)
values ('assets', 'assets', true);

-- Anyone can read public assets
create policy "assets_public_read" on storage.objects for select
using (bucket_id = 'assets');

-- Authenticated users can upload assets
create policy "assets_upload" on storage.objects for insert
with check (
  bucket_id = 'assets'
  and auth.role() = 'authenticated'
);

-- Authenticated users can update their assets
create policy "assets_update" on storage.objects for update
using (
  bucket_id = 'assets'
  and auth.role() = 'authenticated'
);

-- Authenticated users can delete their assets
create policy "assets_delete" on storage.objects for delete
using (
  bucket_id = 'assets'
  and auth.role() = 'authenticated'
);
```

**Step 2: Apply the migration locally**

Run: `cd /Users/Tim/Documents/Respeak_Experiments/vidtodoc && supabase db reset`
Expected: All migrations apply cleanly. `projects` table now has a `theme` column.

**Step 3: Commit**

```bash
git add supabase/migrations/20260212100000_project_theme.sql
git commit -m "feat(ci): add theme JSONB column to projects and assets storage bucket"
```

---

### Task 2: Theme Type Definitions and Defaults

**Files:**
- Create: `lib/theme.ts`

**Step 1: Write the theme type and defaults**

```typescript
// lib/theme.ts

export interface ProjectThemeColors {
  primary: string;
  primary_foreground: string;
  background: string;
  foreground: string;
  accent: string;
  sidebar_background: string;
  sidebar_foreground: string;
}

export interface ProjectTheme {
  logo_path: string | null;
  favicon_path: string | null;
  colors: Partial<ProjectThemeColors>;
  font: "system" | "geist" | "inter" | "ibm-plex" | "source-serif";
  custom_css: string | null;
  hide_powered_by: boolean;
}

export const DEFAULT_THEME: ProjectTheme = {
  logo_path: null,
  favicon_path: null,
  colors: {},
  font: "geist",
  custom_css: null,
  hide_powered_by: false,
};

export const FONT_OPTIONS = [
  { id: "geist", label: "Geist Sans", family: "var(--font-geist-sans), system-ui, sans-serif" },
  { id: "system", label: "System Default", family: "system-ui, -apple-system, sans-serif" },
  { id: "inter", label: "Inter", family: "'Inter', system-ui, sans-serif", googleFont: "Inter:wght@400;500;600;700" },
  { id: "ibm-plex", label: "IBM Plex Sans", family: "'IBM Plex Sans', system-ui, sans-serif", googleFont: "IBM+Plex+Sans:wght@400;500;600;700" },
  { id: "source-serif", label: "Source Serif 4", family: "'Source Serif 4', Georgia, serif", googleFont: "Source+Serif+4:wght@400;500;600;700" },
] as const;

/** Merge stored theme (which may be partial) with defaults */
export function resolveTheme(stored: Record<string, unknown> | null): ProjectTheme {
  if (!stored) return DEFAULT_THEME;
  return {
    logo_path: (stored.logo_path as string) ?? null,
    favicon_path: (stored.favicon_path as string) ?? null,
    colors: (stored.colors as Partial<ProjectThemeColors>) ?? {},
    font: (stored.font as ProjectTheme["font"]) ?? "geist",
    custom_css: (stored.custom_css as string) ?? null,
    hide_powered_by: (stored.hide_powered_by as boolean) ?? false,
  };
}

/** Convert theme colors to CSS custom property declarations */
export function themeToCssVars(colors: Partial<ProjectThemeColors>): string {
  const map: Record<string, string> = {
    primary: "--primary",
    primary_foreground: "--primary-foreground",
    background: "--background",
    foreground: "--foreground",
    accent: "--accent",
    sidebar_background: "--sidebar",
    sidebar_foreground: "--sidebar-foreground",
  };

  const declarations: string[] = [];
  for (const [key, cssVar] of Object.entries(map)) {
    const value = colors[key as keyof ProjectThemeColors];
    if (value) {
      declarations.push(`${cssVar}: ${value};`);
    }
  }

  return declarations.join("\n  ");
}
```

**Step 2: Commit**

```bash
git add lib/theme.ts
git commit -m "feat(ci): add theme type definitions, defaults, and CSS variable converter"
```

---

### Task 3: Theme Update API Endpoint

**Files:**
- Create: `app/api/projects/[id]/theme/route.ts`

**Step 1: Write the endpoint**

```typescript
// app/api/projects/[id]/theme/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const supabase = await createClient();

  // Verify user has write access
  const { data: project } = await supabase
    .from("projects")
    .select("id, theme")
    .eq("id", id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Merge with existing theme to allow partial updates
  const existingTheme = (project.theme as Record<string, unknown>) ?? {};
  const updatedTheme = { ...existingTheme, ...body };

  const { error } = await supabase
    .from("projects")
    .update({ theme: updatedTheme })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, theme: updatedTheme });
}
```

**Step 2: Commit**

```bash
git add app/api/projects/\[id\]/theme/route.ts
git commit -m "feat(ci): add PUT /api/projects/[id]/theme endpoint for theme updates"
```

---

### Task 4: Asset Upload API Endpoint

**Files:**
- Create: `app/api/projects/[id]/assets/route.ts`

**Step 1: Write the upload endpoint**

```typescript
// app/api/projects/[id]/assets/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const assetType = formData.get("type") as string; // "logo" or "favicon"

  if (!file || !assetType) {
    return NextResponse.json({ error: "Missing file or type" }, { status: 400 });
  }

  if (!["logo", "favicon"].includes(assetType)) {
    return NextResponse.json({ error: "Invalid asset type" }, { status: 400 });
  }

  // Validate file size (max 2MB)
  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 2MB)" }, { status: 400 });
  }

  const supabase = await createClient();

  // Verify project exists and user has access
  const { data: project } = await supabase
    .from("projects")
    .select("id, theme")
    .eq("id", id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const ext = file.name.split(".").pop() ?? "png";
  const storagePath = `${id}/${assetType}.${ext}`;

  // Upload to assets bucket (upsert to replace existing)
  const { error: uploadError } = await supabase.storage
    .from("assets")
    .upload(storagePath, file, { upsert: true });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from("assets")
    .getPublicUrl(storagePath);

  // Update project theme with the asset path
  const existingTheme = (project.theme as Record<string, unknown>) ?? {};
  const themeKey = assetType === "logo" ? "logo_path" : "favicon_path";
  const updatedTheme = { ...existingTheme, [themeKey]: storagePath };

  await supabase
    .from("projects")
    .update({ theme: updatedTheme })
    .eq("id", id);

  return NextResponse.json({
    ok: true,
    path: storagePath,
    publicUrl: urlData.publicUrl,
  });
}
```

**Step 2: Commit**

```bash
git add app/api/projects/\[id\]/assets/route.ts
git commit -m "feat(ci): add asset upload endpoint for logos and favicons"
```

---

### Task 5: Settings Page — Theme Editor

**Files:**
- Create: `app/(dashboard)/project/[slug]/settings/page.tsx`
- Create: `components/dashboard/theme-editor.tsx`

**Step 1: Create the theme editor client component**

```typescript
// components/dashboard/theme-editor.tsx
"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Upload, X, Save } from "lucide-react";
import { type ProjectTheme, type ProjectThemeColors, FONT_OPTIONS } from "@/lib/theme";

interface ThemeEditorProps {
  projectId: string;
  theme: ProjectTheme;
  logoUrl: string | null;
  faviconUrl: string | null;
  supabaseUrl: string;
}

export function ThemeEditor({
  projectId,
  theme: initialTheme,
  logoUrl: initialLogoUrl,
  faviconUrl: initialFaviconUrl,
  supabaseUrl,
}: ThemeEditorProps) {
  const router = useRouter();
  const [theme, setTheme] = useState(initialTheme);
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [faviconUrl, setFaviconUrl] = useState(initialFaviconUrl);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  function updateColor(key: keyof ProjectThemeColors, value: string) {
    setTheme((prev) => ({
      ...prev,
      colors: { ...prev.colors, [key]: value || undefined },
    }));
  }

  async function handleAssetUpload(type: "logo" | "favicon", file: File) {
    setUploading(type);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", type);

    const res = await fetch(`/api/projects/${projectId}/assets`, {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    setUploading(null);

    if (data.ok) {
      if (type === "logo") setLogoUrl(data.publicUrl);
      else setFaviconUrl(data.publicUrl);
      // Theme is updated server-side by the asset endpoint
      setTheme((prev) => ({
        ...prev,
        [type === "logo" ? "logo_path" : "favicon_path"]: data.path,
      }));
    }
  }

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/projects/${projectId}/theme`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(theme),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    router.refresh();
  }

  const COLOR_FIELDS: { key: keyof ProjectThemeColors; label: string; description: string }[] = [
    { key: "primary", label: "Primary", description: "Buttons, links, active states" },
    { key: "primary_foreground", label: "Primary Foreground", description: "Text on primary-colored elements" },
    { key: "background", label: "Background", description: "Page background color" },
    { key: "foreground", label: "Foreground", description: "Main body text color" },
    { key: "accent", label: "Accent", description: "Hover states, highlights" },
    { key: "sidebar_background", label: "Sidebar Background", description: "Navigation sidebar background" },
    { key: "sidebar_foreground", label: "Sidebar Text", description: "Navigation sidebar text color" },
  ];

  return (
    <div className="space-y-8">
      {/* Logo & Favicon */}
      <Card>
        <CardHeader>
          <CardTitle>Brand Assets</CardTitle>
          <CardDescription>Upload your logo and favicon. Recommended: SVG or PNG. Max 2MB.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Logo */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Logo</Label>
              <div className="border-2 border-dashed rounded-lg p-4 text-center">
                {logoUrl ? (
                  <div className="space-y-2">
                    <img src={logoUrl} alt="Logo" className="max-h-12 mx-auto object-contain" />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setLogoUrl(null);
                        setTheme((prev) => ({ ...prev, logo_path: null }));
                      }}
                    >
                      <X className="size-3 mr-1" /> Remove
                    </Button>
                  </div>
                ) : (
                  <div>
                    <Upload className="size-6 mx-auto text-muted-foreground mb-2" />
                    <p className="text-xs text-muted-foreground mb-2">SVG, PNG, or JPG</p>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleAssetUpload("logo", f);
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={uploading === "logo"}
                    >
                      {uploading === "logo" ? "Uploading..." : "Upload Logo"}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Favicon */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Favicon</Label>
              <div className="border-2 border-dashed rounded-lg p-4 text-center">
                {faviconUrl ? (
                  <div className="space-y-2">
                    <img src={faviconUrl} alt="Favicon" className="size-8 mx-auto object-contain" />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setFaviconUrl(null);
                        setTheme((prev) => ({ ...prev, favicon_path: null }));
                      }}
                    >
                      <X className="size-3 mr-1" /> Remove
                    </Button>
                  </div>
                ) : (
                  <div>
                    <Upload className="size-6 mx-auto text-muted-foreground mb-2" />
                    <p className="text-xs text-muted-foreground mb-2">32x32 or 64x64 PNG</p>
                    <input
                      ref={faviconInputRef}
                      type="file"
                      accept="image/png,image/x-icon,image/svg+xml"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleAssetUpload("favicon", f);
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => faviconInputRef.current?.click()}
                      disabled={uploading === "favicon"}
                    >
                      {uploading === "favicon" ? "Uploading..." : "Upload Favicon"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Brand Colors */}
      <Card>
        <CardHeader>
          <CardTitle>Brand Colors</CardTitle>
          <CardDescription>
            Customize colors for your public docs. Leave blank to use defaults. Supports any CSS color value (hex, rgb, oklch, hsl).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {COLOR_FIELDS.map((field) => (
              <div key={field.key} className="flex items-center gap-3">
                <input
                  type="color"
                  value={theme.colors[field.key] ?? "#000000"}
                  onChange={(e) => updateColor(field.key, e.target.value)}
                  className="size-9 rounded border cursor-pointer flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <Label className="text-sm font-medium">{field.label}</Label>
                  <p className="text-xs text-muted-foreground">{field.description}</p>
                </div>
                <Input
                  value={theme.colors[field.key] ?? ""}
                  onChange={(e) => updateColor(field.key, e.target.value)}
                  placeholder="Default"
                  className="w-28 text-xs"
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Typography */}
      <Card>
        <CardHeader>
          <CardTitle>Typography</CardTitle>
          <CardDescription>Choose a font for your public documentation.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-[1fr_1.5fr]">
            <div>
              <Label className="text-sm font-medium">Font Family</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Applied to all text on the public docs site.
              </p>
            </div>
            <Select
              value={theme.font}
              onValueChange={(v) => setTheme((prev) => ({ ...prev, font: v as ProjectTheme["font"] }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_OPTIONS.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    <span style={{ fontFamily: f.family }}>{f.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Custom CSS */}
      <Card>
        <CardHeader>
          <CardTitle>Custom CSS</CardTitle>
          <CardDescription>
            Advanced: inject custom CSS into your public docs. Use CSS custom properties or target specific elements.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={theme.custom_css ?? ""}
            onChange={(e) => setTheme((prev) => ({ ...prev, custom_css: e.target.value || null }))}
            placeholder={`/* Example: */\n.prose h2 { color: #1a73e8; }\n.prose a { text-decoration: underline; }`}
            className="font-mono text-sm min-h-[120px]"
          />
        </CardContent>
      </Card>

      {/* Branding */}
      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Hide &ldquo;Powered by vidtodoc&rdquo;</Label>
              <p className="text-xs text-muted-foreground">Remove the footer attribution on public docs.</p>
            </div>
            <Switch
              checked={theme.hide_powered_by}
              onCheckedChange={(v) => setTheme((prev) => ({ ...prev, hide_powered_by: v }))}
            />
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => router.refresh()}>
          Discard Changes
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="size-4 mr-2" />
          {saving ? "Saving..." : saved ? "Saved!" : "Save Theme"}
        </Button>
      </div>
    </div>
  );
}
```

**Step 2: Create the settings page**

```typescript
// app/(dashboard)/project/[slug]/settings/page.tsx
import { createClient } from "@/lib/supabase/server";
import { BreadcrumbNav } from "@/components/dashboard/breadcrumb-nav";
import { ThemeEditor } from "@/components/dashboard/theme-editor";
import { resolveTheme } from "@/lib/theme";
import { notFound } from "next/navigation";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, slug, theme")
    .eq("slug", slug)
    .single();

  if (!project) notFound();

  const theme = resolveTheme(project.theme as Record<string, unknown>);

  // Get public URLs for existing assets
  let logoUrl: string | null = null;
  let faviconUrl: string | null = null;

  if (theme.logo_path) {
    const { data } = supabase.storage.from("assets").getPublicUrl(theme.logo_path);
    logoUrl = data.publicUrl;
  }
  if (theme.favicon_path) {
    const { data } = supabase.storage.from("assets").getPublicUrl(theme.favicon_path);
    faviconUrl = data.publicUrl;
  }

  return (
    <>
      <BreadcrumbNav
        projectName={project.name}
        projectSlug={slug}
        items={[{ label: "Settings" }]}
      />
      <div className="p-6 max-w-3xl">
        <h1 className="text-2xl font-bold mb-2">Branding & Theme</h1>
        <p className="text-muted-foreground mb-8">
          Customize the look of your public documentation to match your corporate identity.
        </p>
        <ThemeEditor
          projectId={project.id}
          theme={theme}
          logoUrl={logoUrl}
          faviconUrl={faviconUrl}
          supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
        />
      </div>
    </>
  );
}
```

**Step 3: Verify settings page renders**

Run: `npm run dev`
Visit `http://localhost:3000/project/<slug>/settings`. Expected: Full theme editor with logo upload, color pickers, font selector, CSS textarea, and save button.

**Step 4: Commit**

```bash
git add app/\(dashboard\)/project/\[slug\]/settings/ components/dashboard/theme-editor.tsx
git commit -m "feat(ci): add settings page with full theme editor (logo, colors, font, CSS)"
```

---

### Task 6: Install Missing shadcn Components (Textarea, Switch)

**Files:**
- Modify: `components/ui/` (new components added by CLI)

**Step 1: Add textarea and switch**

```bash
cd /Users/Tim/Documents/Respeak_Experiments/vidtodoc
npx shadcn@latest add textarea switch
```

**Step 2: Verify build passes**

```bash
pnpm run build
```

Expected: Build succeeds.

**Step 3: Commit**

```bash
git add components/ui/textarea.tsx components/ui/switch.tsx
git commit -m "chore: add shadcn textarea and switch components"
```

---

### Task 7: Apply Theme to Public Docs Layout

This is the key task — the public docs layout reads the project's theme and injects dynamic CSS custom properties, Google Fonts, favicon, and logo.

**Files:**
- Modify: `app/(docs)/[projectSlug]/layout.tsx:1-62` (inject theme CSS and head elements)
- Create: `components/docs/theme-provider.tsx` (client wrapper for CSS vars)

**Step 1: Create the theme provider component**

```typescript
// components/docs/theme-provider.tsx
"use client";

import { type ProjectTheme, type ProjectThemeColors, FONT_OPTIONS } from "@/lib/theme";

interface DocsThemeProviderProps {
  theme: ProjectTheme;
  logoUrl: string | null;
  faviconUrl: string | null;
  projectName: string;
  children: React.ReactNode;
}

export function DocsThemeProvider({
  theme,
  logoUrl,
  faviconUrl,
  projectName,
  children,
}: DocsThemeProviderProps) {
  // Build inline style for CSS custom properties
  const cssVars: Record<string, string> = {};
  const colorMap: Record<keyof ProjectThemeColors, string> = {
    primary: "--primary",
    primary_foreground: "--primary-foreground",
    background: "--background",
    foreground: "--foreground",
    accent: "--accent",
    sidebar_background: "--sidebar",
    sidebar_foreground: "--sidebar-foreground",
  };

  for (const [key, cssVar] of Object.entries(colorMap)) {
    const value = theme.colors[key as keyof ProjectThemeColors];
    if (value) {
      cssVars[cssVar] = value;
    }
  }

  // Font family override
  const fontOption = FONT_OPTIONS.find((f) => f.id === theme.font);
  if (fontOption && theme.font !== "geist") {
    cssVars["--font-sans"] = fontOption.family;
  }

  return (
    <>
      {/* Google Font link if needed */}
      {fontOption && "googleFont" in fontOption && fontOption.googleFont && (
        <link
          rel="stylesheet"
          href={`https://fonts.googleapis.com/css2?family=${fontOption.googleFont}&display=swap`}
        />
      )}

      {/* Custom favicon */}
      {faviconUrl && (
        <link rel="icon" href={faviconUrl} />
      )}

      <div
        style={cssVars as React.CSSProperties}
        className="contents"
      >
        {children}
      </div>

      {/* Custom CSS injection */}
      {theme.custom_css && (
        <style dangerouslySetInnerHTML={{ __html: theme.custom_css }} />
      )}
    </>
  );
}
```

**Step 2: Update the public docs layout to use the theme provider**

Modify `app/(docs)/[projectSlug]/layout.tsx`:

```typescript
// app/(docs)/[projectSlug]/layout.tsx
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/docs/sidebar";
import { DocsThemeProvider } from "@/components/docs/theme-provider";
import { resolveTheme } from "@/lib/theme";
import { notFound } from "next/navigation";

export default async function DocsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectSlug: string }>;
}) {
  const { projectSlug } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select(
      "*, chapters(id, title, slug, order, articles(id, title, slug, audience, language, status))"
    )
    .eq("slug", projectSlug)
    .eq("is_public", true)
    .single();

  if (!project) notFound();

  // Resolve theme
  const theme = resolveTheme(project.theme as Record<string, unknown>);

  // Get asset URLs
  let logoUrl: string | null = null;
  let faviconUrl: string | null = null;
  if (theme.logo_path) {
    const { data } = supabase.storage.from("assets").getPublicUrl(theme.logo_path);
    logoUrl = data.publicUrl;
  }
  if (theme.favicon_path) {
    const { data } = supabase.storage.from("assets").getPublicUrl(theme.favicon_path);
    faviconUrl = data.publicUrl;
  }

  // Sort chapters by order
  const chapters = (project.chapters ?? []).sort(
    (a: { order: number }, b: { order: number }) => a.order - b.order
  );

  // Collect unique audiences
  const audiences = [
    ...new Set(
      chapters.flatMap((ch: { articles: { audience: string }[] }) =>
        ch.articles.map((a: { audience: string }) => a.audience)
      )
    ),
  ] as string[];

  // Collect unique languages
  const languages = [
    ...new Set(
      chapters.flatMap((ch: { articles: { language: string }[] }) =>
        ch.articles.map((a: { language: string }) => a.language)
      )
    ),
  ] as string[];

  return (
    <DocsThemeProvider
      theme={theme}
      logoUrl={logoUrl}
      faviconUrl={faviconUrl}
      projectName={project.name}
    >
      <div className="flex min-h-screen">
        <Sidebar
          projectId={project.id}
          projectName={project.name}
          projectSlug={projectSlug}
          chapters={chapters}
          audiences={audiences}
          languages={languages}
          logoUrl={logoUrl}
        />
        <div className="flex-1 min-w-0">
          {children}
          {!theme.hide_powered_by && (
            <footer className="border-t px-8 py-4 text-xs text-muted-foreground text-center">
              Powered by vidtodoc
            </footer>
          )}
        </div>
      </div>
    </DocsThemeProvider>
  );
}
```

**Step 3: Commit**

```bash
git add components/docs/theme-provider.tsx app/\(docs\)/\[projectSlug\]/layout.tsx
git commit -m "feat(ci): apply project theme (colors, fonts, favicon, CSS) to public docs layout"
```

---

### Task 8: Show Logo in Public Docs Sidebar

**Files:**
- Modify: `components/docs/sidebar.tsx:49-56,102-106` (accept logoUrl prop, show logo)

**Step 1: Add logo to sidebar**

In `components/docs/sidebar.tsx`:

1. Add `logoUrl?: string | null` to the `SidebarProps` interface.

2. In the `SidebarContent` function, replace the project name link with a conditional logo + name:

```typescript
// Replace line 104 (the project name link) with:
<Link href={`/${projectSlug}`} className="flex items-center gap-2 font-semibold text-lg">
  {logoUrl ? (
    <img src={logoUrl} alt={projectName} className="max-h-8 object-contain" />
  ) : (
    projectName
  )}
</Link>
```

3. Pass `logoUrl` through to `SidebarContent` in the `Sidebar` component (it already spreads all props).

**Step 2: Verify logo appears**

Upload a logo via settings page. Visit the public docs. Expected: Logo appears in the top-left of the sidebar instead of the project name text.

**Step 3: Commit**

```bash
git add components/docs/sidebar.tsx
git commit -m "feat(ci): display project logo in public docs sidebar"
```

---

### Task 9: Live Preview on Settings Page

**Files:**
- Modify: `components/dashboard/theme-editor.tsx` (add preview panel)

**Step 1: Add a preview card below the save button**

Add a preview section at the bottom of the ThemeEditor that renders a mini docs-like preview with the current theme applied:

```typescript
// Add at the end of the ThemeEditor return, before the closing </div>:

<Card>
  <CardHeader>
    <CardTitle>Preview</CardTitle>
    <CardDescription>Live preview of your theme settings</CardDescription>
  </CardHeader>
  <CardContent>
    <div
      className="rounded-lg border overflow-hidden"
      style={{
        "--preview-bg": theme.colors.background ?? "oklch(1 0 0)",
        "--preview-fg": theme.colors.foreground ?? "oklch(0.145 0 0)",
        "--preview-primary": theme.colors.primary ?? "oklch(0.205 0 0)",
        "--preview-sidebar-bg": theme.colors.sidebar_background ?? "oklch(0.985 0 0)",
        "--preview-sidebar-fg": theme.colors.sidebar_foreground ?? "oklch(0.145 0 0)",
        "--preview-accent": theme.colors.accent ?? "oklch(0.97 0 0)",
      } as React.CSSProperties}
    >
      <div className="flex h-[200px]">
        {/* Sidebar preview */}
        <div
          className="w-[160px] border-r p-3 flex flex-col gap-2"
          style={{ backgroundColor: "var(--preview-sidebar-bg)", color: "var(--preview-sidebar-fg)" }}
        >
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="max-h-6 object-contain self-start" />
          ) : (
            <span className="text-xs font-semibold">Your Project</span>
          )}
          <div className="space-y-1 mt-2">
            <div
              className="text-[10px] rounded px-2 py-1"
              style={{ backgroundColor: "var(--preview-accent)" }}
            >
              Getting Started
            </div>
            <div className="text-[10px] px-2 py-1 opacity-60">Installation</div>
            <div className="text-[10px] px-2 py-1 opacity-60">Configuration</div>
          </div>
        </div>
        {/* Content preview */}
        <div
          className="flex-1 p-4"
          style={{
            backgroundColor: "var(--preview-bg)",
            color: "var(--preview-fg)",
            fontFamily: FONT_OPTIONS.find((f) => f.id === theme.font)?.family ?? "system-ui",
          }}
        >
          <h2 className="text-sm font-bold mb-2" style={{ color: "var(--preview-fg)" }}>
            Getting Started
          </h2>
          <p className="text-[10px] leading-relaxed opacity-80">
            Welcome to the documentation. This is a preview of how your docs will look with the current theme settings applied.
          </p>
          <button
            className="mt-3 text-[10px] px-3 py-1 rounded"
            style={{
              backgroundColor: "var(--preview-primary)",
              color: theme.colors.primary_foreground ?? "oklch(0.985 0 0)",
            }}
          >
            Primary Button
          </button>
        </div>
      </div>
    </div>
  </CardContent>
</Card>
```

**Step 2: Verify preview updates live**

Run: `npm run dev`
Visit settings page. Change colors. Expected: Preview panel updates in real-time.

**Step 3: Commit**

```bash
git add components/dashboard/theme-editor.tsx
git commit -m "feat(ci): add live preview panel to theme editor"
```

---

### Task 10: Wire Settings into Dashboard Navigation

**Files:**
- Modify: `components/dashboard/app-sidebar.tsx` (verify Settings nav item already exists — it should from the previous plan)

**Step 1: Verify the Settings nav item exists**

In `components/dashboard/app-sidebar.tsx`, the `projectNav` array should already have a Settings entry from the previous plan:

```typescript
{
  title: "Settings",
  href: `/project/${currentProjectSlug}/settings`,
  icon: Settings,
},
```

If it exists, no change needed. If not, add it as the last item in `projectNav`.

**Step 2: Verify end-to-end flow**

1. Navigate to a project in the dashboard.
2. Click "Settings" in the sidebar.
3. Upload a logo, change primary color to a brand color (e.g., `#1a73e8`), select "Inter" font.
4. Click "Save Theme".
5. Click "View Public Site" in the sidebar.
6. Expected: Public docs show the logo, the brand color on primary elements, and Inter font.

**Step 3: Commit (only if changes needed)**

```bash
git add components/dashboard/app-sidebar.tsx
git commit -m "feat(ci): ensure settings nav item in dashboard sidebar"
```

---

## Summary

| Task | Description | Depends On |
|------|-------------|------------|
| 1 | Database migration: theme column + assets bucket | — |
| 2 | Theme type definitions and defaults | — |
| 3 | Theme update API endpoint | 1, 2 |
| 4 | Asset upload API endpoint | 1 |
| 5 | Settings page with full theme editor | 2, 3, 4, 6 |
| 6 | Install shadcn textarea + switch components | — |
| 7 | Apply theme to public docs layout | 1, 2 |
| 8 | Show logo in public docs sidebar | 7 |
| 9 | Live preview on settings page | 5 |
| 10 | Wire settings into dashboard navigation | 5 |
