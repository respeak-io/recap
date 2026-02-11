import { createClient } from "@/lib/supabase/server";
import { uploadAndProcessVideo, extractVideoContent, getAI } from "@/lib/ai/gemini";
import { getDocGenerationPrompt } from "@/lib/ai/prompts";
import { markdownToTiptap } from "@/lib/ai/markdown-to-tiptap";
import { segmentsToVtt } from "@/lib/vtt";
import { translateTiptapJson, translateVtt } from "@/lib/ai/translate";
import slugify from "slugify";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { videoId, audiences, languages = ["en"] } = await request.json();

  const primaryLanguage: string = languages[0] ?? "en";
  const additionalLanguages: string[] = languages.slice(1);

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
        send({ step: "uploading", message: "Uploading video to AI...", progress: 0.05 });

        const { data: urlData } = await supabase.storage
          .from("videos")
          .createSignedUrl(video.storage_path, 3600);

        const fileInfo = await uploadAndProcessVideo(urlData!.signedUrl);

        send({ step: "transcribing", message: "Extracting content from video...", progress: 0.2 });

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

        // Generate VTT from segments
        const vtt = segmentsToVtt(
          segments.map((s: Record<string, unknown>) => ({
            start_time: s.start_time as number,
            end_time: s.end_time as number,
            spoken_content: s.spoken_content as string,
          }))
        );

        const vttLanguages: Record<string, string> = { [primaryLanguage]: vtt };

        await supabase
          .from("videos")
          .update({ vtt_content: vtt, vtt_languages: vttLanguages })
          .eq("id", videoId);

        // Calculate progress allocation
        const totalAudienceSteps = audiences.length * (1 + additionalLanguages.length);
        const progressPerStep = 0.6 / Math.max(totalAudienceSteps, 1);
        let currentProgress = 0.25;

        // Track created articles for translation
        const createdArticles: {
          audience: string;
          chapterId: string | null;
          title: string;
          slug: string;
          contentJson: Record<string, unknown>;
          contentText: string;
        }[] = [];

        // Generate docs for each audience in primary language
        for (const audience of audiences) {
          send({
            step: "generating_docs",
            message: `Generating ${audience} documentation (${primaryLanguage})...`,
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

            const contentJson = markdownToTiptap(chapter.sections);

            await supabase.from("articles").insert({
              project_id: video.project_id,
              video_id: videoId,
              chapter_id: chapterRow?.id,
              title: chapter.title,
              slug: articleSlug,
              audience,
              language: primaryLanguage,
              content_json: contentJson,
              content_text: contentText,
              status: "draft",
            });

            createdArticles.push({
              audience,
              chapterId: chapterRow?.id ?? null,
              title: chapter.title,
              slug: articleSlug,
              contentJson,
              contentText,
            });
          }

          currentProgress += progressPerStep;
        }

        // Translate to additional languages
        for (const lang of additionalLanguages) {
          send({
            step: "translating",
            message: `Translating to ${lang}...`,
            language: lang,
            progress: currentProgress,
          });

          // Translate VTT
          try {
            const translatedVtt = await translateVtt(vtt, lang);
            vttLanguages[lang] = translatedVtt;
          } catch (e) {
            console.error(`VTT translation to ${lang} failed:`, e);
          }

          // Translate each article
          for (const article of createdArticles) {
            try {
              const { json: translatedJson, text: translatedText } =
                await translateTiptapJson(
                  article.contentJson,
                  article.contentText,
                  lang
                );

              await supabase.from("articles").insert({
                project_id: video.project_id,
                video_id: videoId,
                chapter_id: article.chapterId,
                title: article.title,
                slug: article.slug,
                audience: article.audience,
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

          currentProgress += progressPerStep * audiences.length;
        }

        // If ai-agents audience was selected but English wasn't in the
        // language list, auto-translate ai-agents articles to English so
        // llms.txt always has content.
        const needsEnglishForLlms =
          audiences.includes("ai-agents") && !languages.includes("en");
        if (needsEnglishForLlms) {
          send({
            step: "translating",
            message: "Translating ai-agents docs to English for llms.txt...",
            language: "en",
            progress: currentProgress,
          });

          const aiAgentArticles = createdArticles.filter(
            (a) => a.audience === "ai-agents"
          );
          for (const article of aiAgentArticles) {
            try {
              const { json: translatedJson, text: translatedText } =
                await translateTiptapJson(
                  article.contentJson,
                  article.contentText,
                  "en"
                );

              await supabase.from("articles").insert({
                project_id: video.project_id,
                video_id: videoId,
                chapter_id: article.chapterId,
                title: article.title,
                slug: article.slug,
                audience: "ai-agents",
                language: "en",
                content_json: translatedJson,
                content_text: translatedText,
                status: "draft",
              });
            } catch (e) {
              console.error(
                `English translation of "${article.title}" for llms.txt failed:`,
                e
              );
            }
          }
        }

        // Save all VTT translations
        await supabase
          .from("videos")
          .update({ vtt_languages: vttLanguages })
          .eq("id", videoId);

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
