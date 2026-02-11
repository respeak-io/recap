"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";

interface SearchResult {
  id: string;
  title: string;
  slug: string;
  audience: string;
  content_text: string;
}

interface SearchDialogProps {
  projectId: string;
  projectSlug: string;
}

export function SearchDialog({ projectId, projectSlug }: SearchDialogProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParamsHook = useSearchParams();
  const currentLang = searchParamsHook.get("lang") ?? "en";
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

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

  const search = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResults([]);
        setAiAnswer(null);
        return;
      }

      setLoading(true);
      try {
        const langParam = currentLang !== "en" ? `&lang=${currentLang}` : "";
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(q)}&projectId=${projectId}${langParam}`
        );
        const data = await res.json();
        setResults(data.articles ?? []);

        // Fetch AI answer in background
        if (data.articles?.length > 0) {
          fetch("/api/search/answer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: q, articles: data.articles }),
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

  const handleValueChange = useCallback(
    (value: string) => {
      setQuery(value);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => search(value), 300);
    },
    [search]
  );

  function handleSelect(slug: string, audience: string) {
    setOpen(false);
    const langParam = currentLang !== "en" ? `&lang=${currentLang}` : "";
    router.push(`/${projectSlug}/${slug}?audience=${audience}${langParam}`);
  }

  function snippet(text: string) {
    return text.slice(0, 120) + (text.length > 120 ? "..." : "");
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        Search docs...
        <kbd className="ml-auto pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium sm:flex">
          <span className="text-xs">&#8984;</span>K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search documentation..."
          value={query}
          onValueChange={handleValueChange}
        />
        <CommandList>
          {!loading && results.length === 0 && query.trim() && (
            <CommandEmpty>No results found.</CommandEmpty>
          )}

          {aiAnswer && (
            <CommandGroup heading="AI Answer">
              <div className="px-3 py-2 text-sm text-muted-foreground">
                {aiAnswer}
              </div>
            </CommandGroup>
          )}

          {results.length > 0 && (
            <CommandGroup heading="Articles">
              {results.map((r) => (
                <CommandItem
                  key={r.id}
                  value={r.title}
                  onSelect={() => handleSelect(r.slug, r.audience)}
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{r.title}</span>
                      <Badge variant="outline" className="text-[10px] px-1 py-0">
                        {r.audience}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {snippet(r.content_text)}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
