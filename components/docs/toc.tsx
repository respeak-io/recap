"use client";

import {
  useEffect,
  useState,
  useRef,
  useCallback,
} from "react";
import { cn } from "@/lib/utils";

interface TocItem {
  id: string;
  text: string;
  level: number;
}

// --- Observer (adapted from fumadocs-core/toc.tsx) ---

interface ObserverItem {
  id: string;
  active: boolean;
  /** true if active only because nothing else is intersecting */
  fallback: boolean;
}

class TocObserver {
  items: ObserverItem[] = [];
  private observer: IntersectionObserver | null = null;
  onChange?: () => void;

  private callback(entries: IntersectionObserverEntry[]) {
    if (entries.length === 0) return;

    let hasActive = false;
    this.items = this.items.map((item) => {
      const entry = entries.find((e) => e.target.id === item.id);
      // If entry exists, use its isIntersecting. Otherwise keep previous state (unless fallback).
      const active = entry ? entry.isIntersecting : item.active && !item.fallback;

      if (item.active !== active) {
        item = { ...item, active, fallback: false };
      }
      if (active) hasActive = true;
      return item;
    });

    // Fallback: when nothing is intersecting, find heading closest to viewport top
    if (!hasActive && entries[0].rootBounds) {
      const viewTop = entries[0].rootBounds.top;
      let min = Infinity;
      let fallbackIdx = -1;

      for (let i = 0; i < this.items.length; i++) {
        const el = document.getElementById(this.items[i].id);
        if (!el) continue;
        const d = Math.abs(viewTop - el.getBoundingClientRect().top);
        if (d < min) {
          fallbackIdx = i;
          min = d;
        }
      }

      if (fallbackIdx !== -1) {
        this.items[fallbackIdx] = {
          ...this.items[fallbackIdx],
          active: true,
          fallback: true,
        };
      }
    }

    this.onChange?.();
  }

  setItems(ids: string[]) {
    if (this.observer) {
      for (const item of this.items) {
        const el = document.getElementById(item.id);
        if (el) this.observer.unobserve(el);
      }
    }

    this.items = ids.map((id) => ({ id, active: false, fallback: false }));
    this.observeAll();
  }

  watch() {
    if (this.observer) return;
    this.observer = new IntersectionObserver(this.callback.bind(this), {
      rootMargin: "0px",
      threshold: 0.98,
    });
    this.observeAll();
  }

  private observeAll() {
    if (!this.observer) return;
    for (const item of this.items) {
      const el = document.getElementById(item.id);
      if (el) this.observer.observe(el);
    }
  }

  unwatch() {
    this.observer?.disconnect();
    this.observer = null;
  }
}

// --- SVG path builder (adapted from fumadocs clerk style) ---

function getLineX(level: number): number {
  if (level <= 2) return 6;
  if (level === 3) return 18;
  return 30;
}

interface SvgData {
  width: number;
  height: number;
  path: string;
}

function buildSvgPath(
  headings: TocItem[],
  container: HTMLElement
): SvgData | null {
  if (headings.length === 0) return null;

  let w = 0;
  let h = 0;
  let prevBottom = 0;
  let prevX = 0;
  let d = "";

  for (let i = 0; i < headings.length; i++) {
    const el = container.querySelector<HTMLAnchorElement>(
      `a[href="#${headings[i].id}"]`
    );
    if (!el) continue;

    const styles = getComputedStyle(el);
    const x = getLineX(headings[i].level) + 0.5;
    const top = el.offsetTop + parseFloat(styles.paddingTop);
    const bottom =
      el.offsetTop + el.clientHeight - parseFloat(styles.paddingBottom);

    w = Math.max(x + 8, w);
    h = Math.max(h, bottom);

    if (i === 0) {
      d += `M${x} ${top} L${x} ${bottom}`;
    } else {
      d += ` C${prevX} ${top - 4} ${x} ${prevBottom + 4} ${x} ${top} L${x} ${bottom}`;
    }

    prevX = x;
    prevBottom = bottom;
  }

  return d ? { width: w, height: h, path: d } : null;
}

// --- Thumb position calculator (adapted from fumadocs TocThumb) ---

function calcThumb(
  activeIds: string[],
  container: HTMLElement
): { top: number; height: number } {
  if (activeIds.length === 0) return { top: 0, height: 0 };

  let upper = Infinity;
  let lower = 0;

  for (const id of activeIds) {
    const el = container.querySelector<HTMLAnchorElement>(`a[href="#${id}"]`);
    if (!el) continue;
    const styles = getComputedStyle(el);
    upper = Math.min(upper, el.offsetTop + parseFloat(styles.paddingTop));
    lower = Math.max(
      lower,
      el.offsetTop + el.clientHeight - parseFloat(styles.paddingBottom)
    );
  }

  return upper === Infinity ? { top: 0, height: 0 } : { top: upper, height: lower - upper };
}

// --- Scroll-direction-aware dot (adapted from fumadocs ThumbBox) ---

interface ThumbDotInfo {
  startIdx: number;
  endIdx: number;
  isUp: boolean;
}

function useThumbDot(
  headings: TocItem[],
  activeIds: string[],
  thumb: { top: number; height: number }
): { x: number; y: number; visible: boolean } {
  const previousRef = useRef<ThumbDotInfo | null>(null);

  if (activeIds.length === 0 || thumb.height === 0) {
    return { x: 0, y: 0, visible: false };
  }

  const startIdx = headings.findIndex((h) => activeIds.includes(h.id));
  const endIdx = headings.findLastIndex((h) => activeIds.includes(h.id));

  let isUp = false;
  if (previousRef.current) {
    const prev = previousRef.current;
    isUp =
      prev.startIdx > startIdx ||
      prev.endIdx > endIdx ||
      (prev.startIdx === startIdx && prev.endIdx === endIdx && prev.isUp);
  }
  previousRef.current = { startIdx, endIdx, isUp };

  const targetHeading = headings[isUp ? startIdx : endIdx];
  const x = getLineX(targetHeading.level) + 0.5;
  const y = isUp ? thumb.top : thumb.top + thumb.height;

  return { x, y, visible: true };
}

// --- Component ---

export function Toc({ headings }: { headings: TocItem[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<TocObserver | null>(null);
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const [svg, setSvg] = useState<SvgData | null>(null);
  const [thumb, setThumb] = useState<{ top: number; height: number }>({
    top: 0,
    height: 0,
  });
  const dot = useThumbDot(headings, activeIds, thumb);

  // Initialize observer
  useEffect(() => {
    const obs = new TocObserver();
    observerRef.current = obs;

    obs.onChange = () => {
      const ids = obs.items.filter((i) => i.active).map((i) => i.id);
      setActiveIds(ids);
    };

    // Delay to let headings render
    const timer = setTimeout(() => {
      obs.setItems(headings.map((h) => h.id));
      obs.watch();
    }, 100);

    return () => {
      clearTimeout(timer);
      obs.unwatch();
    };
  }, [headings]);

  // Build SVG + update thumb when layout or active items change
  const refresh = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    setSvg(buildSvgPath(headings, container));
    setThumb(calcThumb(activeIds, container));
  }, [headings, activeIds]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Recalculate on resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(refresh);
    ro.observe(container);
    return () => ro.disconnect();
  }, [refresh]);

  if (headings.length === 0) return null;

  const activeSet = new Set(activeIds);
  const clipPath =
    thumb.height > 0
      ? `polygon(0 ${thumb.top}px, 100% ${thumb.top}px, 100% ${thumb.top + thumb.height}px, 0 ${thumb.top + thumb.height}px)`
      : "polygon(0 0, 0 0, 0 0, 0 0)";

  return (
    <aside className="hidden xl:block w-[220px] flex-shrink-0 sticky top-16 h-fit pr-8">
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
            <path d={svg.path} className="stroke-border" strokeWidth="1" fill="none" />
          </svg>
        )}
        {/* Active snake path (highlighted, clipped) */}
        {svg && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox={`0 0 ${svg.width} ${svg.height}`}
            className="absolute top-0 left-0 pointer-events-none transition-[clip-path] duration-200"
            style={{ width: svg.width, height: svg.height, clipPath }}
          >
            <path d={svg.path} className="stroke-primary" strokeWidth="1.5" fill="none" />
          </svg>
        )}
        {/* Scroll-direction dot on the snake line */}
        {dot.visible && (
          <div
            className="absolute rounded-full bg-primary pointer-events-none transition-[translate] duration-200"
            style={{
              width: 5,
              height: 5,
              translate: `${dot.x - 2.5}px ${dot.y - 2.5}px`,
            }}
          />
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
                activeSet.has(h.id)
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
              style={activeSet.has(h.id) ? { textShadow: "0 0 .5px currentColor" } : undefined}
            >
              {h.text}
            </a>
          ))}
        </nav>
      </div>
    </aside>
  );
}
