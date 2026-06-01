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
  locale: string;
  chapterTitle?: string;
  chapterSlug?: string;
  articleTitle?: string;
}

export function DocsBreadcrumb({
  projectName,
  projectSlug,
  locale,
  chapterTitle,
  chapterSlug,
  articleTitle,
}: DocsBreadcrumbProps) {
  return (
    <Breadcrumb className="mb-6">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href={`/${locale}/${projectSlug}`}>
            {projectName}
          </BreadcrumbLink>
        </BreadcrumbItem>
        {chapterTitle && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {chapterSlug && articleTitle ? (
                <BreadcrumbLink href={`/${locale}/${projectSlug}/${chapterSlug}`}>
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
