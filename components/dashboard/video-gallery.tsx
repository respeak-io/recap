"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronRight, Video, Trash2 } from "lucide-react";

interface VideoItem {
  id: string;
  title: string;
  status: string;
  created_at: string;
}

export function VideoGallery({ videos: initialVideos }: { videos: VideoItem[] }) {
  const router = useRouter();
  const [videos, setVideos] = useState(initialVideos);

  async function handleDelete(videoId: string) {
    await fetch(`/api/videos/${videoId}`, { method: "DELETE" });
    setVideos((prev) => prev.filter((v) => v.id !== videoId));
    router.refresh();
  }

  if (videos.length === 0) return null;

  return (
    <Collapsible>
      <CollapsibleTrigger className="flex items-center gap-2 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ChevronRight className="size-4 transition-transform [[data-state=open]>&]:rotate-90" />
        <Video className="size-4" />
        Source Videos
        <span className="text-xs font-normal ml-1">({videos.length})</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid gap-2 ml-6 mt-2">
          {videos.map((video) => (
            <div
              key={video.id}
              className="flex items-center justify-between rounded-md border p-2.5 group"
            >
              <div className="flex items-center gap-3">
                <Video className="size-4 text-muted-foreground" />
                <span className="text-sm">{video.title}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    video.status === "ready"
                      ? "default"
                      : video.status === "failed"
                        ? "destructive"
                        : "secondary"
                  }
                  className="text-xs"
                >
                  {video.status}
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
                      <AlertDialogTitle>Delete video?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete &quot;{video.title}&quot; and its source file. Generated articles will remain.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(video.id)}>
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
