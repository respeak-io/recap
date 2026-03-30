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
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Menu, ChevronRight } from "lucide-react";
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

interface Chapter {
  id: string;
  title: string;
  slug: string;
  group?: string;
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

  // Find which chapter contains the active article
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

  // Auto-expand active chapter on navigation
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
    const params: Record<string, string> = {
      lang: currentLang,
      ...overrides,
    };
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
          (a) =>
            a.slug === articleSlug &&
            a.language === lang &&
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

  // Group chapters by their optional `group` field
  const groupedChapters: { group: string | undefined; chapters: typeof filteredChapters }[] = [];
  for (const chapter of filteredChapters) {
    const existing = groupedChapters.find((g) => g.group === chapter.group);
    if (existing) {
      existing.chapters.push(chapter);
    } else {
      groupedChapters.push({ group: chapter.group, chapters: [chapter] });
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top: logo + search */}
      <div className="p-4 pb-2 border-b border-border/50">
        <Link href={`/${projectSlug}`} className="flex items-center gap-2 font-semibold text-lg mb-3">
          {logoUrl ? (
            <img src={logoUrl} alt={projectName} className="max-h-8 object-contain" />
          ) : (
            projectName
          )}
        </Link>
        <SearchDialog projectId={projectId} projectSlug={projectSlug} />
      </div>

      {/* Middle: nav using shadcn sidebar primitives */}
      <div className="flex-1 overflow-y-auto">
        {groupedChapters.map((group, groupIndex) => (
          <SidebarGroup key={group.group ?? `ungrouped-${groupIndex}`}>
            {group.group && (
              <SidebarGroupLabel>{group.group}</SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.chapters.map((chapter) => {
                  const isExpanded = expandedChapters.has(chapter.id);
                  return (
                    <Collapsible
                      key={chapter.id}
                      open={isExpanded}
                      onOpenChange={() => toggleChapter(chapter.id)}
                    >
                      <SidebarMenuItem>
                        <CollapsibleTrigger className="flex items-center w-full rounded-md p-2 text-sm font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors">
                          <span className="flex-1 text-left truncate">{chapter.title}</span>
                          <ChevronRight
                            className={cn(
                              "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                              isExpanded && "rotate-90"
                            )}
                          />
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {chapter.articles.map((article) => {
                              const href = `/${projectSlug}/${article.slug}${buildQuery({})}`;
                              const isActive = pathname === `/${projectSlug}/${article.slug}`;
                              return (
                                <SidebarMenuSubItem key={article.id}>
                                  <Link
                                    href={href}
                                    className={cn(
                                      "flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sm transition-colors",
                                      isActive
                                        ? "bg-primary/10 text-primary font-medium"
                                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                                    )}
                                  >
                                    <span className="truncate">{article.title}</span>
                                  </Link>
                                </SidebarMenuSubItem>
                              );
                            })}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </div>

      {/* Bottom: language selector */}
      {languages.length > 1 && (
        <div className="p-4 pt-2 border-t border-border/50">
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
        </div>
      )}
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
            <DocsSidebarContent {...props} />
          </SheetContent>
        </Sheet>
      </div>

      <aside className="hidden lg:block w-[260px] border-r h-screen sticky top-0 flex-shrink-0 bg-sidebar text-sidebar-foreground">
        <DocsSidebarContent {...props} />
      </aside>
    </>
  );
}
