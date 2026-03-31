"use client";

import {
  useEffect,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

interface TocItem {
  id: string;
  text: string;
  level: number;
}

function getLineX(level: number): number {
  // x-offset based on heading depth, matching the padding-left of links
  if (level <= 2) return 6;
  if (level === 3) return 18;
  return 30;
}

export function Toc({ headings }: { headings: TocItem[] }) {
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<{
    width: number;
    height: number;
    path: string;
    elements: ReactNode[];
  } | null>(null);
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
      { rootMargin: "0px", threshold: 0.5 }
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

  // Build SVG path with curves between depth levels
  const buildSvg = useCallback(() => {
    const container = containerRef.current;
    if (!container || headings.length === 0) {
      setSvg(null);
      return;
    }

    let w = 0;
    let h = 0;
    let prevBottom = 0;
    let prevX = 0;
    let d = "";

    for (let i = 0; i < headings.length; i++) {
      const heading = headings[i];
      const el = container.querySelector<HTMLAnchorElement>(
        `a[href="#${heading.id}"]`
      );
      if (!el) continue;

      const styles = getComputedStyle(el);
      const x = getLineX(heading.level);
      const top = el.offsetTop + parseFloat(styles.paddingTop);
      const bottom =
        el.offsetTop + el.clientHeight - parseFloat(styles.paddingBottom);

      w = Math.max(x + 4, w);
      h = Math.max(h, bottom);

      if (i === 0) {
        d += `M${x} ${top} L${x} ${bottom}`;
      } else {
        // Cubic bezier curve from previous position to this one
        d += ` C${prevX} ${top - 4} ${x} ${prevBottom + 4} ${x} ${top} L${x} ${bottom}`;
      }

      prevX = x;
      prevBottom = bottom;
    }

    setSvg({ width: w, height: h, path: d, elements: [] });
  }, [headings]);

  useEffect(() => {
    buildSvg();
  }, [buildSvg]);

  // Recalculate SVG on resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(buildSvg);
    observer.observe(container);
    return () => observer.disconnect();
  }, [buildSvg]);

  // Calculate thumb clip region from active anchors
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
      const bottom =
        el.offsetTop + el.clientHeight - parseFloat(styles.paddingBottom);
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

  if (headings.length === 0) return null;

  const clipPath =
    thumbStyle.height > 0
      ? `polygon(0 ${thumbStyle.top}px, 100% ${thumbStyle.top}px, 100% ${thumbStyle.top + thumbStyle.height}px, 0 ${thumbStyle.top + thumbStyle.height}px)`
      : "polygon(0 0, 0 0, 0 0, 0 0)";

  return (
    <aside className="hidden xl:block w-[200px] flex-shrink-0 sticky top-16 h-fit pr-4">
      <p className="text-xs font-semibold uppercase text-muted-foreground mb-3">
        On this page
      </p>
      <div className="relative">
        {/* Background snake path (faint) */}
        {svg && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox={`0 0 ${svg.width} ${svg.height}`}
            className="absolute top-0 left-0 pointer-events-none"
            style={{ width: svg.width, height: svg.height }}
          >
            <path
              d={svg.path}
              className="stroke-border"
              strokeWidth="1"
              fill="none"
            />
          </svg>
        )}
        {/* Active snake path (highlighted, clipped) */}
        {svg && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox={`0 0 ${svg.width} ${svg.height}`}
            className="absolute top-0 left-0 pointer-events-none transition-[clip-path] duration-200"
            style={{
              width: svg.width,
              height: svg.height,
              clipPath,
            }}
          >
            <path
              d={svg.path}
              className="stroke-primary"
              strokeWidth="1.5"
              fill="none"
            />
          </svg>
        )}
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
                "relative text-xs leading-relaxed py-1 transition-colors",
                h.level <= 2 && "pl-4",
                h.level === 3 && "pl-7",
                h.level >= 4 && "pl-10",
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
