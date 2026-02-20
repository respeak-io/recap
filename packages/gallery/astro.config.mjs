import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://respeak-io.github.io",
  base: "/recap",
  integrations: [
    starlight({
      title: "Reeldocs Gallery",
      description:
        "Real documentation generated from real product videos — by Reeldocs",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/respeak-io/reeldocs",
        },
      ],
      sidebar: [
        {
          label: "n8n Workflow Automation",
          autogenerate: { directory: "n8n-workflow-automation" },
        },
        {
          label: "Supabase Overview",
          autogenerate: { directory: "supabase-overview" },
        },
        {
          label: "FFmpeg",
          autogenerate: { directory: "ffmpeg" },
        },
        {
          label: "ELSTER Tax Filing",
          autogenerate: { directory: "elster-tax-filing" },
        },
        {
          label: "AusweisApp & Online-Ausweis",
          autogenerate: { directory: "ausweisapp-online-id" },
        },
        {
          label: "Elektronische Patientenakte (ePA)",
          autogenerate: { directory: "epa-patientenakte" },
        },
        {
          label: "Respeak Document Intelligence",
          autogenerate: { directory: "respeak-document-intelligence" },
        },
      ],
    }),
  ],
});
