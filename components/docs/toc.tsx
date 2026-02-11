"use client";

import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";

interface TocItem {
  id: string;
  text: string;
  level: number;
}

export function Toc({ headings }: { headings: TocItem[] }) {
  const [activeId, setActiveId] = useState<string>("");
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observerRef.current?.disconnect();

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries.filter((e) => e.isIntersecting);
        if (visibleEntries.length > 0) {
          const sorted = visibleEntries.sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top
          );
          setActiveId(sorted[0].target.id);
        }
      },
      {
        rootMargin: "-64px 0px -75% 0px",
        threshold: [0, 1],
      }
    );

    observerRef.current = observer;

    const timer = setTimeout(() => {
      for (const heading of headings) {
        const element = document.getElementById(heading.id);
        if (element) observer.observe(element);
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <aside className="hidden xl:block w-[200px] flex-shrink-0 sticky top-16 h-fit pr-4">
      <p className="text-xs font-semibold uppercase text-muted-foreground mb-3">
        On this page
      </p>
      <nav className="flex flex-col gap-0.5 relative">
        <div className="absolute left-0 top-0 bottom-0 w-px bg-border" />
        {headings.map((h) => (
          <a
            key={h.id}
            href={`#${h.id}`}
            onClick={(e) => {
              e.preventDefault();
              const el = document.getElementById(h.id);
              if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "start" });
                window.history.replaceState(null, "", `#${h.id}`);
              }
            }}
            className={cn(
              "relative text-xs leading-relaxed py-1 pl-3 transition-colors border-l-2 -ml-px",
              h.level === 3 && "pl-6",
              h.level === 4 && "pl-9",
              activeId === h.id
                ? "border-l-primary text-foreground font-medium"
                : "border-l-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {h.text}
          </a>
        ))}
      </nav>
    </aside>
  );
}
