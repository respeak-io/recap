import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface NavItem {
  title: string;
  description?: string;
  slug: string;
}

interface PageNavProps {
  prev?: NavItem | null;
  next?: NavItem | null;
  projectSlug: string;
  lang: string;
}

export function PageNav({ prev, next, projectSlug, lang }: PageNavProps) {
  if (!prev && !next) return null;

  const qs = lang !== "en" ? `?lang=${lang}` : "";

  return (
    <div className="grid grid-cols-2 gap-4 mt-12 pt-6 border-t">
      {prev ? (
        <Link
          href={`/${projectSlug}/${prev.slug}${qs}`}
          className="group flex flex-col gap-1 rounded-xl border p-4 transition-colors hover:bg-accent/50"
        >
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <ChevronLeft className="size-3.5" />
            Previous
          </span>
          <span className="font-medium group-hover:text-accent-foreground">
            {prev.title}
          </span>
          {prev.description && (
            <span className="text-sm text-muted-foreground line-clamp-1">
              {prev.description}
            </span>
          )}
        </Link>
      ) : (
        <div />
      )}
      {next ? (
        <Link
          href={`/${projectSlug}/${next.slug}${qs}`}
          className="group flex flex-col items-end gap-1 rounded-xl border p-4 transition-colors hover:bg-accent/50 text-right"
        >
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            Next
            <ChevronRight className="size-3.5" />
          </span>
          <span className="font-medium group-hover:text-accent-foreground">
            {next.title}
          </span>
          {next.description && (
            <span className="text-sm text-muted-foreground line-clamp-1">
              {next.description}
            </span>
          )}
        </Link>
      ) : (
        <div />
      )}
    </div>
  );
}
