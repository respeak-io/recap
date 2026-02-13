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
