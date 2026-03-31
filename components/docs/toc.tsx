"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

interface TocItem {
  id: string;
  text: string;
  level: number;
}

export function Toc({ headings }: { headings: TocItem[] }) {
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const [thumbStyle, setThumbStyle] = useState<{ top: number; height: number }>({
    top: 0,
    height: 0,
  });

  // Track all visible headings via IntersectionObserver
  useEffect(() => {
    const visibleSet = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleSet.add(entry.target.id);
          } else {
            visibleSet.delete(entry.target.id);
          }
        }

        if (visibleSet.size > 0) {
          setActiveIds(new Set(visibleSet));
        } else {
          // Fallback: find heading closest to viewport top
          let closest: string | null = null;
          let minDist = Infinity;
          for (const h of headings) {
            const el = document.getElementById(h.id);
            if (!el) continue;
            const d = Math.abs(el.getBoundingClientRect().top);
            if (d < minDist) {
              minDist = d;
              closest = h.id;
            }
          }
          if (closest) setActiveIds(new Set([closest]));
        }
      },
      { rootMargin: "0px 0px -75% 0px", threshold: 0 }
    );

    const timer = setTimeout(() => {
      for (const h of headings) {
        const el = document.getElementById(h.id);
        if (el) observer.observe(el);
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [headings]);

  // Calculate thumb position from active anchor elements in the TOC
  const updateThumb = useCallback(() => {
    const container = containerRef.current;
    if (!container || activeIds.size === 0) {
      setThumbStyle({ top: 0, height: 0 });
      return;
    }

    let upper = Infinity;
    let lower = 0;

    for (const id of activeIds) {
      const el = container.querySelector<HTMLAnchorElement>(`a[href="#${id}"]`);
      if (!el) continue;
      const styles = getComputedStyle(el);
      const top = el.offsetTop + parseFloat(styles.paddingTop);
      const bottom = el.offsetTop + el.clientHeight - parseFloat(styles.paddingBottom);
      upper = Math.min(upper, top);
      lower = Math.max(lower, bottom);
    }

    if (upper === Infinity) {
      setThumbStyle({ top: 0, height: 0 });
    } else {
      setThumbStyle({ top: upper, height: lower - upper });
    }
  }, [activeIds]);

  useEffect(() => {
    updateThumb();
  }, [updateThumb]);

  // Recalculate on resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(updateThumb);
    observer.observe(container);
    return () => observer.disconnect();
  }, [updateThumb]);

  if (headings.length === 0) return null;

  return (
    <aside className="hidden xl:block w-[200px] flex-shrink-0 sticky top-16 h-fit pr-4">
      <p className="text-xs font-semibold uppercase text-muted-foreground mb-3">
        On this page
      </p>
      <div className="relative">
        {/* Background line */}
        <div className="absolute left-0 top-0 bottom-0 w-px bg-border" />
        {/* Active snake line */}
        <div
          className="absolute left-0 w-px bg-primary transition-[clip-path] duration-200"
          style={{
            top: 0,
            bottom: 0,
            clipPath:
              thumbStyle.height > 0
                ? `polygon(0 ${thumbStyle.top}px, 100% ${thumbStyle.top}px, 100% ${thumbStyle.top + thumbStyle.height}px, 0 ${thumbStyle.top + thumbStyle.height}px)`
                : "polygon(0 0, 0 0, 0 0, 0 0)",
          }}
        />
        <nav ref={containerRef} className="flex flex-col gap-0.5 relative">
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
                "relative text-xs leading-relaxed py-1 pl-3 transition-colors",
                h.level === 3 && "pl-6",
                h.level === 4 && "pl-9",
                activeIds.has(h.id)
                  ? "text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {h.text}
            </a>
          ))}
        </nav>
      </div>
    </aside>
  );
}
