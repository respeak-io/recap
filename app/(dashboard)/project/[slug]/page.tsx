import { createClient } from "@/lib/supabase/server";
import { getProjectVideos } from "@/lib/queries/videos";
import { BreadcrumbNav } from "@/components/dashboard/breadcrumb-nav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Video, Globe, Upload, ExternalLink, BarChart3 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!project) notFound();

  const videos = await getProjectVideos(project.id);

  const { data: articles } = await supabase
    .from("articles")
    .select("id, title, slug, audience, language, status, created_at")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false });

  const allArticles = articles ?? [];

  // Deduplicate for display: one row per (slug, audience), prefer English
  const articleMap = new Map<string, typeof allArticles[number] & { languages: string[] }>();
  for (const a of allArticles) {
    const key = `${a.slug}::${a.audience}`;
    const existing = articleMap.get(key);
    if (existing) {
      existing.languages.push(a.language);
      if (a.language === "en") {
        existing.title = a.title;
        existing.id = a.id;
      }
    } else {
      articleMap.set(key, { ...a, languages: [a.language] });
    }
  }
  const uniqueArticles = articleMap.size;
  const languageCount = new Set(allArticles.map((a) => a.language)).size;
  const publishedCount = allArticles.filter((a) => a.status === "published").length;
  const draftCount = allArticles.filter((a) => a.status === "draft").length;
  const recentArticles = Array.from(articleMap.values()).slice(0, 5);

  return (
    <>
      <BreadcrumbNav
        projectName={project.name}
        projectSlug={slug}
        items={[{ label: "Overview" }]}
      />
      <div className="p-6 space-y-6">
        {/* Stats row */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Articles</CardTitle>
              <FileText className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{uniqueArticles}</div>
              <p className="text-xs text-muted-foreground">{languageCount} language{languageCount !== 1 ? "s" : ""}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Published</CardTitle>
              <Globe className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{publishedCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Drafts</CardTitle>
              <FileText className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{draftCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Videos</CardTitle>
              <Video className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{videos.length}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Recent articles */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Recent Articles</CardTitle>
                <CardDescription>Latest documentation updates</CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/project/${slug}/articles`}>View all</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {recentArticles.length === 0 ? (
                <p className="text-sm text-muted-foreground">No articles yet. Upload a video to generate documentation.</p>
              ) : (
                <div className="space-y-3">
                  {recentArticles.map((article) => (
                    <Link
                      key={`${article.slug}::${article.audience}`}
                      href={`/project/${slug}/article/${article.slug}/edit?audience=${article.audience}&lang=${article.language}`}
                      className="flex items-center justify-between rounded-md border p-3 hover:bg-accent transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="size-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm font-medium truncate">{article.title}</span>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        {article.languages.map((l: string) => (
                          <Badge key={l} variant="outline" className="text-xs">{l}</Badge>
                        ))}
                        <Badge variant="outline" className="text-xs">{article.audience}</Badge>
                        <Badge variant={article.status === "published" ? "default" : "secondary"} className="text-xs">
                          {article.status}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick links */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                <Button variant="outline" className="justify-start" asChild>
                  <Link href={`/project/${slug}/upload`}>
                    <Upload className="mr-2 size-4" />
                    Upload Video
                  </Link>
                </Button>
                <Button variant="outline" className="justify-start" asChild>
                  <Link href={`/project/${slug}/articles`}>
                    <FileText className="mr-2 size-4" />
                    Manage Articles
                  </Link>
                </Button>
                <Button variant="outline" className="justify-start" asChild>
                  <Link href={`/${slug}`} target="_blank">
                    <ExternalLink className="mr-2 size-4" />
                    View Public Site
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Analytics</CardTitle>
                <CardDescription>Docs performance</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="justify-start w-full" asChild>
                  <Link href={`/project/${slug}/analytics`}>
                    <BarChart3 className="mr-2 size-4" />
                    View Analytics
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
