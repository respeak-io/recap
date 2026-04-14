"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { Search as SearchIcon, FileText, Hash, X } from "lucide-react";

interface SearchResult {
  id: string;
  title: string;
  slug: string;
  content_text: string;
  chapters?: { title: string } | null;
}

interface SearchDialogProps {
  projectId: string;
  projectSlug: string;
}

export function SearchDialog({ projectId, projectSlug }: SearchDialogProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [fallback, setFallback] = useState<"or" | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParamsHook = useSearchParams();
  const currentLang = searchParamsHook.get("lang") ?? "en";
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Cmd+K shortcut
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
      setQuery("");
      setResults([]);
      setAiAnswer(null);
      setFallback(null);
      setActiveIndex(0);
    }
  }, [open]);

  const search = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResults([]);
        setAiAnswer(null);
        setFallback(null);
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(q)}&projectId=${projectId}&lang=${currentLang}`
        );
        const data = await res.json();
        setResults(data.articles ?? []);
        setFallback(data.fallback ?? null);
        setActiveIndex(0);

        // Fetch AI answer in background
        if (data.articles?.length > 0) {
          fetch("/api/search/answer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query: q,
              projectId,
              articleIds: data.articles.map((a: { id: string }) => a.id),
              lang: currentLang,
            }),
          })
            .then((r) => r.json())
            .then((d) => setAiAnswer(d.answer))
            .catch(() => {});
        } else {
          setAiAnswer(null);
        }
      } finally {
        setLoading(false);
      }
    },
    [projectId, currentLang]
  );

  const handleInput = useCallback(
    (value: string) => {
      setQuery(value);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => search(value), 300);
    },
    [search]
  );

  function handleSelect(slug: string) {
    setOpen(false);
    const langParam = currentLang !== "en" ? `?lang=${currentLang}` : "";
    router.push(`/${projectSlug}/${slug}${langParam}`);
  }

  // Keyboard navigation
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[activeIndex]) {
      e.preventDefault();
      handleSelect(results[activeIndex].slug);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // Scroll active item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector("[data-active=true]");
    if (active) {
      active.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  function snippet(text: string) {
    return text.slice(0, 140) + (text.length > 140 ? "..." : "");
  }

  // Group results by chapter
  const grouped: { chapter: string; items: (SearchResult & { index: number })[] }[] = [];
  results.forEach((r, index) => {
    const chapterTitle = r.chapters?.title ?? "Uncategorized";
    const existing = grouped.find((g) => g.chapter === chapterTitle);
    if (existing) {
      existing.items.push({ ...r, index });
    } else {
      grouped.push({ chapter: chapterTitle, items: [{ ...r, index }] });
    }
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 w-full rounded-lg border bg-secondary/50 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent"
      >
        <SearchIcon className="size-4" />
        <span className="flex-1 text-left">Search...</span>
        <kbd className="pointer-events-none hidden h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium sm:flex">
          <span className="text-xs">&#8984;</span>K
        </kbd>
      </button>
    );
  }

  return (
    <>
      {/* Trigger button (stays in sidebar layout) */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 w-full rounded-lg border bg-secondary/50 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent"
      >
        <SearchIcon className="size-4" />
        <span className="flex-1 text-left">Search...</span>
        <kbd className="pointer-events-none hidden h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium sm:flex">
          <span className="text-xs">&#8984;</span>K
        </kbd>
      </button>

      {/* Portal overlay out of sidebar stacking context */}
      {createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 backdrop-blur-[2px] bg-background/40 animate-in fade-in-0"
            onClick={() => setOpen(false)}
          />

          {/* Dialog */}
          <div
            className="fixed left-1/2 top-4 md:top-[12vh] z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 animate-in fade-in-0 slide-in-from-top-2"
            onKeyDown={handleKeyDown}
          >
            <div className="rounded-xl border bg-popover shadow-lg overflow-hidden">
              {/* Search input */}
              <div className="flex items-center gap-3 border-b px-4 py-3">
                <SearchIcon className="size-5 shrink-0 text-muted-foreground" />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search documentation..."
                  value={query}
                  onChange={(e) => handleInput(e.target.value)}
                  className="w-0 flex-1 bg-transparent text-lg placeholder:text-muted-foreground focus-visible:outline-none"
                />
                <button
                  onClick={() => setOpen(false)}
                  className="shrink-0 rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent"
                >
                  Esc
                </button>
              </div>

              {/* Results */}
              <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-2">
                {loading && query.trim() && (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    Searching...
                  </div>
                )}

                {!loading && results.length === 0 && query.trim() && (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No results found.
                  </div>
                )}

                {aiAnswer && (
                  <div className="mb-2 rounded-lg bg-primary/5 p-3">
                    <p className="mb-1 text-xs font-medium text-primary">AI Answer</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{aiAnswer}</p>
                  </div>
                )}

                {fallback === "or" && results.length > 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground border-b">
                    {currentLang === "en"
                      ? `No exact matches for "${query}". Similar results:`
                      : `Keine genauen Treffer für „${query}". Ähnliche Resultate:`}
                  </div>
                )}

                {grouped.map((group) => (
                  <div key={group.chapter} className="mb-1">
                    <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                      {group.chapter}
                    </p>
                    {group.items.map((r) => (
                      <button
                        key={r.id}
                        data-active={r.index === activeIndex}
                        onClick={() => handleSelect(r.slug)}
                        onMouseEnter={() => setActiveIndex(r.index)}
                        className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
                      >
                        <FileText className="size-4 shrink-0 mt-0.5 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{r.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {snippet(r.content_text)}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                ))}
              </div>

              {/* Footer */}
              {results.length > 0 && (
                <div className="flex items-center gap-4 border-t px-4 py-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border bg-muted px-1 font-mono">↑↓</kbd> Navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border bg-muted px-1 font-mono">↵</kbd> Open
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border bg-muted px-1 font-mono">Esc</kbd> Close
                  </span>
                </div>
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
