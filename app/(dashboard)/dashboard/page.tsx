import { getProjects } from "@/lib/queries/projects";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BreadcrumbNav } from "@/components/dashboard/breadcrumb-nav";
import Link from "next/link";

export default async function DashboardPage() {
  const projects = await getProjects();

  return (
    <>
      <BreadcrumbNav items={[{ label: "All Projects" }]} />
      <div className="p-6">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Projects</h1>
          <CreateProjectDialog />
        </div>
        {projects.length === 0 ? (
          <p className="text-muted-foreground">
            No projects yet. Create your first one.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Link key={project.id} href={`/project/${project.slug}`}>
                <Card className="hover:border-primary transition-colors">
                  <CardHeader>
                    <CardTitle>{project.name}</CardTitle>
                    <CardDescription>/{project.slug}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
