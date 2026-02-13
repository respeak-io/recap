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
