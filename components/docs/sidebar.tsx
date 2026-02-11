"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import { SearchDialog } from "./search-dialog";

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  de: "Deutsch",
  es: "Espanol",
  fr: "Francais",
  ja: "Japanese",
  zh: "Chinese",
  ko: "Korean",
  pt: "Portugues",
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
}

function SidebarContent({
  projectId,
  projectName,
  projectSlug,
  chapters,
  audiences,
  languages,
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

  // Filter out ai-agents from displayed audiences
  const displayAudiences = audiences.filter((a) => a !== "ai-agents");

  function buildQuery(overrides: Record<string, string>) {
    const params: Record<string, string> = {
      audience: currentAudience,
      lang: currentLang,
      ...overrides,
    };
    // Don't include defaults
    const parts: string[] = [];
    if (params.audience !== "developers") parts.push(`audience=${params.audience}`);
    if (params.lang !== "en") parts.push(`lang=${params.lang}`);
    return parts.length > 0 ? `?${parts.join("&")}` : "";
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <Link href={`/${projectSlug}`} className="font-semibold text-lg">
        {projectName}
      </Link>

      <SearchDialog projectId={projectId} projectSlug={projectSlug} />

      {displayAudiences.length > 1 && (
        <div className="flex gap-1">
          {displayAudiences.map((a) => (
            <Link
              key={a}
              href={`/${projectSlug}${buildQuery({ audience: a })}`}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                currentAudience === a
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              )}
            >
              {a === "end-users" ? "User Guide" : "Developer Docs"}
            </Link>
          ))}
        </div>
      )}

      {languages.length > 1 && (
        <div className="flex gap-1 flex-wrap">
          {languages.map((l) => (
            <Link
              key={l}
              href={`/${projectSlug}${buildQuery({ lang: l })}`}
              className={cn(
                "rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
                currentLang === l
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              )}
            >
              {LANGUAGE_LABELS[l] ?? l.toUpperCase()}
            </Link>
          ))}
        </div>
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
      {/* Mobile: sheet trigger */}
      <div className="lg:hidden fixed top-3 left-3 z-50">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="h-8 w-8">
              <Menu className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[260px] p-0">
            <SidebarContent {...props} />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop: fixed sidebar */}
      <aside className="hidden lg:block w-[260px] border-r h-screen sticky top-0 overflow-y-auto flex-shrink-0">
        <SidebarContent {...props} />
      </aside>
    </>
  );
}
