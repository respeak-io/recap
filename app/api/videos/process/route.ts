import { createClient } from "@/lib/supabase/server";
import { uploadAndProcessVideo, extractVideoContent, getAI } from "@/lib/ai/gemini";
import { getDocGenerationPrompt } from "@/lib/ai/prompts";
import { markdownToTiptap } from "@/lib/ai/markdown-to-tiptap";
import slugify from "slugify";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { videoId, audiences } = await request.json();

  const { data: video } = await supabase
    .from("videos")
    .select("*, projects(*)")
    .eq("id", videoId)
    .single();

  if (!video) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  await supabase.from("videos").update({ status: "processing" }).eq("id", videoId);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        send({ step: "uploading", message: "Uploading video to AI...", progress: 0.1 });

        const { data: urlData } = await supabase.storage
          .from("videos")
          .createSignedUrl(video.storage_path, 3600);

        const fileInfo = await uploadAndProcessVideo(urlData!.signedUrl);

        send({ step: "transcribing", message: "Extracting content from video...", progress: 0.3 });

        const segments = await extractVideoContent(fileInfo.uri!, fileInfo.mimeType!);

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

        const progressPerAudience = 0.6 / audiences.length;
        let currentProgress = 0.35;

        for (const audience of audiences) {
          send({
            step: "generating_docs",
            message: `Generating ${audience} documentation...`,
            audience,
            progress: currentProgress,
          });

          const prompt = getDocGenerationPrompt(audience, segments);

          const response = await getAI().models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { responseMimeType: "application/json" },
          });

          const doc = JSON.parse(response.text!);

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
              content_json: markdownToTiptap(chapter.sections),
              content_text: contentText,
              status: "draft",
            });
          }

          currentProgress += progressPerAudience;
        }

        await supabase
          .from("videos")
          .update({ status: "ready" })
          .eq("id", videoId);

        send({ step: "complete", message: "Processing complete!", progress: 1.0 });
      } catch (error) {
        console.error("Video processing error:", error);
        await supabase
          .from("videos")
          .update({ status: "failed" })
          .eq("id", videoId);
        send({
          step: "error",
          message: error instanceof Error ? error.message : "Processing failed",
          progress: 0,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
