"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface TocItem {
  id: string;
  text: string;
  level: number;
}

export function Toc({ headings }: { headings: TocItem[] }) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -80% 0px" }
    );

    for (const heading of headings) {
      const element = document.getElementById(heading.id);
      if (element) observer.observe(element);
    }

    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <aside className="hidden xl:block w-[200px] flex-shrink-0 sticky top-8 h-fit">
      <p className="text-xs font-semibold uppercase text-muted-foreground mb-3">
        On this page
      </p>
      <nav className="flex flex-col gap-1">
        {headings.map((h) => (
          <a
            key={h.id}
            href={`#${h.id}`}
            className={cn(
              "text-xs leading-relaxed transition-colors hover:text-foreground",
              h.level === 3 && "pl-3",
              h.level === 4 && "pl-6",
              activeId === h.id
                ? "text-foreground font-medium"
                : "text-muted-foreground"
            )}
          >
            {h.text}
          </a>
        ))}
      </nav>
    </aside>
  );
}
