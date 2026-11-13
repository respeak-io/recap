import { BreadcrumbNav } from "@/components/dashboard/breadcrumb-nav";
import { notFound } from "next/navigation";
import { getProject } from "@/lib/queries/projects";
import { MediaGallery } from "./media-gallery";

export default async function MediaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await getProject(slug);

  if (!project) notFound();

  return (
    <>
      <BreadcrumbNav
        projectName={project.name}
        projectSlug={slug}
        items={[{ label: "Media" }]}
      />
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Media Gallery</h1>
        <MediaGallery projectId={project.id} />
      </div>
    </>
  );
}
