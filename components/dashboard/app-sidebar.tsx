"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileText, Upload, Settings, Globe, BarChart3 } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { ProjectSwitcher } from "./project-switcher";
import { UserNav } from "./user-nav";

interface Project {
  id: string;
  name: string;
  slug: string;
}

interface AppSidebarProps {
  projects: Project[];
  userEmail: string;
}

export function AppSidebar({ projects, userEmail }: AppSidebarProps) {
  const pathname = usePathname();
  const projectSlugMatch = pathname.match(/^\/project\/([^/]+)/);
  const currentProjectSlug = projectSlugMatch?.[1];

  const projectNav = currentProjectSlug
    ? [
        {
          title: "Overview",
          href: `/project/${currentProjectSlug}`,
          icon: LayoutDashboard,
        },
        {
          title: "Articles",
          href: `/project/${currentProjectSlug}/articles`,
          icon: FileText,
        },
        {
          title: "Upload Video",
          href: `/project/${currentProjectSlug}/upload`,
          icon: Upload,
        },
        {
          title: "Analytics",
          href: `/project/${currentProjectSlug}/analytics`,
          icon: BarChart3,
        },
        {
          title: "Public Site",
          href: `/${currentProjectSlug}`,
          icon: Globe,
          external: true,
        },
        {
          title: "Settings",
          href: `/project/${currentProjectSlug}/settings`,
          icon: Settings,
        },
      ]
    : [];

  return (
    <Sidebar>
      <SidebarHeader>
        <ProjectSwitcher projects={projects} />
      </SidebarHeader>

      <SidebarContent>
        {currentProjectSlug && (
          <SidebarGroup>
            <SidebarGroupLabel>Project</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {projectNav.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === item.href || pathname.startsWith(item.href + "/")}
                    >
                      <Link
                        href={item.href}
                        target={"external" in item && item.external ? "_blank" : undefined}
                      >
                        <item.icon className="size-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {!currentProjectSlug && (
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === "/dashboard"}>
                    <Link href="/dashboard">
                      <LayoutDashboard className="size-4" />
                      <span>All Projects</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <UserNav email={userEmail} />
      </SidebarFooter>
    </Sidebar>
  );
}
