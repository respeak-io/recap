import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProjects } from "@/lib/queries/projects";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/app-sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const projects = await getProjects();

  // Resolve logo URLs from theme data for each project
  const projectsWithLogos = projects.map((p) => {
    const theme = p.theme as Record<string, unknown> | null;
    const logoPath = theme?.logo_path as string | undefined;
    let logoUrl: string | null = null;
    if (logoPath) {
      const { data } = supabase.storage.from("assets").getPublicUrl(logoPath);
      logoUrl = data.publicUrl;
    }
    return { id: p.id, name: p.name, slug: p.slug, logoUrl };
  });

  return (
    <SidebarProvider>
      <AppSidebar
        projects={projectsWithLogos}
        userEmail={user.email ?? ""}
      />
      <SidebarInset>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
