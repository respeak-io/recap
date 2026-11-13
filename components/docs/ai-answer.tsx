import { FileText, Sparkles } from "lucide-react";
import { AnswerMarkdown } from "./answer-markdown";

export type AiAnswerState =
  | { status: "loading" }
  | { status: "ready"; text: string };

interface AiAnswerSource {
  id: string;
  title: string;
  slug: string;
}

const LABELS = {
  de: {
    title: "KI-Antwort",
    loading: "Antwort wird erstellt …",
    sources: "Quellen",
    disclaimer: "KI-generiert, kann Fehler enthalten. Die verlinkten Artikel sind maßgeblich.",
  },
  en: {
    title: "AI answer",
    loading: "Generating answer…",
    sources: "Sources",
    disclaimer: "AI-generated and may contain mistakes. The linked articles are authoritative.",
  },
} as const;

/**
 * AI answer card in the docs search: formatted answer, a loading skeleton, and
 * the articles the answer was generated from as clickable sources.
 */
export function AiAnswer({
  state,
  sources,
  locale,
  onOpenSource,
}: {
  state: AiAnswerState;
  sources: AiAnswerSource[];
  locale: string;
  onOpenSource: (slug: string) => void;
}) {
  const t = locale === "de" ? LABELS.de : LABELS.en;
  const loading = state.status === "loading";
  // Show the articles the answer actually cites (it is told to cite titles);
  // if it cites none by name, the top result it was given.
  const cited =
    state.status === "ready" ? sources.filter((s) => state.text.includes(s.title)) : [];
  const shownSources = cited.length > 0 ? cited : sources.slice(0, 1);

  return (
    <section
      aria-live="polite"
      aria-busy={loading}
      className="mb-2 rounded-lg border border-primary/15 bg-primary/[0.04] p-3"
    >
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-primary">
        <Sparkles className={`size-3.5 ${loading ? "animate-pulse" : ""}`} aria-hidden />
        {t.title}
      </p>

      {loading ? (
        <div className="space-y-2" aria-label={t.loading}>
          <div className="h-3 w-full animate-pulse rounded bg-primary/10" />
          <div className="h-3 w-11/12 animate-pulse rounded bg-primary/10" />
          <div className="h-3 w-3/5 animate-pulse rounded bg-primary/10" />
          <span className="sr-only">{t.loading}</span>
        </div>
      ) : (
        <div className="text-sm leading-relaxed text-foreground/85">
          <AnswerMarkdown text={state.text} />
        </div>
      )}

      {!loading && shownSources.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{t.sources}:</span>
          {shownSources.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onOpenSource(s.slug)}
              className="inline-flex max-w-full items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-xs text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <FileText className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{s.title}</span>
            </button>
          ))}
        </div>
      )}

      {!loading && <p className="mt-2 text-[11px] text-muted-foreground">{t.disclaimer}</p>}
    </section>
  );
}
