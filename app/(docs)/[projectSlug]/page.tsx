import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight, FileText } from "lucide-react";

interface Chapter {
  id: string;
  title: string;
  slug: string;
  description: string;
  order: number;
  group?: string;
  translations?: Record<
    string,
    { title?: string; description?: string; group?: string }
  > | null;
  articles: {
    id: string;
    title: string;
    description: string;
    slug: string;
    language: string;
    status: string;
    order: number;
  }[];
}

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
    .select(
      "id, name, slug, subtitle, translations, chapters(id, title, slug, description, order, \"group\", translations, articles(id, title, description, slug, language, status, \"order\"))"
    )
    .eq("slug", projectSlug)
    .eq("is_public", true)
    .single();

  if (!project) notFound();

  const qs = lang !== "en" ? `?lang=${lang}` : "";
  const projectTranslations = project.translations as Record<string, { name?: string; subtitle?: string }> | null;
  const resolvedName = projectTranslations?.[lang]?.name || project.name;
  const resolvedSubtitle = projectTranslations?.[lang]?.subtitle || project.subtitle;

  // Filter and sort chapters with published articles in the current language
  const chapters = ((project.chapters ?? []) as Chapter[])
    .map((ch) => ({
      ...ch,
      resolvedTitle: ch.translations?.[lang]?.title ?? ch.title,
      resolvedDescription:
        ch.translations?.[lang]?.description ?? ch.description,
      resolvedGroup: ch.translations?.[lang]?.group ?? ch.group,
      articles: ch.articles
        .filter((a) => a.language === lang && a.status === "published")
        .sort((a, b) => a.order - b.order),
    }))
    .filter((ch) => ch.articles.length > 0)
    .sort((a, b) => a.order - b.order);

  // Group chapters by their group field
  const grouped: { group: string | undefined; chapters: typeof chapters }[] =
    [];
  for (const ch of chapters) {
    const g = ch.resolvedGroup ?? undefined;
    const existing = grouped.find((gr) => gr.group === g);
    if (existing) {
      existing.chapters.push(ch);
    } else {
      grouped.push({ group: g, chapters: [ch] });
    }
  }

  const totalArticles = chapters.reduce(
    (sum, ch) => sum + ch.articles.length,
    0
  );

  return (
    <div className="max-w-4xl mx-auto px-8 py-12">
      {/* Hero */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight mb-2">
          {resolvedName}
        </h1>
        {resolvedSubtitle && (
          <p className="text-lg text-muted-foreground">{resolvedSubtitle}</p>
        )}
      </div>

      {totalArticles === 0 ? (
        <p className="text-muted-foreground">No published articles yet.</p>
      ) : (
        <div className="space-y-10">
          {grouped.map((section, sectionIndex) => (
            <div key={section.group ?? `ungrouped-${sectionIndex}`}>
              {section.group && (
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 border-b pb-2">
                  {section.group}
                </h2>
              )}
              <div className="grid gap-6 sm:grid-cols-2">
                {section.chapters.map((chapter) => (
                  <div
                    key={chapter.id}
                    className="rounded-xl border bg-card overflow-hidden"
                  >
                    {/* Chapter header */}
                    <Link
                      href={`/${projectSlug}/${chapter.slug}${qs}`}
                      className="block p-4 pb-3 hover:bg-accent/30 transition-colors"
                    >
                      <h3 className="font-semibold text-card-foreground">
                        {chapter.resolvedTitle}
                      </h3>
                      {chapter.resolvedDescription && (
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                          {chapter.resolvedDescription}
                        </p>
                      )}
                    </Link>

                    {/* Article list */}
                    <div className="border-t divide-y divide-border/50">
                      {chapter.articles.map((article) => (
                        <Link
                          key={article.id}
                          href={`/${projectSlug}/${article.slug}${qs}`}
                          className="group flex items-start gap-3 px-4 py-2.5 hover:bg-accent/30 transition-colors"
                        >
                          <FileText className="size-4 mt-0.5 shrink-0 text-muted-foreground/60" />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-card-foreground group-hover:text-accent-foreground">
                              {article.title}
                            </span>
                            {article.description && (
                              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                                {article.description}
                              </p>
                            )}
                          </div>
                          <ChevronRight className="size-4 mt-0.5 shrink-0 text-muted-foreground/40 group-hover:text-accent-foreground transition-colors" />
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
