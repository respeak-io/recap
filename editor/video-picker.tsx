"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, Video } from "lucide-react";
import { useVideoUpload } from "@/hooks/use-video-upload";

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { upload, uploading, error } = useVideoUpload(projectId);

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

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const result = await upload(file);
    if (result) {
      onSelect({ id: result.videoId, title: result.title });
      onOpenChange(false);
    }

    // Reset input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Insert Video</DialogTitle>
        </DialogHeader>

        {/* Upload button */}
        <div className="border-b pb-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={handleFileSelect}
          />
          <Button
            variant="outline"
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="size-4 mr-2" />
            {uploading ? "Uploading..." : "Upload new video"}
          </Button>
          <p className="text-xs text-muted-foreground mt-1.5 text-center">
            MP4, WebM, or MOV — max 25MB
          </p>
          {error && (
            <p className="text-xs text-destructive mt-1.5 text-center">{error}</p>
          )}
        </div>

        {/* Existing videos list */}
        <div className="max-h-64 overflow-y-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
          ) : videos.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No existing videos in this project.
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
