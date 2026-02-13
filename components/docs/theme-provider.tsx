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
