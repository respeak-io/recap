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

  return (
    <SidebarProvider>
      <AppSidebar
        projects={projects}
        userEmail={user.email ?? ""}
      />
      <SidebarInset>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
