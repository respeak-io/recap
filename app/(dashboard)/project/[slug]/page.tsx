import { createClient } from "@/lib/supabase/server";
import { getProjectVideos } from "@/lib/queries/videos";
import { VideoUpload } from "@/components/video-upload";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function ProjectPage({
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

  // Get articles for this project
  const { data: articles } = await supabase
    .from("articles")
    .select("id, title, slug, audience, language, status")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{project.name}</h1>
        <p className="text-muted-foreground">/{project.slug}</p>
      </div>

      <VideoUpload projectId={project.id} />

      {videos.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Videos</h2>
          <div className="grid gap-3">
            {videos.map((video) => (
              <Card key={video.id}>
                <CardHeader className="py-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{video.title}</CardTitle>
                    <Badge
                      variant={
                        video.status === "ready"
                          ? "default"
                          : video.status === "failed"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {video.status}
                    </Badge>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      )}

      {articles && articles.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Articles</h2>
          <div className="grid gap-3">
            {articles.map((article) => (
              <Link
                key={article.id}
                href={`/project/${slug}/article/${article.slug}/edit?audience=${article.audience}&lang=${article.language}`}
              >
                <Card className="hover:border-primary transition-colors">
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">
                        {article.title}
                      </CardTitle>
                      <div className="flex gap-2">
                        <Badge variant="outline">{article.audience}</Badge>
                        <Badge
                          variant={
                            article.status === "published"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {article.status}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
