"use client";

import { useState, useEffect } from "react";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Menu, ChevronRight, Search } from "lucide-react";
import { SearchDialog } from "./search-dialog";
import { ThemeToggle } from "./theme-toggle";

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

interface Chapter {
  id: string;
  title: string;
  slug: string;
  group?: string;
  translations?: Record<string, { title?: string; group?: string }> | null;
  articles: {
    id: string;
    title: string;
    slug: string;
    language: string;
    status: string;
  }[];
}

interface SidebarProps {
  projectId: string;
  projectName: string;
  projectSlug: string;
  chapters: Chapter[];
  languages: string[];
  logoUrl?: string | null;
}

function DocsSidebarContent({
  projectId,
  projectName,
  projectSlug,
  chapters,
  languages,
  logoUrl,
}: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentLang = searchParams.get("lang") ?? "en";

  const filteredChapters = chapters
    .map((ch) => ({
      ...ch,
      articles: ch.articles.filter(
        (a) =>
          a.language === currentLang &&
          a.status === "published"
      ),
    }))
    .filter((ch) => ch.articles.length > 0);

  const activeArticleSlug = pathname.startsWith(`/${projectSlug}/`)
    ? pathname.slice(`/${projectSlug}/`.length).split("/")[0]
    : "";
  const activeChapterId = filteredChapters.find((ch) =>
    ch.articles.some((a) => a.slug === activeArticleSlug)
  )?.id;

  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(() => {
    const set = new Set<string>();
    if (filteredChapters.length > 0) set.add(filteredChapters[0].id);
    if (activeChapterId) set.add(activeChapterId);
    return set;
  });

  useEffect(() => {
    if (!activeChapterId) return;
    setExpandedChapters((prev) => {
      if (prev.has(activeChapterId)) return prev;
      return new Set([...prev, activeChapterId]);
    });
  }, [activeChapterId]);

  function toggleChapter(id: string) {
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function buildQuery(overrides: Record<string, string>) {
    const params: Record<string, string> = { lang: currentLang, ...overrides };
    const parts: string[] = [];
    if (params.lang !== "en") parts.push(`lang=${params.lang}`);
    return parts.length > 0 ? `?${parts.join("&")}` : "";
  }

  function handleLanguageChange(lang: string) {
    const query = buildQuery({ lang });
    const articleSlug = pathname.startsWith(`/${projectSlug}/`)
      ? pathname.slice(`/${projectSlug}/`.length).split("/")[0]
      : "";
    if (articleSlug) {
      const exists = chapters.some((ch) =>
        ch.articles.some(
          (a) => a.slug === articleSlug && a.language === lang && a.status === "published"
        )
      );
      if (exists) {
        window.location.href = `/${projectSlug}/${articleSlug}${query}`;
        return;
      }
    }
    window.location.href = `/${projectSlug}${query}`;
  }

  function chapterTitle(ch: Chapter): string {
    return ch.translations?.[currentLang]?.title ?? ch.title;
  }
  function chapterGroup(ch: Chapter): string | undefined {
    return ch.translations?.[currentLang]?.group ?? ch.group ?? undefined;
  }

  const groupedChapters: { group: string | undefined; chapters: typeof filteredChapters }[] = [];
  for (const chapter of filteredChapters) {
    const g = chapterGroup(chapter);
    const existing = groupedChapters.find((gr) => gr.group === g);
    if (existing) {
      existing.chapters.push(chapter);
    } else {
      groupedChapters.push({ group: g, chapters: [chapter] });
    }
  }

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header: logo + search */}
      <div className="flex flex-col gap-3 p-4 pb-2">
        <Link href={`/${projectSlug}`} className="inline-flex items-center gap-2.5 text-[0.9375rem] font-medium">
          {logoUrl ? (
            <img src={logoUrl} alt={projectName} className="max-h-7 object-contain" />
          ) : (
            projectName
          )}
        </Link>
        <SearchDialog projectId={projectId} projectSlug={projectSlug} />
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {groupedChapters.map((group, groupIndex) => (
          <div key={group.group ?? `ungrouped-${groupIndex}`} className="mb-1">
            {group.group && (
              <p className="inline-flex items-center gap-2 mb-1 px-2 mt-6 first:mt-2 text-xs font-medium text-muted-foreground/70">
                {group.group}
              </p>
            )}
            <div className="flex flex-col gap-0.5">
              {group.chapters.map((chapter) => {
                const isExpanded = expandedChapters.has(chapter.id);
                return (
                  <Collapsible
                    key={chapter.id}
                    open={isExpanded}
                    onOpenChange={() => toggleChapter(chapter.id)}
                  >
                    <CollapsibleTrigger className="flex items-center gap-2 w-full rounded-lg p-2 text-start text-muted-foreground transition-colors hover:bg-accent/50 hover:text-accent-foreground/80">
                      <span className="flex-1 text-left truncate">{chapterTitle(chapter)}</span>
                      <ChevronRight
                        className={cn(
                          "size-4 shrink-0 transition-transform duration-200",
                          isExpanded && "rotate-90"
                        )}
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="relative flex flex-col gap-0.5 pt-0.5">
                        {/* Vertical connector line */}
                        <div className="absolute w-px inset-y-1 start-[0.625rem] bg-border" />
                        {chapter.articles.map((article) => {
                          const href = `/${projectSlug}/${article.slug}${buildQuery({})}`;
                          const isActive = pathname === `/${projectSlug}/${article.slug}`;
                          return (
                            <Link
                              key={article.id}
                              href={href}
                              data-active={isActive}
                              className={cn(
                                "relative flex items-center gap-2 rounded-lg p-2 pl-7 text-muted-foreground transition-colors",
                                "hover:bg-accent/50 hover:text-accent-foreground/80 hover:transition-none",
                                isActive && [
                                  "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary hover:transition-colors",
                                  "before:content-[''] before:bg-primary before:absolute before:w-px before:inset-y-2.5 before:start-[0.625rem]",
                                ]
                              )}
                            >
                              <span className="truncate">{article.title}</span>
                            </Link>
                          );
                        })}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer: language + theme toggle */}
      <div className="flex items-center border-t p-4 pt-2">
        {languages.length > 1 && (
          <Select value={currentLang} onValueChange={handleLanguageChange}>
            <SelectTrigger className="h-8 w-auto gap-1.5 border-0 bg-transparent px-2 text-muted-foreground shadow-none">
              <SelectValue>
                <span className="flex items-center gap-1.5 text-xs">
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
        <div className="ms-auto">
          <ThemeToggle />
        </div>
      </div>
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
          <SheetContent side="left" className="w-[268px] p-0 bg-sidebar text-sidebar-foreground">
            <DocsSidebarContent {...props} />
          </SheetContent>
        </Sheet>
      </div>

      <aside className="hidden lg:block w-[268px] border-r h-screen sticky top-0 flex-shrink-0 bg-sidebar text-sidebar-foreground">
        <DocsSidebarContent {...props} />
      </aside>
    </>
  );
}
