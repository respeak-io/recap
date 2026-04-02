"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Video } from "lucide-react";

interface VideoItem {
  id: string;
  title: string;
}

interface VideoPickerProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (video: VideoItem) => void;
}

export function VideoPicker({ projectId, open, onOpenChange, onSelect }: VideoPickerProps) {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);

    const supabase = createClient();
    supabase
      .from("videos")
      .select("id, title")
      .eq("project_id", projectId)
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setVideos(data ?? []);
        setLoading(false);
      });
  }, [open, projectId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Insert Video</DialogTitle>
        </DialogHeader>
        <div className="max-h-64 overflow-y-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
          ) : videos.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No videos in this project. Upload a video first.
            </p>
          ) : (
            <div className="space-y-1">
              {videos.map((video) => (
                <button
                  key={video.id}
                  onClick={() => {
                    onSelect(video);
                    onOpenChange(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                >
                  <Video className="size-4 shrink-0 text-muted-foreground" />
                  <span>{video.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
