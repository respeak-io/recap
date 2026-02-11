"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronRight, GripVertical, FileText, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Article {
  id: string;
  title: string;
  slug: string;
  audience: string;
  language: string;
  status: string;
  order: number;
  chapter_id: string | null;
}

interface Chapter {
  id: string;
  title: string;
  slug: string;
  order: number;
}

interface ArticleTreeProps {
  projectSlug: string;
  chapters: Chapter[];
  articles: Article[];
  audiences: string[];
  languages: string[];
}

export function ArticleTree({
  projectSlug,
  chapters,
  articles: initialArticles,
  audiences,
  languages,
}: ArticleTreeProps) {
  const router = useRouter();
  const [articles, setArticles] = useState(initialArticles);
  const [audienceFilter, setAudienceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [langFilter, setLangFilter] = useState<string>("all");

  const filtered = articles.filter((a) => {
    if (audienceFilter !== "all" && a.audience !== audienceFilter) return false;
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (langFilter !== "all" && a.language !== langFilter) return false;
    return true;
  });

  // Group by chapter
  const grouped = chapters
    .map((ch) => ({
      ...ch,
      articles: filtered
        .filter((a) => a.chapter_id === ch.id)
        .sort((a, b) => a.order - b.order),
    }))
    .filter((ch) => ch.articles.length > 0);

  // Uncategorized articles (no chapter)
  const uncategorized = filtered
    .filter((a) => !a.chapter_id)
    .sort((a, b) => a.order - b.order);

  async function handleDelete(articleId: string) {
    await fetch(`/api/articles/${articleId}`, { method: "DELETE" });
    setArticles((prev) => prev.filter((a) => a.id !== articleId));
    router.refresh();
  }

  async function handleDragEnd(result: DropResult) {
    if (!result.destination) return;

    const destChapter = result.destination.droppableId;
    const articleId = result.draggableId;

    // Reorder locally
    const updated = [...articles];
    const article = updated.find((a) => a.id === articleId);
    if (!article) return;

    article.chapter_id = destChapter === "uncategorized" ? null : destChapter;
    article.order = result.destination.index;

    setArticles(updated);

    // Persist to backend
    const chapterArticles = updated
      .filter((a) =>
        destChapter === "uncategorized"
          ? !a.chapter_id
          : a.chapter_id === destChapter
      )
      .sort((a, b) => a.order - b.order)
      .map((a, i) => ({
        id: a.id,
        order: i,
        chapter_id: a.chapter_id,
      }));

    await fetch("/api/articles/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: chapterArticles }),
    });
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={audienceFilter} onValueChange={setAudienceFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Audience" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All audiences</SelectItem>
            {audiences.map((a) => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
          </SelectContent>
        </Select>

        <Select value={langFilter} onValueChange={setLangFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Language" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All languages</SelectItem>
            {languages.map((l) => (
              <SelectItem key={l} value={l}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tree */}
      <DragDropContext onDragEnd={handleDragEnd}>
        {grouped.map((chapter) => (
          <Collapsible key={chapter.id} defaultOpen>
            <CollapsibleTrigger className="flex items-center gap-2 py-2 text-sm font-semibold uppercase text-muted-foreground hover:text-foreground w-full">
              <ChevronRight className="size-4 transition-transform [[data-state=open]>&]:rotate-90" />
              {chapter.title}
              <span className="text-xs font-normal ml-auto">{chapter.articles.length}</span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Droppable droppableId={chapter.id}>
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1 ml-4">
                    {chapter.articles.map((article, index) => (
                      <ArticleRow
                        key={article.id}
                        article={article}
                        index={index}
                        projectSlug={projectSlug}
                        onDelete={handleDelete}
                      />
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </CollapsibleContent>
          </Collapsible>
        ))}

        {uncategorized.length > 0 && (
          <div>
            <p className="py-2 text-sm font-semibold uppercase text-muted-foreground">
              Uncategorized
            </p>
            <Droppable droppableId="uncategorized">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1 ml-4">
                  {uncategorized.map((article, index) => (
                    <ArticleRow
                      key={article.id}
                      article={article}
                      index={index}
                      projectSlug={projectSlug}
                      onDelete={handleDelete}
                    />
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        )}
      </DragDropContext>
    </div>
  );
}

function ArticleRow({
  article,
  index,
  projectSlug,
  onDelete,
}: {
  article: Article;
  index: number;
  projectSlug: string;
  onDelete: (id: string) => void;
}) {
  return (
    <Draggable draggableId={article.id} index={index}>
      {(provided) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className="flex items-center gap-2 rounded-md border bg-background p-2 hover:bg-accent/50 transition-colors group"
        >
          <div {...provided.dragHandleProps} className="cursor-grab">
            <GripVertical className="size-4 text-muted-foreground" />
          </div>
          <FileText className="size-4 text-muted-foreground flex-shrink-0" />
          <Link
            href={`/project/${projectSlug}/article/${article.slug}/edit?audience=${article.audience}&lang=${article.language}`}
            className="flex-1 text-sm font-medium truncate hover:underline"
          >
            {article.title}
          </Link>
          <Badge variant="outline" className="text-xs">{article.language}</Badge>
          <Badge variant="outline" className="text-xs">{article.audience}</Badge>
          <Badge
            variant={article.status === "published" ? "default" : "secondary"}
            className="text-xs"
          >
            {article.status}
          </Badge>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete article?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete &quot;{article.title}&quot;. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(article.id)}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </Draggable>
  );
}
