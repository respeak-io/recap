"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
import { getLanguageLabel, getLanguageFlag } from "@/lib/languages";

interface Chapter {
  id: string;
  title: string;
  slug: string;
  group?: string | null;
  translations?: Record<string, { title?: string; group?: string }> | null;
  /** Published articles only, all languages (needed by the language switcher). */
  articles: {
    id: string;
    title: string;
    slug: string;
    language: string;
    order: number;
  }[];
}

interface SidebarProps {
  projectId: string;
  projectName: string;
  projectSlug: string;
  locale: string;
  chapters: Chapter[];
  languages: string[];
  logoUrl?: string | null;
  translations?: Record<string, { name?: string }> | null;
}

function DocsSidebarContent({
  projectId,
  projectName,
  projectSlug,
  locale,
  chapters,
  languages,
  logoUrl,
  translations,
}: SidebarProps) {
  const pathname = usePathname();
  const currentLang = locale;
  const resolvedProjectName = translations?.[currentLang]?.name || projectName;
  const basePath = `/${locale}/${projectSlug}`;

  const filteredChapters = chapters
    .map((ch) => ({
      ...ch,
      articles: ch.articles
        .filter((a) => a.language === currentLang)
        .sort((a, b) => a.order - b.order),
    }))
    .filter((ch) => ch.articles.length > 0);

  const activeArticleSlug = pathname.startsWith(`${basePath}/`)
    ? pathname.slice(`${basePath}/`.length).split("/")[0]
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

  function handleLanguageChange(lang: string) {
    const articleSlug = activeArticleSlug;
    if (articleSlug) {
      const exists = chapters.some((ch) =>
        ch.articles.some(
          (a) => a.slug === articleSlug && a.language === lang
        )
      );
      if (exists) {
        window.location.href = `/${lang}/${projectSlug}/${articleSlug}`;
        return;
      }
    }
    window.location.href = `/${lang}/${projectSlug}`;
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
        <Link href={basePath} className="inline-flex items-center gap-2.5 text-[0.9375rem] font-medium">
          {logoUrl ? (
            <img src={logoUrl} alt={resolvedProjectName} className="max-h-7 object-contain" />
          ) : (
            resolvedProjectName
          )}
        </Link>
        <SearchDialog projectId={projectId} projectSlug={projectSlug} locale={locale} />
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {groupedChapters.map((group, groupIndex) => (
          <div key={group.group ?? `ungrouped-${groupIndex}`} className="mt-6 first:mt-0">
            {group.group && (
              <p className="px-2 mb-2 text-sm font-semibold text-sidebar-foreground">
                {group.group}
              </p>
            )}
            <div className="flex flex-col gap-0.5">
              {group.chapters.map((chapter) => {
                const isExpanded = expandedChapters.has(chapter.id);
                const chapterHref = `${basePath}/${chapter.slug}`;
                const isChapterActive = pathname === `${basePath}/${chapter.slug}`;
                return (
                  <Collapsible
                    key={chapter.id}
                    open={isExpanded}
                    onOpenChange={() => toggleChapter(chapter.id)}
                  >
                    <div className={cn(
                      "flex items-center rounded-lg transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      isChapterActive && "bg-sidebar-accent text-sidebar-accent-foreground"
                    )}>
                      <Link
                        href={chapterHref}
                        className={cn(
                          "flex-1 truncate p-2 text-start text-sidebar-foreground/70",
                          isChapterActive && "font-medium text-sidebar-accent-foreground"
                        )}
                      >
                        {chapterTitle(chapter)}
                      </Link>
                      <CollapsibleTrigger className="p-2 text-sidebar-foreground/70 hover:text-sidebar-accent-foreground">
                        <ChevronRight
                          className={cn(
                            "size-4 shrink-0 transition-transform duration-200",
                            isExpanded && "rotate-90"
                          )}
                        />
                      </CollapsibleTrigger>
                    </div>
                    <CollapsibleContent>
                      <div className="relative flex flex-col gap-0.5 pt-0.5">
                        {/* Vertical connector line */}
                        <div className="absolute w-px inset-y-1 start-[0.625rem] bg-sidebar-foreground/15" />
                        {chapter.articles.map((article) => {
                          const href = `${basePath}/${article.slug}`;
                          const isActive = pathname === `${basePath}/${article.slug}`;
                          return (
                            <Link
                              key={article.id}
                              href={href}
                              data-active={isActive}
                              className={cn(
                                "relative flex items-center gap-2 rounded-lg p-2 pl-7 text-sidebar-foreground/60 transition-colors",
                                "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:transition-none",
                                isActive && [
                                  "bg-sidebar-accent text-sidebar-accent-foreground font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:transition-colors",
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
      <div className="flex items-center border-t border-sidebar-foreground/10 p-4 pt-2">
        {languages.length > 1 && (
          <Select value={currentLang} onValueChange={handleLanguageChange}>
            <SelectTrigger className="h-8 w-auto gap-1.5 border-0 bg-transparent px-2 text-sidebar-foreground/60 shadow-none">
              <SelectValue>
                <span className="flex items-center gap-1.5 text-xs">
                  <span>{getLanguageFlag(currentLang)}</span>
                  <span>{getLanguageLabel(currentLang)}</span>
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {languages.map((l) => (
                <SelectItem key={l} value={l}>
                  <span className="flex items-center gap-2">
                    <span>{getLanguageFlag(l)}</span>
                    <span>{getLanguageLabel(l)}</span>
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
