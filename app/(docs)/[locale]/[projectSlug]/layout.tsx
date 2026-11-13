import { Sidebar } from "@/components/docs/sidebar";
import { DocsThemeProvider } from "@/components/docs/theme-provider";
import { resolveTheme } from "@/lib/theme";
import { createPublicClient } from "@/lib/supabase/public";
import { getDocsProject } from "@/lib/docs/data";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

function publicAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return createPublicClient().storage.from("assets").getPublicUrl(path).data.publicUrl;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; projectSlug: string }>;
}): Promise<Metadata> {
  const { projectSlug } = await params;
  const project = await getDocsProject(projectSlug);

  const theme = resolveTheme(project?.theme ?? null);
  const faviconUrl = publicAssetUrl(theme.favicon_path);

  return {
    title: {
      template: "%s",
      default: project?.name ?? "",
    },
    ...(faviconUrl ? { icons: { icon: faviconUrl } } : {}),
  };
}

export default async function DocsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; projectSlug: string }>;
}) {
  const { locale, projectSlug } = await params;
  const project = await getDocsProject(projectSlug);

  if (!project) notFound();

  const theme = resolveTheme(project.theme);
  const logoUrl = publicAssetUrl(theme.logo_path);
  const faviconUrl = publicAssetUrl(theme.favicon_path);

  // Languages offered in the switcher: those with published chapter articles.
  const languages = [
    ...new Set(project.chapters.flatMap((ch) => ch.articles.map((a) => a.language))),
  ];

  return (
    <DocsThemeProvider
      theme={theme}
      logoUrl={logoUrl}
      faviconUrl={faviconUrl}
      projectName={project.name}
    >
      <div className="flex min-h-screen">
        <Sidebar
          projectId={project.id}
          projectName={project.name}
          projectSlug={projectSlug}
          locale={locale}
          chapters={project.chapters}
          languages={languages}
          logoUrl={logoUrl}
          translations={project.translations}
        />
        <div className="flex-1 min-w-0">
          {children}
          {!theme.hide_powered_by && (
            <footer className="border-t px-8 py-4 text-xs text-muted-foreground text-center">
              Powered by Recap
            </footer>
          )}
        </div>
      </div>
    </DocsThemeProvider>
  );
}
