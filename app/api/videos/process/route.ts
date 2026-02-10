import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { uploadAndProcessVideo, extractVideoContent, getAI } from "@/lib/ai/gemini";
import { getDocGenerationPrompt } from "@/lib/ai/prompts";
import slugify from "slugify";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { videoId, audiences } = await request.json();

  // Get video record
  const { data: video } = await supabase
    .from("videos")
    .select("*, projects(*)")
    .eq("id", videoId)
    .single();

  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Update status to processing
  await supabase.from("videos").update({ status: "processing" }).eq("id", videoId);

  try {
    // Get signed URL for the video file
    const { data: urlData } = await supabase.storage
      .from("videos")
      .createSignedUrl(video.storage_path, 3600);

    // Step 1: Upload to Gemini and extract content
    const fileInfo = await uploadAndProcessVideo(urlData!.signedUrl);
    const segments = await extractVideoContent(fileInfo.uri!, fileInfo.mimeType!);

    // Save segments
    const segmentRows = segments.map(
      (seg: Record<string, unknown>, i: number) => ({
        video_id: videoId,
        start_time: seg.start_time,
        end_time: seg.end_time,
        spoken_content: seg.spoken_content,
        visual_context: seg.visual_context,
        order: i,
      })
    );
    await supabase.from("video_segments").insert(segmentRows);

    // Step 2: Generate docs for each audience
    for (const audience of audiences) {
      const prompt = getDocGenerationPrompt(audience, segments);

      const response = await getAI().models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json" },
      });

      const doc = JSON.parse(response.text!);

      // Create chapter and article records
      for (const chapter of doc.chapters) {
        const chapterSlug = slugify(chapter.title, {
          lower: true,
          strict: true,
        });

        const { data: chapterRow } = await supabase
          .from("chapters")
          .upsert(
            {
              project_id: video.project_id,
              title: chapter.title,
              slug: chapterSlug,
            },
            { onConflict: "project_id,slug" }
          )
          .select()
          .single();

        // Combine sections into Tiptap-compatible JSON and plain text
        const contentText = chapter.sections
          .map(
            (s: { heading: string; content: string }) =>
              `${s.heading}\n${s.content}`
          )
          .join("\n\n");

        const articleSlug = slugify(chapter.title, {
          lower: true,
          strict: true,
        });

        await supabase.from("articles").insert({
          project_id: video.project_id,
          video_id: videoId,
          chapter_id: chapterRow?.id,
          title: chapter.title,
          slug: articleSlug,
          audience,
          content_json: buildTiptapJson(chapter.sections),
          content_text: contentText,
          status: "draft",
        });
      }
    }

    // Mark video as ready
    await supabase
      .from("videos")
      .update({ status: "ready" })
      .eq("id", videoId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Video processing error:", error);
    await supabase
      .from("videos")
      .update({ status: "failed" })
      .eq("id", videoId);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

// Convert sections into basic Tiptap JSON structure
function buildTiptapJson(
  sections: { heading: string; content: string }[]
) {
  const content: Record<string, unknown>[] = [];
  for (const section of sections) {
    content.push({
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: section.heading }],
    });
    // Split content by paragraphs
    const paragraphs = section.content.split("\n\n");
    for (const para of paragraphs) {
      if (!para.trim()) continue;
      content.push({
        type: "paragraph",
        content: [{ type: "text", text: para }],
      });
    }
  }
  return { type: "doc", content };
}
