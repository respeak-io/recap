import { createClient } from "@/lib/supabase/server";
import { BreadcrumbNav } from "@/components/dashboard/breadcrumb-nav";
import { ThemeEditor } from "@/components/dashboard/theme-editor";
import { resolveTheme } from "@/lib/theme";
import { notFound } from "next/navigation";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, slug, theme")
    .eq("slug", slug)
    .single();

  if (!project) notFound();

  const theme = resolveTheme(project.theme as Record<string, unknown>);

  // Get public URLs for existing assets
  let logoUrl: string | null = null;
  let faviconUrl: string | null = null;

  if (theme.logo_path) {
    const { data } = supabase.storage.from("assets").getPublicUrl(theme.logo_path);
    logoUrl = data.publicUrl;
  }
  if (theme.favicon_path) {
    const { data } = supabase.storage.from("assets").getPublicUrl(theme.favicon_path);
    faviconUrl = data.publicUrl;
  }

  return (
    <>
      <BreadcrumbNav
        projectName={project.name}
        projectSlug={slug}
        items={[{ label: "Settings" }]}
      />
      <div className="p-6 max-w-3xl">
        <h1 className="text-2xl font-bold mb-2">Branding & Theme</h1>
        <p className="text-muted-foreground mb-8">
          Customize the look of your public documentation to match your corporate identity.
        </p>
        <ThemeEditor
          projectId={project.id}
          theme={theme}
          logoUrl={logoUrl}
          faviconUrl={faviconUrl}
          supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
        />
      </div>
    </>
  );
}
