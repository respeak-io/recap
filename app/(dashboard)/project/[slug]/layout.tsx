import { notFound } from "next/navigation";
import { getProject } from "@/lib/queries/projects";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Memoised per request: pages under this layout call getProject(slug) too.
  const project = await getProject(slug);

  if (!project) notFound();

  return <>{children}</>;
}
