import { describe, it, expect } from "vitest";
import { parseDeterministic } from "../src/record/action-translator.js";

describe("parseDeterministic", () => {
  it("parses 'navigate to /path'", () => {
    const result = parseDeterministic("navigate to /dashboard");
    expect(result).toEqual({ type: "navigate", path: "/dashboard" });
  });

  it("parses 'navigate to /nested/path'", () => {
    const result = parseDeterministic("navigate to /project/settings");
    expect(result).toEqual({ type: "navigate", path: "/project/settings" });
  });

  it("parses 'click button' with single quotes", () => {
    const result = parseDeterministic("click button 'New Project'");
    expect(result).toEqual({ type: "click_button", name: "New Project" });
  });

  it("parses 'click link'", () => {
    const result = parseDeterministic("click link 'Dashboard'");
    expect(result).toEqual({ type: "click_link", name: "Dashboard" });
  });

  it("parses generic 'click' with quoted text", () => {
    const result = parseDeterministic("click 'Save Changes'");
    expect(result).toEqual({ type: "click_text", name: "Save Changes" });
  });

  it("parses 'fill input' with name selector", () => {
    const result = parseDeterministic("fill input[name='email'] with 'test@example.com'");
    expect(result).toEqual({
      type: "fill",
      selector: "input[name='email']",
      value: "test@example.com",
    });
  });

  it("parses 'select from' dropdown", () => {
    const result = parseDeterministic("select 'English' from 'Language'");
    expect(result).toEqual({
      type: "select",
      option: "English",
      label: "Language",
    });
  });

  it("parses 'wait N'", () => {
    const result = parseDeterministic("wait 3000");
    expect(result).toEqual({ type: "wait", ms: 3000 });
  });

  it("returns null for unrecognized actions", () => {
    const result = parseDeterministic("hover over the menu icon in the top left");
    expect(result).toBeNull();
  });

  it("returns null for natural language navigate (no path)", () => {
    const result = parseDeterministic("navigate to the settings page");
    expect(result).toBeNull();
  });
});
