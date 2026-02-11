import { createClient } from "@/lib/supabase/server";
import { getProjectVideos } from "@/lib/queries/videos";
import { BreadcrumbNav } from "@/components/dashboard/breadcrumb-nav";
import { ArticleTree } from "@/components/dashboard/article-tree";
import { VideoGallery } from "@/components/dashboard/video-gallery";
import { Separator } from "@/components/ui/separator";
import { notFound } from "next/navigation";

export default async function ArticlesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, slug")
    .eq("slug", slug)
    .single();

  if (!project) notFound();

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, title, slug, order")
    .eq("project_id", project.id)
    .order("order");

  const { data: articles } = await supabase
    .from("articles")
    .select("id, title, slug, audience, language, status, order, chapter_id")
    .eq("project_id", project.id)
    .order("order");

  const videos = await getProjectVideos(project.id);

  const allArticles = articles ?? [];
  const audiences = [...new Set(allArticles.map((a) => a.audience))];
  const languages = [...new Set(allArticles.map((a) => a.language))];

  return (
    <>
      <BreadcrumbNav
        projectName={project.name}
        projectSlug={slug}
        items={[{ label: "Articles" }]}
      />
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Articles</h1>
        <ArticleTree
          projectSlug={slug}
          chapters={chapters ?? []}
          articles={allArticles}
          audiences={audiences}
          languages={languages}
        />
        <Separator className="my-6" />
        <VideoGallery videos={videos} />
      </div>
    </>
  );
}
