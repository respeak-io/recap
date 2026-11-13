import { redirect } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { getCurrentUser, getProjects } from "@/lib/queries/projects";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/app-sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Both memoised per request (React cache), so the page below reuses them.
  // getProjects() awaits the same auth check; it throws when signed out, which
  // the redirect below handles.
  const [user, projects] = await Promise.all([
    getCurrentUser(),
    getProjects().catch(() => []),
  ]);

  if (!user) redirect("/login");

  const storage = createPublicClient().storage.from("assets");

  // Resolve favicon URLs from theme data for each project (logo as fallback)
  const projectsWithLogos = projects.map((p) => {
    const theme = p.theme as Record<string, unknown> | null;
    const assetPath = (theme?.favicon_path ?? theme?.logo_path) as string | undefined;
    let logoUrl: string | null = null;
    if (assetPath) {
      const { data } = storage.getPublicUrl(assetPath);
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
