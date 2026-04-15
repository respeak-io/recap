"use client";

import { useEffect } from "react";
import { type ProjectTheme, type ProjectThemeColors, FONT_OPTIONS } from "@/lib/theme";

interface DocsThemeProviderProps {
  theme: ProjectTheme;
  logoUrl: string | null;
  faviconUrl: string | null;
  projectName: string;
  children: React.ReactNode;
}

const COLOR_MAP: Record<keyof ProjectThemeColors, string> = {
  primary: "--primary",
  primary_foreground: "--primary-foreground",
  background: "--background",
  foreground: "--foreground",
  accent: "--accent",
  sidebar_background: "--sidebar",
  sidebar_foreground: "--sidebar-foreground",
};

/**
 * Build the list of [cssVar, value] overrides for a single color mode.
 * Derives Card, Popover, Muted, Border, Input, Ring and muted/card text from
 * background + foreground so shadcn components adapt instead of falling back
 * to the global :root light defaults.
 */
function buildModeVars(colors: Partial<ProjectThemeColors>): [string, string][] {
  const out: [string, string][] = [];
  for (const [key, cssVar] of Object.entries(COLOR_MAP)) {
    const value = colors[key as keyof ProjectThemeColors];
    if (value) out.push([cssVar, value]);
  }
  const bg = colors.background;
  const fg = colors.foreground;
  if (bg) {
    out.push(["--card", bg]);
    out.push(["--popover", bg]);
  }
  if (fg) {
    out.push(["--card-foreground", fg]);
    out.push(["--popover-foreground", fg]);
    out.push(["--accent-foreground", fg]);
  }
  if (bg && fg) {
    out.push(["--muted", `color-mix(in oklch, ${fg} 5%, ${bg})`]);
    out.push(["--muted-foreground", `color-mix(in oklch, ${fg} 60%, ${bg})`]);
    out.push(["--border", `color-mix(in oklch, ${fg} 12%, ${bg})`]);
    out.push(["--input", `color-mix(in oklch, ${fg} 15%, ${bg})`]);
    out.push(["--ring", `color-mix(in oklch, ${fg} 35%, ${bg})`]);
  }
  return out;
}

export function DocsThemeProvider({
  theme,
  logoUrl: _logoUrl,
  faviconUrl: _faviconUrl,
  projectName: _projectName,
  children,
}: DocsThemeProviderProps) {
  const lightVars = buildModeVars(theme.colors);
  const darkVars = buildModeVars(theme.colors_dark);

  const fontOption = FONT_OPTIONS.find((f) => f.id === theme.font);
  if (fontOption && theme.font !== "geist") {
    lightVars.push(["--font-sans", fontOption.family]);
    darkVars.push(["--font-sans", fontOption.family]);
  }

  // Always apply preset-generated vars via CSS classes so the dark-mode toggle
  // keeps working. We use `.dark` for dark overrides and rely on Tailwind's
  // existing light/dark switch in globals.css.
  const sections: string[] = [];
  if (lightVars.length > 0) {
    sections.push(
      `:root { ${lightVars.map(([p, v]) => `${p}: ${v} !important;`).join(" ")} }`
    );
  }
  if (darkVars.length > 0) {
    sections.push(
      `.dark { ${darkVars.map(([p, v]) => `${p}: ${v} !important;`).join(" ")} }`
    );
  }
  const themeStylesheet = sections.join("\n");

  // Also imperatively set on <html> so that client-side nav paints before the
  // SSR stylesheet flushes. Only set the light-mode vars — the `.dark` block
  // is scoped to the class and handled by CSS.
  useEffect(() => {
    const root = document.documentElement;
    for (const [prop, value] of lightVars) {
      root.style.setProperty(prop, value);
    }
    return () => {
      for (const [prop] of lightVars) {
        root.style.removeProperty(prop);
      }
    };
  });

  return (
    <>
      {themeStylesheet && (
        <style dangerouslySetInnerHTML={{ __html: themeStylesheet }} />
      )}

      {fontOption && "googleFont" in fontOption && fontOption.googleFont && (
        <link
          rel="stylesheet"
          href={`https://fonts.googleapis.com/css2?family=${fontOption.googleFont}&display=swap`}
        />
      )}

      {children}

      {theme.custom_css && (
        <style dangerouslySetInnerHTML={{ __html: theme.custom_css }} />
      )}
    </>
  );
}
