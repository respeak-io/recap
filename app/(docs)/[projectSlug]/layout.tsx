import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/docs/sidebar";
import { notFound } from "next/navigation";

export default async function DocsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectSlug: string }>;
}) {
  const { projectSlug } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select(
      "*, chapters(id, title, slug, order, articles(id, title, slug, audience, language, status))"
    )
    .eq("slug", projectSlug)
    .eq("is_public", true)
    .single();

  if (!project) notFound();

  // Sort chapters by order
  const chapters = (project.chapters ?? []).sort(
    (a: { order: number }, b: { order: number }) => a.order - b.order
  );

  // Only consider published articles for audience/language options
  type ArticleInfo = { audience: string; language: string; status: string };
  const publishedArticles: ArticleInfo[] = chapters.flatMap(
    (ch: { articles: ArticleInfo[] }) =>
      ch.articles.filter((a) => a.status === "published")
  );

  const audiences = [...new Set(publishedArticles.map((a) => a.audience))];
  const languages = [...new Set(publishedArticles.map((a) => a.language))];

  return (
    <div className="flex min-h-screen">
      <Sidebar
        projectId={project.id}
        projectName={project.name}
        projectSlug={projectSlug}
        chapters={chapters}
        audiences={audiences}
        languages={languages}
      />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
