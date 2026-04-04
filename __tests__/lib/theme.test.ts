import { describe, it, expect } from "vitest";
import { resolveTheme, themeToCssVars, DEFAULT_THEME } from "@/lib/theme";

describe("resolveTheme", () => {
  it("returns defaults when stored is null", () => {
    expect(resolveTheme(null)).toEqual(DEFAULT_THEME);
  });

  it("merges stored values with defaults", () => {
    const result = resolveTheme({ font: "inter", logo_path: "/logo.png" });
    expect(result.font).toBe("inter");
    expect(result.logo_path).toBe("/logo.png");
    expect(result.favicon_path).toBeNull();
    expect(result.colors).toEqual({});
    expect(result.hide_powered_by).toBe(false);
  });

  it("preserves partial colors", () => {
    const result = resolveTheme({ colors: { primary: "#ff0000" } });
    expect(result.colors.primary).toBe("#ff0000");
    expect(result.colors.background).toBeUndefined();
  });
});

describe("themeToCssVars", () => {
  it("returns empty string for no colors", () => {
    expect(themeToCssVars({})).toBe("");
  });

  it("generates CSS custom properties for provided colors", () => {
    const result = themeToCssVars({
      primary: "#ff0000",
      background: "#ffffff",
    });
    expect(result).toContain("--primary: #ff0000;");
    expect(result).toContain("--background: #ffffff;");
  });

  it("skips undefined color fields", () => {
    const result = themeToCssVars({ primary: "#ff0000" });
    expect(result).not.toContain("--background");
    expect(result).not.toContain("--foreground");
  });
});
