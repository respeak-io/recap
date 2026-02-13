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

export function DocsThemeProvider({
  theme,
  logoUrl,
  faviconUrl,
  projectName,
  children,
}: DocsThemeProviderProps) {
  const colorMap: Record<keyof ProjectThemeColors, string> = {
    primary: "--primary",
    primary_foreground: "--primary-foreground",
    background: "--background",
    foreground: "--foreground",
    accent: "--accent",
    sidebar_background: "--sidebar",
    sidebar_foreground: "--sidebar-foreground",
  };

  // Collect CSS variable overrides
  const cssVars: [string, string][] = [];
  for (const [key, cssVar] of Object.entries(colorMap)) {
    const value = theme.colors[key as keyof ProjectThemeColors];
    if (value) {
      cssVars.push([cssVar, value]);
    }
  }

  const fontOption = FONT_OPTIONS.find((f) => f.id === theme.font);
  if (fontOption && theme.font !== "geist") {
    cssVars.push(["--font-sans", fontOption.family]);
  }

  // Apply CSS variables directly on <html> element to guarantee they override
  // :root definitions regardless of stylesheet ordering (React 19 hoists <style>
  // to <head> which can end up before global CSS, losing the cascade).
  useEffect(() => {
    const root = document.documentElement;
    for (const [prop, value] of cssVars) {
      root.style.setProperty(prop, value);
    }
    return () => {
      for (const [prop] of cssVars) {
        root.style.removeProperty(prop);
      }
    };
  });

  // Also emit a <style> block for SSR so the initial paint has correct colors
  const themeStylesheet = cssVars.length > 0
    ? `:root { ${cssVars.map(([p, v]) => `${p}: ${v} !important;`).join(" ")} }`
    : "";

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

      {faviconUrl && (
        <link rel="icon" href={faviconUrl} />
      )}

      {children}

      {theme.custom_css && (
        <style dangerouslySetInnerHTML={{ __html: theme.custom_css }} />
      )}
    </>
  );
}
