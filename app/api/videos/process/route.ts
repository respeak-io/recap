import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { uploadAndProcessVideo, extractVideoContent, getAI } from "@/lib/ai/gemini";
import { getDocGenerationPrompt } from "@/lib/ai/prompts";
import { markdownToTiptap } from "@/lib/ai/markdown-to-tiptap";
import { segmentsToVtt } from "@/lib/vtt";
import { translateTiptapJson, translateVtt } from "@/lib/ai/translate";
import { after } from "next/server";
import slugify from "slugify";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { videoId, languages = ["en"] } = await request.json();

  const { data: video } = await supabase
    .from("videos")
    .select("*, projects(id)")
    .eq("id", videoId)
    .single();

  if (!video) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const projectId = (video.projects as { id: string }).id;

  // Create processing job
  const { data: job, error: jobError } = await supabase
    .from("processing_jobs")
    .insert({
      project_id: projectId,
      video_id: videoId,
      status: "pending",
      languages,
    })
    .select()
    .single();

  if (jobError || !job) {
    return Response.json({ error: "Failed to create job" }, { status: 500 });
  }

  // Mark video as processing
  await supabase.from("videos").update({ status: "processing" }).eq("id", videoId);

  // Run processing in background after response is sent
  after(async () => {
    const db = createServiceClient();

    async function updateJob(updates: Record<string, unknown>) {
      await db.from("processing_jobs").update(updates).eq("id", job.id);
    }

    try {
      await updateJob({
        status: "processing",
        started_at: new Date().toISOString(),
        step: "uploading",
        step_message: "Uploading video to AI...",
        progress: 0.05,
      });

      const { data: urlData } = await db.storage
        .from("videos")
        .createSignedUrl(video.storage_path, 3600);

      const fileInfo = await uploadAndProcessVideo(urlData!.signedUrl);

      await updateJob({
        step: "transcribing",
        step_message: "Extracting content from video...",
        progress: 0.2,
      });

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
      await db.from("video_segments").insert(segmentRows);

      // Generate VTT from segments
      const vtt = segmentsToVtt(
        segments.map((s: Record<string, unknown>) => ({
          start_time: s.start_time as number,
          end_time: s.end_time as number,
          spoken_content: s.spoken_content as string,
        }))
      );

      const vttLanguages: Record<string, string> = { en: vtt };

      await db
        .from("videos")
        .update({ vtt_content: vtt, vtt_languages: vttLanguages })
        .eq("id", videoId);

      // Generate docs
      await updateJob({
        step: "generating_docs",
        step_message: "Generating documentation...",
        progress: 0.3,
      });

      const prompt = getDocGenerationPrompt(segments);

      const response = await getAI().models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json" },
      });

      // Gemini sometimes emits control characters inside JSON string values.
      // Strip them before parsing to avoid SyntaxError.
      const sanitizedJson = response.text!.replace(/[\x00-\x1f\x7f]/g, (ch) =>
        ch === "\n" || ch === "\r" || ch === "\t" ? ch : ""
      );
      const doc = JSON.parse(sanitizedJson);

      const createdArticles: {
        chapterId: string | null;
        title: string;
        slug: string;
        contentJson: Record<string, unknown>;
        contentText: string;
      }[] = [];

      for (const chapter of doc.chapters) {
        const chapterSlug = slugify(chapter.title, { lower: true, strict: true });

        const { data: chapterRow } = await db
          .from("chapters")
          .upsert(
            {
              project_id: projectId,
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

        const articleSlug = slugify(chapter.title, { lower: true, strict: true });
        const contentJson = markdownToTiptap(chapter.sections);

        await db.from("articles").insert({
          project_id: projectId,
          video_id: videoId,
          chapter_id: chapterRow?.id,
          title: chapter.title,
          slug: articleSlug,
          language: "en",
          content_json: contentJson,
          content_text: contentText,
          status: "draft",
        });

        createdArticles.push({
          chapterId: chapterRow?.id ?? null,
          title: chapter.title,
          slug: articleSlug,
          contentJson,
          contentText,
        });
      }

      // Translate to all non-English target languages
      const targetLanguages = languages.filter((l: string) => l !== "en");
      const progressPerLang = 0.4 / Math.max(targetLanguages.length, 1);
      let currentProgress = 0.55;

      for (const lang of targetLanguages) {
        await updateJob({
          step: "translating",
          step_message: `Translating to ${lang}...`,
          progress: currentProgress,
        });

        try {
          const translatedVtt = await translateVtt(vtt, lang);
          vttLanguages[lang] = translatedVtt;
        } catch (e) {
          console.error(`VTT translation to ${lang} failed:`, e);
        }

        for (const article of createdArticles) {
          try {
            const {
              json: translatedJson,
              text: translatedText,
              title: translatedTitle,
            } = await translateTiptapJson(
              article.contentJson,
              article.contentText,
              lang,
              article.title
            );

            await db.from("articles").insert({
              project_id: projectId,
              video_id: videoId,
              chapter_id: article.chapterId,
              title: translatedTitle ?? article.title,
              slug: article.slug,
              language: lang,
              content_json: translatedJson,
              content_text: translatedText,
              status: "draft",
            });
          } catch (e) {
            console.error(
              `Translation of "${article.title}" to ${lang} failed:`,
              e
            );
          }
        }

        currentProgress += progressPerLang;
      }

      // Save all VTT translations
      await db
        .from("videos")
        .update({ vtt_languages: vttLanguages })
        .eq("id", videoId);

      await db
        .from("videos")
        .update({ status: "ready" })
        .eq("id", videoId);

      await updateJob({
        status: "completed",
        step: "complete",
        step_message: "Processing complete!",
        progress: 1.0,
        completed_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Video processing error:", error);
      await db
        .from("videos")
        .update({ status: "failed" })
        .eq("id", videoId);
      await updateJob({
        status: "failed",
        step: "error",
        step_message:
          error instanceof Error ? error.message : "Processing failed",
        error_message:
          error instanceof Error ? error.message : "Processing failed",
        progress: 0,
        completed_at: new Date().toISOString(),
      });
    }
  });

  // Return immediately with job ID
  return Response.json({ jobId: job.id });
}
