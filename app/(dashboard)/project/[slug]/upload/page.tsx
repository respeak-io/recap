import { createClient } from "@/lib/supabase/server";
import { BreadcrumbNav } from "@/components/dashboard/breadcrumb-nav";
import { VideoUpload } from "@/components/video-upload";
import { notFound } from "next/navigation";

export default async function UploadPage({
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

  return (
    <>
      <BreadcrumbNav
        projectName={project.name}
        projectSlug={slug}
        items={[{ label: "Upload Video" }]}
      />
      <div className="p-6 max-w-4xl">
        <h1 className="text-2xl font-bold mb-2">Upload Video</h1>
        <p className="text-muted-foreground mb-8">
          Upload a product video and we'll generate documentation for your selected audiences.
        </p>
        <VideoUpload projectId={project.id} />
      </div>
    </>
  );
}
