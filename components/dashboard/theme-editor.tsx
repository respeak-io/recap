"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Upload, X, Save, RotateCcw } from "lucide-react";
import { type ProjectTheme, type ProjectThemeColors, FONT_OPTIONS } from "@/lib/theme";

interface ThemePreset {
  name: string;
  colors: Partial<ProjectThemeColors>;
  colorsDark: Partial<ProjectThemeColors>;
  font: ProjectTheme["font"];
}

const THEME_PRESETS: ThemePreset[] = [
  {
    name: "Default",
    colors: {},
    colorsDark: {},
    font: "geist",
  },
  {
    name: "Vercel",
    colors: {
      primary: "#171717",
      primary_foreground: "#ffffff",
      background: "#ffffff",
      foreground: "#171717",
      accent: "#ebebeb",
      sidebar_background: "#fafafa",
      sidebar_foreground: "#171717",
    },
    colorsDark: {
      primary: "#ededed",
      primary_foreground: "#000000",
      background: "#000000",
      foreground: "#ededed",
      accent: "#171717",
      sidebar_background: "#0a0a0a",
      sidebar_foreground: "#ededed",
    },
    font: "geist",
  },
  {
    name: "Stripe",
    colors: {
      primary: "#533afd",
      primary_foreground: "#ffffff",
      background: "#ffffff",
      foreground: "#061b31",
      accent: "#efeffe",
      sidebar_background: "#f6f9fc",
      sidebar_foreground: "#273951",
    },
    colorsDark: {
      primary: "#665efd",
      primary_foreground: "#ffffff",
      background: "#0d253d",
      foreground: "#efeffe",
      accent: "#1c1e54",
      sidebar_background: "#061b31",
      sidebar_foreground: "#b9b9f9",
    },
    font: "inter",
  },
  {
    name: "Notion",
    colors: {
      primary: "#0075de",
      primary_foreground: "#ffffff",
      background: "#ffffff",
      foreground: "#37352f",
      accent: "#f6f5f4",
      sidebar_background: "#f6f5f4",
      sidebar_foreground: "#37352f",
    },
    colorsDark: {
      primary: "#62aef0",
      primary_foreground: "#191918",
      background: "#191918",
      foreground: "#e7e7e5",
      accent: "#2f2f2e",
      sidebar_background: "#202020",
      sidebar_foreground: "#c9c9c7",
    },
    font: "inter",
  },
  {
    name: "Claude",
    colors: {
      primary: "#c96442",
      primary_foreground: "#ffffff",
      background: "#f5f4ed",
      foreground: "#141413",
      accent: "#e8e6dc",
      sidebar_background: "#faf9f5",
      sidebar_foreground: "#141413",
    },
    colorsDark: {
      primary: "#d97757",
      primary_foreground: "#141413",
      background: "#141413",
      foreground: "#faf9f5",
      accent: "#30302e",
      sidebar_background: "#1a1a19",
      sidebar_foreground: "#e8e6dc",
    },
    font: "source-serif",
  },
  {
    name: "Mintlify",
    colors: {
      primary: "#0fa76e",
      primary_foreground: "#ffffff",
      background: "#ffffff",
      foreground: "#0d0d0d",
      accent: "#d4fae8",
      sidebar_background: "#fafafa",
      sidebar_foreground: "#333333",
    },
    colorsDark: {
      primary: "#18e299",
      primary_foreground: "#0d0d0d",
      background: "#0d0d0d",
      foreground: "#fafafa",
      accent: "#1a1a1a",
      sidebar_background: "#141414",
      sidebar_foreground: "#a3a3a3",
    },
    font: "inter",
  },
  {
    name: "Linear",
    colors: {
      primary: "#5e6ad2",
      primary_foreground: "#ffffff",
      background: "#ffffff",
      foreground: "#1a1b23",
      accent: "#ebebff",
      sidebar_background: "#fafafb",
      sidebar_foreground: "#3c3e4a",
    },
    colorsDark: {
      primary: "#7170ff",
      primary_foreground: "#ffffff",
      background: "#08090a",
      foreground: "#f7f8f8",
      accent: "#28282c",
      sidebar_background: "#0f1011",
      sidebar_foreground: "#d0d6e0",
    },
    font: "inter",
  },
  {
    name: "Resend",
    colors: {
      primary: "#000000",
      primary_foreground: "#ffffff",
      background: "#ffffff",
      foreground: "#000000",
      accent: "#fafafa",
      sidebar_background: "#111111",
      sidebar_foreground: "#e5e5e5",
    },
    colorsDark: {
      primary: "#ffffff",
      primary_foreground: "#000000",
      background: "#000000",
      foreground: "#f0f0f0",
      accent: "#181818",
      sidebar_background: "#0a0a0a",
      sidebar_foreground: "#a1a4a5",
    },
    font: "geist",
  },
  {
    name: "Intercom",
    colors: {
      primary: "#ff5600",
      primary_foreground: "#ffffff",
      background: "#ffffff",
      foreground: "#111111",
      accent: "#faf9f6",
      sidebar_background: "#faf9f6",
      sidebar_foreground: "#313130",
    },
    colorsDark: {
      primary: "#ff7a33",
      primary_foreground: "#111111",
      background: "#111111",
      foreground: "#ffffff",
      accent: "#1a1a1a",
      sidebar_background: "#0b0b0b",
      sidebar_foreground: "#c9c9c7",
    },
    font: "inter",
  },
];

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

      {/* Theme Presets */}
      <Card>
        <CardHeader>
          <CardTitle>Theme Presets</CardTitle>
          <CardDescription>
            Pick a starting point, then customize. Clicking a preset updates colors and font but does not save automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {THEME_PRESETS.map((preset) => {
              const colorsMatch = (
                a: Partial<ProjectThemeColors>,
                b: Partial<ProjectThemeColors>
              ) =>
                Object.keys({ ...a, ...b }).every(
                  (k) =>
                    (a[k as keyof ProjectThemeColors] ?? undefined) ===
                    (b[k as keyof ProjectThemeColors] ?? undefined)
                );
              const isActive =
                theme.font === preset.font &&
                colorsMatch(theme.colors, preset.colors) &&
                colorsMatch(theme.colors_dark, preset.colorsDark);
              return (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() =>
                    setTheme((prev) => ({
                      ...prev,
                      colors: { ...preset.colors },
                      colors_dark: { ...preset.colorsDark },
                      font: preset.font,
                    }))
                  }
                  className={`rounded-lg border-2 overflow-hidden text-left transition-colors ${
                    isActive
                      ? "border-primary ring-2 ring-primary/20"
                      : "border-muted hover:border-muted-foreground/30"
                  }`}
                >
                  <div className="flex h-[80px]">
                    {/* Mini sidebar */}
                    <div
                      className="w-[36px] border-r p-1.5 flex flex-col gap-1"
                      style={{
                        backgroundColor: preset.colors.sidebar_background ?? "oklch(0.985 0 0)",
                        color: preset.colors.sidebar_foreground ?? "oklch(0.145 0 0)",
                      }}
                    >
                      <div
                        className="h-1 w-full rounded-sm"
                        style={{ backgroundColor: preset.colors.sidebar_foreground ?? "oklch(0.145 0 0)", opacity: 0.6 }}
                      />
                      <div
                        className="h-1 w-3/4 rounded-sm"
                        style={{ backgroundColor: preset.colors.sidebar_foreground ?? "oklch(0.145 0 0)", opacity: 0.3 }}
                      />
                      <div
                        className="h-1 w-3/4 rounded-sm"
                        style={{ backgroundColor: preset.colors.sidebar_foreground ?? "oklch(0.145 0 0)", opacity: 0.3 }}
                      />
                    </div>
                    {/* Mini content area */}
                    <div
                      className="flex-1 p-2 flex flex-col gap-1"
                      style={{
                        backgroundColor: preset.colors.background ?? "oklch(1 0 0)",
                        color: preset.colors.foreground ?? "oklch(0.145 0 0)",
                      }}
                    >
                      <div
                        className="h-1.5 w-3/4 rounded-sm"
                        style={{ backgroundColor: preset.colors.foreground ?? "oklch(0.145 0 0)", opacity: 0.7 }}
                      />
                      <div
                        className="h-1 w-full rounded-sm"
                        style={{ backgroundColor: preset.colors.foreground ?? "oklch(0.145 0 0)", opacity: 0.2 }}
                      />
                      <div
                        className="h-1 w-5/6 rounded-sm"
                        style={{ backgroundColor: preset.colors.foreground ?? "oklch(0.145 0 0)", opacity: 0.2 }}
                      />
                      <div
                        className="mt-auto h-4 w-12 rounded-sm"
                        style={{ backgroundColor: preset.colors.primary ?? "oklch(0.205 0 0)" }}
                      />
                    </div>
                  </div>
                  <div className="px-2 py-1.5 text-xs font-medium text-center border-t bg-muted/30">
                    {preset.name}
                  </div>
                </button>
              );
            })}
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
      <div className="flex gap-3">
        <Button
          variant="destructive"
          onClick={() =>
            setTheme((prev) => ({
              ...prev,
              colors: {},
              colors_dark: {},
              font: "geist",
              custom_css: null,
              hide_powered_by: false,
            }))
          }
        >
          <RotateCcw className="size-4 mr-2" />
          Reset to Default
        </Button>
        <div className="flex-1" />
        <Button variant="outline" onClick={() => router.refresh()}>
          Discard Changes
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="size-4 mr-2" />
          {saving ? "Saving..." : saved ? "Saved!" : "Save Theme"}
        </Button>
      </div>

      {/* Preview */}
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
    </div>
  );
}
