import { generateLlmsFullTxt } from "@/lib/llms-txt";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const { projectSlug } = await params;
  const { searchParams } = new URL(request.url);
  const lang = searchParams.get("lang") ?? "en";
  const content = await generateLlmsFullTxt(projectSlug, lang);

  if (!content) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(content, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
