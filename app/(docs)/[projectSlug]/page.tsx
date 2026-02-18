import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DocsIndexPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectSlug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { projectSlug } = await params;
  const { lang = "en" } = await searchParams;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, slug")
    .eq("slug", projectSlug)
    .eq("is_public", true)
    .single();

  if (!project) notFound();

  const { data: articles } = await supabase
    .from("articles")
    .select("id, title, slug, chapter_id")
    .eq("project_id", project.id)
    .eq("language", lang)
    .eq("status", "published")
    .order("order");

  return (
    <div className="max-w-3xl mx-auto px-8 py-12">
      <h1 className="text-3xl font-bold mb-2">{project.name}</h1>
      <p className="text-muted-foreground mb-8">
        Welcome to the documentation.
      </p>
      {articles && articles.length > 0 ? (
        <div className="grid gap-3">
          {articles.map((article) => (
            <Link
              key={article.id}
              href={`/${projectSlug}/${article.slug}${lang !== "en" ? `?lang=${lang}` : ""}`}
            >
              <Card className="hover:border-primary transition-colors">
                <CardHeader className="py-3">
                  <CardTitle className="text-base">{article.title}</CardTitle>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">
          No published articles yet.
        </p>
      )}
    </div>
  );
}
