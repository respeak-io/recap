import type { SupabaseClient } from "@supabase/supabase-js";

export const TEST_USER = {
  email: "e2e-test@vidtodoc.local",
  password: "TestPassword123!",
};

export const TEST_PROJECT = {
  name: "E2E Test Project",
  slug: "e2e-test-project",
};

export const TEST_CHAPTER = {
  title: "Getting Started",
  slug: "getting-started",
};

export const TEST_ARTICLES = {
  en: {
    title: "Installation Guide",
    slug: "installation-guide",
    language: "en",
    status: "published" as const,
    content_json: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Prerequisites" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Before you begin, make sure you have Node.js 18 or later installed on your system.",
            },
          ],
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Installation" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Run the following command to install the package:",
            },
          ],
        },
        {
          type: "codeBlock",
          attrs: { language: "bash" },
          content: [{ type: "text", text: "npm install vidtodoc" }],
        },
      ],
    },
    content_text:
      "Prerequisites\nBefore you begin, make sure you have Node.js 18 or later installed on your system.\nInstallation\nRun the following command to install the package:\nnpm install vidtodoc",
  },
  de: {
    title: "Installationsanleitung",
    slug: "installation-guide",
    language: "de",
    status: "published" as const,
    content_json: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Voraussetzungen" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Stellen Sie sicher, dass Node.js 18 oder neuer auf Ihrem System installiert ist.",
            },
          ],
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Installation" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Fuehren Sie den folgenden Befehl aus, um das Paket zu installieren:",
            },
          ],
        },
      ],
    },
    content_text:
      "Voraussetzungen\nStellen Sie sicher, dass Node.js 18 oder neuer auf Ihrem System installiert ist.\nInstallation\nFuehren Sie den folgenden Befehl aus, um das Paket zu installieren:",
  },
};

export async function seedTestData(supabase: SupabaseClient, userId: string) {
  // Look up the auto-created org via organization_members
  const { data: membership, error: memErr } = await supabase
    .from("organization_members")
    .select("org_id")
    .eq("user_id", userId)
    .single();

  if (memErr || !membership) {
    throw new Error(`Failed to find org for user ${userId}: ${memErr?.message}`);
  }

  const orgId = membership.org_id;

  // Insert project
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .insert({
      org_id: orgId,
      name: TEST_PROJECT.name,
      slug: TEST_PROJECT.slug,
      is_public: true,
    })
    .select("id")
    .single();

  if (projErr || !project) {
    throw new Error(`Failed to create project: ${projErr?.message}`);
  }

  // Insert chapter
  const { data: chapter, error: chErr } = await supabase
    .from("chapters")
    .insert({
      project_id: project.id,
      title: TEST_CHAPTER.title,
      slug: TEST_CHAPTER.slug,
      order: 0,
    })
    .select("id")
    .single();

  if (chErr || !chapter) {
    throw new Error(`Failed to create chapter: ${chErr?.message}`);
  }

  // Insert EN article
  const { error: enErr } = await supabase.from("articles").insert({
    project_id: project.id,
    chapter_id: chapter.id,
    title: TEST_ARTICLES.en.title,
    slug: TEST_ARTICLES.en.slug,
    language: TEST_ARTICLES.en.language,
    status: TEST_ARTICLES.en.status,
    content_json: TEST_ARTICLES.en.content_json,
    content_text: TEST_ARTICLES.en.content_text,
    order: 0,
  });

  if (enErr) {
    throw new Error(`Failed to create EN article: ${enErr.message}`);
  }

  // Insert DE article
  const { error: deErr } = await supabase.from("articles").insert({
    project_id: project.id,
    chapter_id: chapter.id,
    title: TEST_ARTICLES.de.title,
    slug: TEST_ARTICLES.de.slug,
    language: TEST_ARTICLES.de.language,
    status: TEST_ARTICLES.de.status,
    content_json: TEST_ARTICLES.de.content_json,
    content_text: TEST_ARTICLES.de.content_text,
    order: 0,
  });

  if (deErr) {
    throw new Error(`Failed to create DE article: ${deErr.message}`);
  }
}

export async function cleanupTestData(
  supabase: SupabaseClient,
  userId: string
) {
  // Delete project by slug (cascades to chapters/articles)
  await supabase.from("projects").delete().eq("slug", TEST_PROJECT.slug);

  // Delete the auto-created org
  const { data: membership } = await supabase
    .from("organization_members")
    .select("org_id")
    .eq("user_id", userId)
    .single();

  if (membership) {
    await supabase.from("organizations").delete().eq("id", membership.org_id);
  }
}
