import { describe, it, expect } from "vitest";
import {
  apiError,
  notFound,
  unauthorized,
  validationError,
  conflict,
  forbidden,
  internal,
} from "@/lib/api/errors";

async function parseResponse(res: Response) {
  return { status: res.status, body: await res.json() };
}

describe("apiError", () => {
  it("returns Response with JSON body and status", async () => {
    const res = apiError("Something broke", "INTERNAL", 500);
    const { status, body } = await parseResponse(res);
    expect(status).toBe(500);
    expect(body.error).toBe("Something broke");
    expect(body.code).toBe("INTERNAL");
  });
});

describe("convenience helpers", () => {
  it("notFound returns 404", async () => {
    const { status, body } = await parseResponse(notFound());
    expect(status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
  });

  it("notFound accepts custom message", async () => {
    const { body } = await parseResponse(notFound("Video not found"));
    expect(body.error).toBe("Video not found");
  });

  it("unauthorized returns 401", async () => {
    const { status, body } = await parseResponse(unauthorized());
    expect(status).toBe(401);
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("validationError returns 422", async () => {
    const { status, body } = await parseResponse(
      validationError("title is required")
    );
    expect(status).toBe(422);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.error).toBe("title is required");
  });

  it("conflict returns 409", async () => {
    const { status } = await parseResponse(conflict("Already exists"));
    expect(status).toBe(409);
  });

  it("forbidden returns 403", async () => {
    const { status } = await parseResponse(forbidden());
    expect(status).toBe(403);
  });

  it("internal returns 500", async () => {
    const { status } = await parseResponse(internal());
    expect(status).toBe(500);
  });
});
