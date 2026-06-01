import { generateLlmsTxt } from "@/lib/llms-txt";
import { NextResponse } from "next/server";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ locale: string; projectSlug: string }> }
) {
  const { locale, projectSlug } = await params;
  const content = await generateLlmsTxt(projectSlug, locale);

  if (!content) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(content, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
