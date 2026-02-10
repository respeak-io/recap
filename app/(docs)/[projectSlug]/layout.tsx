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
      "*, chapters(id, title, slug, order, articles(id, title, slug, audience, status))"
    )
    .eq("slug", projectSlug)
    .eq("is_public", true)
    .single();

  if (!project) notFound();

  // Sort chapters by order
  const chapters = (project.chapters ?? []).sort(
    (a: { order: number }, b: { order: number }) => a.order - b.order
  );

  // Collect unique audiences
  const audiences = [
    ...new Set(
      chapters.flatMap((ch: { articles: { audience: string }[] }) =>
        ch.articles.map((a: { audience: string }) => a.audience)
      )
    ),
  ] as string[];

  return (
    <div className="flex min-h-screen">
      <Sidebar
        projectName={project.name}
        projectSlug={projectSlug}
        chapters={chapters}
        audiences={audiences}
      />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
