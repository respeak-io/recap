"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Save } from "lucide-react";
import { getLanguageLabel } from "@/lib/languages";

type Translations = Record<string, { name?: string; subtitle?: string }>;

interface ProjectDetailsEditorProps {
  projectId: string;
  name: string;
  subtitle: string;
  translations: Translations;
  languages: string[];
}

export function ProjectDetailsEditor({
  projectId,
  name: initialName,
  subtitle: initialSubtitle,
  translations: initialTranslations,
  languages,
}: ProjectDetailsEditorProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [subtitle, setSubtitle] = useState(initialSubtitle);
  const [translations, setTranslations] =
    useState<Translations>(initialTranslations);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeLang, setActiveLang] = useState("en");

  const hasChanges =
    name !== initialName ||
    subtitle !== initialSubtitle ||
    JSON.stringify(translations) !== JSON.stringify(initialTranslations);

  function updateTranslation(
    lang: string,
    field: "name" | "subtitle",
    value: string
  ) {
    setTranslations((prev) => ({
      ...prev,
      [lang]: { ...prev[lang], [field]: value || undefined },
    }));
  }

  async function handleSave() {
    setSaving(true);
    // Clean empty translation entries
    const cleanTranslations: Translations = {};
    for (const [lang, t] of Object.entries(translations)) {
      if (t.name || t.subtitle) {
        cleanTranslations[lang] = t;
      }
    }
    await fetch(`/api/projects/${projectId}/details`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        subtitle,
        translations:
          Object.keys(cleanTranslations).length > 0
            ? cleanTranslations
            : null,
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    router.refresh();
  }

  const allLangs = ["en", ...languages];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Project Details</CardTitle>
        <CardDescription>
          Title and subtitle shown on the landing page of your public
          documentation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Language tabs */}
        {languages.length > 0 && (
          <div className="flex gap-1 border-b">
            {allLangs.map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setActiveLang(lang)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors rounded-t-md -mb-px ${
                  activeLang === lang
                    ? "border border-b-background text-foreground bg-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {getLanguageLabel(lang)}
              </button>
            ))}
          </div>
        )}

        {activeLang === "en" ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="project-name">Title</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Project"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-subtitle">Subtitle</Label>
              <Input
                id="project-subtitle"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="Welcome to the documentation."
              />
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor={`project-name-${activeLang}`}>
                Title ({getLanguageLabel(activeLang)})
              </Label>
              <Input
                id={`project-name-${activeLang}`}
                value={translations[activeLang]?.name ?? ""}
                onChange={(e) =>
                  updateTranslation(activeLang, "name", e.target.value)
                }
                placeholder={name}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to use the default: {name}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`project-subtitle-${activeLang}`}>
                Subtitle ({getLanguageLabel(activeLang)})
              </Label>
              <Input
                id={`project-subtitle-${activeLang}`}
                value={translations[activeLang]?.subtitle ?? ""}
                onChange={(e) =>
                  updateTranslation(activeLang, "subtitle", e.target.value)
                }
                placeholder={subtitle || "Welcome to the documentation."}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to use the default{subtitle ? `: ${subtitle}` : ""}
              </p>
            </div>
          </>
        )}

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving || !hasChanges}>
            <Save className="size-4 mr-2" />
            {saving ? "Saving..." : saved ? "Saved!" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
