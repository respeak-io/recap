import { describe, it, expect, vi } from "vitest";

// Mock transitive dependencies that require workspace packages
vi.mock("@/lib/ai/gemini", () => ({
  getAI: vi.fn(),
  uploadAndProcessVideo: vi.fn(),
  extractVideoContent: vi.fn(),
}));
vi.mock("@/lib/ai/generate", () => ({
  generateText: vi.fn().mockResolvedValue("{}"),
}));
vi.mock("@/lib/ai/prompts", () => ({
  getDocGenerationPrompt: vi.fn().mockReturnValue("prompt"),
}));

const { runVideoPipeline } = await import("@/lib/services/video-pipeline");
const { createProgressReporter } = await import(
  "@/lib/services/video-pipeline/progress"
);

import type {
  PipelineContext,
  ProgressReporter,
  Segment,
  ArticleData,
} from "@/lib/services/video-pipeline/types";

describe("runVideoPipeline", () => {
  it("is exported as a function", () => {
    expect(typeof runVideoPipeline).toBe("function");
  });
});

describe("createProgressReporter", () => {
  it("creates a reporter with an update method", () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({}),
        }),
      }),
    };
    const reporter = createProgressReporter(mockDb as never, "job-123");
    expect(typeof reporter.update).toBe("function");
  });

  it("calls db.from(processing_jobs).update().eq() on update", async () => {
    const eqMock = vi.fn().mockResolvedValue({});
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
    const fromMock = vi.fn().mockReturnValue({ update: updateMock });
    const mockDb = { from: fromMock };

    const reporter = createProgressReporter(mockDb as never, "job-456");
    await reporter.update({
      step: "uploading",
      step_message: "Uploading...",
      progress: 0.1,
    });

    expect(fromMock).toHaveBeenCalledWith("processing_jobs");
    expect(updateMock).toHaveBeenCalledWith({
      step: "uploading",
      step_message: "Uploading...",
      progress: 0.1,
    });
    expect(eqMock).toHaveBeenCalledWith("id", "job-456");
  });
});

describe("PipelineContext type", () => {
  it("accepts a minimal context shape", () => {
    const ctx: PipelineContext = {
      db: {} as PipelineContext["db"],
      videoId: "test-video-id",
      projectId: "test-project-id",
      languages: ["en", "de"],
    };
    expect(ctx.videoId).toBe("test-video-id");
    expect(ctx.languages).toContain("en");
  });

  it("accepts optional accumulated state", () => {
    const seg: Segment = {
      start_time: 0,
      end_time: 5,
      spoken_content: "hello",
      visual_context: "screen",
    };
    const article: ArticleData = {
      chapterId: "ch1",
      title: "Test",
      slug: "test",
      contentJson: { type: "doc", content: [] },
      contentText: "Test content",
    };
    const ctx: PipelineContext = {
      db: {} as PipelineContext["db"],
      videoId: "v1",
      projectId: "p1",
      languages: ["en"],
      segments: [seg],
      vtt: "WEBVTT\n\n",
      vttLanguages: { en: "WEBVTT\n\n" },
      articles: [article],
    };
    expect(ctx.segments).toHaveLength(1);
    expect(ctx.articles).toHaveLength(1);
  });
});

describe("ProgressReporter interface", () => {
  it("can be implemented with a mock", async () => {
    const mockUpdate = vi.fn();
    const reporter: ProgressReporter = { update: mockUpdate };

    await reporter.update({
      step: "test",
      step_message: "Testing...",
      progress: 0.5,
    });

    expect(mockUpdate).toHaveBeenCalledWith({
      step: "test",
      step_message: "Testing...",
      progress: 0.5,
    });
  });
});
