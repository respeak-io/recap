"use client";

import { useSearchParams } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface DocsBreadcrumbProps {
  projectName: string;
  projectSlug: string;
  chapterTitle?: string;
  chapterSlug?: string;
  articleTitle?: string;
}

export function DocsBreadcrumb({
  projectName,
  projectSlug,
  chapterTitle,
  chapterSlug,
  articleTitle,
}: DocsBreadcrumbProps) {
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const qs = queryString ? `?${queryString}` : "";

  return (
    <Breadcrumb className="mb-6">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href={`/${projectSlug}${qs}`}>
            {projectName}
          </BreadcrumbLink>
        </BreadcrumbItem>
        {chapterTitle && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {chapterSlug && articleTitle ? (
                <BreadcrumbLink href={`/${projectSlug}/${chapterSlug}${qs}`}>
                  {chapterTitle}
                </BreadcrumbLink>
              ) : (
                <span className="text-muted-foreground">{chapterTitle}</span>
              )}
            </BreadcrumbItem>
          </>
        )}
        {articleTitle && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{articleTitle}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
