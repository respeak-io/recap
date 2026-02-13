import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/docs/sidebar";
import { DocsThemeProvider } from "@/components/docs/theme-provider";
import { resolveTheme } from "@/lib/theme";
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

  // Resolve theme
  const theme = resolveTheme(project.theme as Record<string, unknown>);

  // Get asset URLs
  let logoUrl: string | null = null;
  let faviconUrl: string | null = null;
  if (theme.logo_path) {
    const { data } = supabase.storage.from("assets").getPublicUrl(theme.logo_path);
    logoUrl = data.publicUrl;
  }
  if (theme.favicon_path) {
    const { data } = supabase.storage.from("assets").getPublicUrl(theme.favicon_path);
    faviconUrl = data.publicUrl;
  }

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
    <DocsThemeProvider
      theme={theme}
      logoUrl={logoUrl}
      faviconUrl={faviconUrl}
      projectName={project.name}
    >
      <div className="flex min-h-screen">
        <Sidebar
          projectId={project.id}
          projectName={project.name}
          projectSlug={projectSlug}
          chapters={chapters}
          audiences={audiences}
          languages={languages}
          logoUrl={logoUrl}
        />
        <div className="flex-1 min-w-0">
          {children}
          {!theme.hide_powered_by && (
            <footer className="border-t px-8 py-4 text-xs text-muted-foreground text-center">
              Powered by vidtodoc
            </footer>
          )}
        </div>
      </div>
    </DocsThemeProvider>
  );
}
