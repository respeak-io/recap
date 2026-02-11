import { generateLlmsTxt } from "@/lib/llms-txt";
import { NextResponse } from "next/server";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const { projectSlug } = await params;
  const content = await generateLlmsTxt(projectSlug);

  if (!content) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(content, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
