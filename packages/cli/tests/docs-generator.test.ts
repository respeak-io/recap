import { describe, it, expect } from "vitest";
import { assembleRawDoc } from "../src/produce/docs-generator.js";

describe("assembleRawDoc", () => {
  it("creates markdown from feature steps", () => {
    const md = assembleRawDoc({
      title: "Creating a Project",
      steps: [
        { action: "navigate to /dashboard", narration: "Open the dashboard.", screenshot: "step-0.png" },
        { action: "click button 'New'", narration: "Click new project.", screenshot: "step-1.png" },
      ],
    });

    expect(md).toContain("# Creating a Project");
    expect(md).toContain("Open the dashboard.");
    expect(md).toContain("Click new project.");
    expect(md).toContain("step-0.png");
  });

  it("handles steps without screenshots", () => {
    const md = assembleRawDoc({
      title: "Test Feature",
      steps: [{ action: "navigate to /", narration: "Go to home." }],
    });

    expect(md).toContain("# Test Feature");
    expect(md).toContain("Go to home.");
    expect(md).not.toContain("![");
  });
});
