# Docs UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the public docs sidebar (collapsible chapters, left-border active state, language selector at bottom) and swap code block highlighting from lowlight to Shiki.

**Architecture:** Two independent changes to the docs display layer. Sidebar is a full rewrite of `components/docs/sidebar.tsx`. Shiki is a swap of the code block renderer inside `components/docs/article-renderer.tsx` with a new lazy-loaded `ShikiCodeBlock` component.

**Tech Stack:** React 19, Next.js App Router, Tailwind CSS, lucide-react icons, shiki (new), existing shadcn/ui components.

**Spec:** `docs/superpowers/specs/2026-03-30-docs-ui-polish-design.md`

---

### Task 1: Install Shiki and remove hast-util-to-html

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install shiki, remove hast-util-to-html**

```bash
pnpm add shiki && pnpm remove hast-util-to-html
```

- [ ] **Step 2: Verify the app still builds**

```bash
pnpm build
```

Expected: Build succeeds. `hast-util-to-html` is only imported in `article-renderer.tsx` which we'll update in Task 2, so this may produce a build error — that's expected and will be fixed in the next task.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit --no-gpg-sign -m "chore: add shiki, remove hast-util-to-html"
```

---

### Task 2: Replace lowlight with Shiki in article-renderer

**Files:**
- Create: `components/docs/shiki-code-block.tsx`
- Modify: `components/docs/article-renderer.tsx`

- [ ] **Step 1: Create the ShikiCodeBlock component**

Create `components/docs/shiki-code-block.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

interface ShikiCodeBlockProps {
  code: string;
  language: string;
}

let highlighterPromise: Promise<typeof import("shiki/bundle/web")> | null = null;

function getShiki() {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki/bundle/web");
  }
  return highlighterPromise;
}

export function ShikiCodeBlock({ code, language }: ShikiCodeBlockProps) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getShiki().then(async (shiki) => {
      if (cancelled) return;
      const result = await shiki.codeToHtml(code, {
        lang: language || "text",
        themes: {
          light: "github-light",
          dark: "github-dark",
        },
      });
      if (!cancelled) setHtml(result);
    }).catch(() => {
      // Shiki failed to load — keep showing plain fallback
    });
    return () => { cancelled = true; };
  }, [code, language]);

  if (html) {
    return (
      <div
        className="rounded-lg overflow-x-auto text-sm leading-relaxed [&_pre]:p-4 [&_pre]:m-0"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <pre className="rounded-lg bg-muted p-4 overflow-x-auto text-sm leading-relaxed">
      <code>{code}</code>
    </pre>
  );
}
```

- [ ] **Step 2: Update article-renderer.tsx to use ShikiCodeBlock**

In `components/docs/article-renderer.tsx`:

1. Remove these imports at the top:
```tsx
// DELETE these lines:
import { common, createLowlight } from "lowlight";
import { toHtml } from "hast-util-to-html";
```

2. Remove the lowlight initialization:
```tsx
// DELETE this line:
const lowlight = createLowlight(common);
```

3. Add the new import:
```tsx
import { ShikiCodeBlock } from "./shiki-code-block";
```

4. Replace the entire `case "codeBlock"` block (lines 107-133) with:
```tsx
    case "codeBlock": {
      const lang = (node.attrs?.language as string) || "";
      const codeText =
        node.content?.map((n) => n.text ?? "").join("") ?? "";
      return <ShikiCodeBlock key={index} code={codeText} language={lang} />;
    }
```

- [ ] **Step 3: Verify build passes**

```bash
pnpm build
```

Expected: Build succeeds with no errors.

- [ ] **Step 4: Manual test — verify code blocks render**

Start the dev server (`pnpm dev`), navigate to a published article that contains a code block. Verify:
- Code renders with plain styling immediately (fallback)
- After a moment, Shiki highlights it with GitHub theme colors
- In dark mode, the dark theme applies

- [ ] **Step 5: Commit**

```bash
git add components/docs/shiki-code-block.tsx components/docs/article-renderer.tsx
git commit --no-gpg-sign -m "feat(docs): replace lowlight with Shiki for code block highlighting"
```

---

### Task 3: Redesign sidebar — collapsible chapters with left-border active state

**Files:**
- Modify: `components/docs/sidebar.tsx`

- [ ] **Step 1: Rewrite the SidebarContent component**

Replace the entire content of `components/docs/sidebar.tsx` with:

```tsx
"use client";

import { useState, useMemo, useEffect } from "react";
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

function SidebarContent({
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
  const activeArticleSlug = pathname.replace(`/${projectSlug}/`, "").split("/")[0];
  const activeChapterId = filteredChapters.find((ch) =>
    ch.articles.some((a) => a.slug === activeArticleSlug)
  )?.id;

  // Initialize expanded state: first chapter + chapter with active article
  const initialExpanded = useMemo(() => {
    const set = new Set<string>();
    if (filteredChapters.length > 0) set.add(filteredChapters[0].id);
    if (activeChapterId) set.add(activeChapterId);
    return set;
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(initialExpanded);

  // Auto-expand active chapter on navigation
  useEffect(() => {
    if (activeChapterId && !expandedChapters.has(activeChapterId)) {
      setExpandedChapters((prev) => new Set([...prev, activeChapterId]));
    }
  }, [activeChapterId]);  // eslint-disable-line react-hooks/exhaustive-deps

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
    const articleSlug = pathname.replace(`/${projectSlug}/`, "").split("/")[0];
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

      {/* Middle: collapsible nav */}
      <nav className="flex-1 overflow-y-auto p-2">
        {filteredChapters.map((chapter) => {
          const isExpanded = expandedChapters.has(chapter.id);
          return (
            <div key={chapter.id} className="mb-1">
              <button
                type="button"
                onClick={() => toggleChapter(chapter.id)}
                className="flex items-center gap-1 w-full px-2 py-1.5 text-xs font-semibold uppercase text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronRight
                  className={cn(
                    "size-3.5 shrink-0 transition-transform duration-200",
                    isExpanded && "rotate-90"
                  )}
                />
                {chapter.title}
              </button>
              <div
                className={cn(
                  "grid transition-all duration-200",
                  isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                )}
              >
                <div className="overflow-hidden">
                  <div className="ml-2">
                    {chapter.articles.map((article) => {
                      const href = `/${projectSlug}/${article.slug}${buildQuery({})}`;
                      const isActive = pathname === `/${projectSlug}/${article.slug}`;
                      return (
                        <Link
                          key={article.id}
                          href={href}
                          className={cn(
                            "block rounded-r-md px-3 py-1.5 text-sm transition-colors border-l-2",
                            isActive
                              ? "border-primary bg-primary/5 text-foreground font-medium"
                              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50"
                          )}
                        >
                          {article.title}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </nav>

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
            <SidebarContent {...props} />
          </SheetContent>
        </Sheet>
      </div>

      <aside className="hidden lg:block w-[260px] border-r h-screen sticky top-0 flex-shrink-0 bg-sidebar text-sidebar-foreground">
        <SidebarContent {...props} />
      </aside>
    </>
  );
}
```

- [ ] **Step 2: Verify build passes**

```bash
pnpm build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Manual test — verify sidebar behavior**

Start dev server (`pnpm dev`), navigate to a public docs page. Verify:
- First chapter is expanded, rest are collapsed
- Clicking a chapter header toggles expand/collapse with smooth animation
- Active article has left border accent + subtle tinted background
- Navigating to an article in a collapsed chapter auto-expands that chapter
- Language selector is at the bottom of the sidebar
- Mobile: open hamburger menu, verify same layout inside the sheet

- [ ] **Step 4: Commit**

```bash
git add components/docs/sidebar.tsx
git commit --no-gpg-sign -m "feat(docs): redesign sidebar with collapsible chapters and left-border active state"
```

---

### Task 4: Final verification and cleanup

**Files:**
- None new — verification only

- [ ] **Step 1: Full build check**

```bash
pnpm build
```

Expected: Clean build, no warnings related to changed files.

- [ ] **Step 2: Visual smoke test**

Navigate through the public docs:
- Visit project index page — sidebar renders with chapters
- Click into an article — active state shows left border, TOC still works
- Toggle dark mode — Shiki code blocks switch to dark theme
- Collapse/expand chapters — animation is smooth
- Switch language — selector works from bottom position
- Test on mobile viewport — sheet sidebar has same redesign

- [ ] **Step 3: Commit any fixes if needed**

If any visual tweaks were needed during smoke testing, commit them:

```bash
git add -A
git commit --no-gpg-sign -m "fix(docs): visual tweaks from smoke testing"
```
