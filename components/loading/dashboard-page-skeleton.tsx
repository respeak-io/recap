import { Skeleton } from "@/components/ui/skeleton";

/**
 * Placeholder shown by `loading.tsx` while a dashboard page renders on the
 * server. Mirrors the page chrome (h-14 breadcrumb header + p-6 content) so
 * nothing jumps when the real page streams in.
 */
export function DashboardPageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <Skeleton className="size-7" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    </div>
  );
}
