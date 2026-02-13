"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Menu } from "lucide-react";
import { SearchDialog } from "./search-dialog";

const LANGUAGE_CONFIG: Record<string, { label: string; flag: string }> = {
  en: { label: "English", flag: "\u{1F1FA}\u{1F1F8}" },
  de: { label: "Deutsch", flag: "\u{1F1E9}\u{1F1EA}" },
  es: { label: "Espanol", flag: "\u{1F1EA}\u{1F1F8}" },
  fr: { label: "Francais", flag: "\u{1F1EB}\u{1F1F7}" },
  ja: { label: "\u65E5\u672C\u8A9E", flag: "\u{1F1EF}\u{1F1F5}" },
  zh: { label: "\u4E2D\u6587", flag: "\u{1F1E8}\u{1F1F3}" },
  ko: { label: "\uD55C\uAD6D\uC5B4", flag: "\u{1F1F0}\u{1F1F7}" },
  pt: { label: "Portugues", flag: "\u{1F1E7}\u{1F1F7}" },
};

const AUDIENCE_LABELS: Record<string, string> = {
  developers: "Developer Docs",
  "end-users": "User Guide",
};

interface Chapter {
  id: string;
  title: string;
  slug: string;
  articles: {
    id: string;
    title: string;
    slug: string;
    audience: string;
    language: string;
    status: string;
  }[];
}

interface SidebarProps {
  projectId: string;
  projectName: string;
  projectSlug: string;
  chapters: Chapter[];
  audiences: string[];
  languages: string[];
  logoUrl?: string | null;
}

function SidebarContent({
  projectId,
  projectName,
  projectSlug,
  chapters,
  audiences,
  languages,
  logoUrl,
}: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentAudience = searchParams.get("audience") ?? "developers";
  const currentLang = searchParams.get("lang") ?? "en";

  const filteredChapters = chapters
    .map((ch) => ({
      ...ch,
      articles: ch.articles.filter(
        (a) =>
          a.audience === currentAudience &&
          a.language === currentLang &&
          a.status === "published"
      ),
    }))
    .filter((ch) => ch.articles.length > 0);

  const displayAudiences = audiences.filter((a) => a !== "ai-agents");

  function buildQuery(overrides: Record<string, string>) {
    const params: Record<string, string> = {
      audience: currentAudience,
      lang: currentLang,
      ...overrides,
    };
    const parts: string[] = [];
    if (params.audience !== "developers") parts.push(`audience=${params.audience}`);
    if (params.lang !== "en") parts.push(`lang=${params.lang}`);
    return parts.length > 0 ? `?${parts.join("&")}` : "";
  }

  function handleLanguageChange(lang: string) {
    const query = buildQuery({ lang });

    // If currently viewing an article, try to stay on it
    const articleSlug = pathname.replace(`/${projectSlug}/`, "").split("/")[0];
    if (articleSlug) {
      // Check if this article exists in the target language (and is published)
      const exists = chapters.some((ch) =>
        ch.articles.some(
          (a) =>
            a.slug === articleSlug &&
            a.language === lang &&
            a.audience === currentAudience &&
            a.status === "published"
        )
      );
      if (exists) {
        window.location.href = `/${projectSlug}/${articleSlug}${query}`;
        return;
      }
    }

    window.location.href = `/${projectSlug}${query}`;
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <Link href={`/${projectSlug}`} className="flex items-center gap-2 font-semibold text-lg">
        {logoUrl ? (
          <img src={logoUrl} alt={projectName} className="max-h-8 object-contain" />
        ) : (
          projectName
        )}
      </Link>

      <SearchDialog projectId={projectId} projectSlug={projectSlug} />

      {/* Audience switcher — segmented control or static label */}
      {displayAudiences.length > 1 ? (
        <div className="flex rounded-lg border p-0.5 bg-muted">
          {displayAudiences.map((a) => (
            <Link
              key={a}
              href={`/${projectSlug}${buildQuery({ audience: a })}`}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-center text-xs font-medium transition-all",
                currentAudience === a
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {AUDIENCE_LABELS[a] ?? a}
            </Link>
          ))}
        </div>
      ) : displayAudiences.length === 1 ? (
        <div className="flex rounded-lg border p-0.5 bg-muted">
          <div className="flex-1 rounded-md px-3 py-1.5 text-center text-xs font-medium bg-background text-foreground shadow-sm">
            {AUDIENCE_LABELS[displayAudiences[0]] ?? displayAudiences[0]}
          </div>
        </div>
      ) : null}

      {/* Language selector — dropdown with flags */}
      {languages.length > 1 && (
        <Select value={currentLang} onValueChange={handleLanguageChange}>
          <SelectTrigger className="w-full">
            <SelectValue>
              <span className="flex items-center gap-2">
                <span>{LANGUAGE_CONFIG[currentLang]?.flag ?? "\u{1F310}"}</span>
                <span>{LANGUAGE_CONFIG[currentLang]?.label ?? currentLang}</span>
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {languages.map((l) => (
              <SelectItem key={l} value={l}>
                <span className="flex items-center gap-2">
                  <span>{LANGUAGE_CONFIG[l]?.flag ?? "\u{1F310}"}</span>
                  <span>{LANGUAGE_CONFIG[l]?.label ?? l}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <nav className="flex flex-col gap-1">
        {filteredChapters.map((chapter) => (
          <div key={chapter.id}>
            <p className="text-xs font-semibold uppercase text-muted-foreground mt-4 mb-1 px-2">
              {chapter.title}
            </p>
            {chapter.articles.map((article) => {
              const href = `/${projectSlug}/${article.slug}${buildQuery({})}`;
              const isActive = pathname === `/${projectSlug}/${article.slug}`;
              return (
                <Link
                  key={article.id}
                  href={href}
                  className={cn(
                    "block rounded-md px-2 py-1.5 text-sm transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  )}
                >
                  {article.title}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </div>
  );
}

export function Sidebar(props: SidebarProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="lg:hidden fixed top-3 left-3 z-50">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="h-8 w-8">
              <Menu className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[260px] p-0 bg-sidebar text-sidebar-foreground">
            <SidebarContent {...props} />
          </SheetContent>
        </Sheet>
      </div>

      <aside className="hidden lg:block w-[260px] border-r h-screen sticky top-0 overflow-y-auto flex-shrink-0 bg-sidebar text-sidebar-foreground">
        <SidebarContent {...props} />
      </aside>
    </>
  );
}
