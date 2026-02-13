"use client";

import { useRouter, useParams } from "next/navigation";
import { ChevronsUpDown, Plus, FolderOpen } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

interface Project {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
}

export function ProjectSwitcher({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const params = useParams();
  const currentSlug = params.slug as string | undefined;
  const currentProject = projects.find((p) => p.slug === currentSlug);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="w-full">
              {currentProject?.logoUrl ? (
                <img src={currentProject.logoUrl} alt="" className="size-8 rounded-lg object-contain" />
              ) : (
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <FolderOpen className="size-4" />
                </div>
              )}
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">
                  {currentProject?.name ?? "Select project"}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {currentProject ? `/${currentProject.slug}` : "No project selected"}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] min-w-56" align="start">
            <DropdownMenuLabel>Projects</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {projects.map((project) => (
              <DropdownMenuItem
                key={project.id}
                onClick={() => router.push(`/project/${project.slug}`)}
              >
                {project.logoUrl ? (
                  <img src={project.logoUrl} alt="" className="mr-2 size-4 object-contain" />
                ) : (
                  <FolderOpen className="mr-2 size-4" />
                )}
                {project.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/dashboard")}>
              <Plus className="mr-2 size-4" />
              New project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
