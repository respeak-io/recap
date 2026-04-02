"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Upload, ImageIcon, Video, Languages } from "lucide-react";
import { useMediaUpload } from "@/hooks/use-media-upload";
import { useVideoUpload } from "@/hooks/use-video-upload";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

export type MediaPickerTab = "images" | "videos";

interface ImageRow {
  id: string;
  storage_path: string;
  filename: string;
}

interface VideoRow {
  id: string;
  title: string;
  language: string;
  video_group_id: string;
}

interface VideoGroup {
  videoGroupId: string;
  title: string;
  languages: string[];
}

interface MediaPickerProps {
  projectId: string;
  open: boolean;
  defaultTab?: MediaPickerTab;
  onOpenChange: (open: boolean) => void;
  onSelectImage: (url: string) => void;
  onSelectVideoGroup: (videoGroupId: string, title: string) => void;
}

export function MediaPicker({
  projectId,
  open,
  defaultTab = "images",
  onOpenChange,
  onSelectImage,
  onSelectVideoGroup,
}: MediaPickerProps) {
  const [tab, setTab] = useState<MediaPickerTab>(defaultTab);
  const [images, setImages] = useState<ImageRow[]>([]);
  const [videoGroups, setVideoGroups] = useState<VideoGroup[]>([]);
  const [loading, setLoading] = useState(false);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const { upload: uploadImage, uploading: uploadingImage } = useMediaUpload(projectId);
  const { upload: uploadVideo, uploading: uploadingVideo } = useVideoUpload(projectId);

  // Sync defaultTab when it changes externally
  useEffect(() => {
    if (open) {
      setTab(defaultTab);
    }
  }, [defaultTab, open]);

  // Fetch data when dialog opens
  useEffect(() => {
    if (!open) return;

    async function fetchMedia() {
      setLoading(true);
      const supabase = createClient();

      const [imagesResult, videosResult] = await Promise.all([
        supabase
          .from("images")
          .select("id, storage_path, filename")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false }),
        supabase
          .from("videos")
          .select("id, title, language, video_group_id")
          .eq("project_id", projectId)
          .eq("status", "ready")
          .order("created_at", { ascending: false }),
      ]);

      if (imagesResult.error) {
        console.error("[MediaPicker] Failed to load images:", imagesResult.error.message);
      }
      if (videosResult.error) {
        console.error("[MediaPicker] Failed to load videos:", videosResult.error.message);
      }

      if (imagesResult.data) {
        setImages(imagesResult.data);
      }

      if (videosResult.data) {
        // Group videos by video_group_id
        const groupMap = new Map<string, VideoGroup>();
        for (const video of videosResult.data as VideoRow[]) {
          const existing = groupMap.get(video.video_group_id);
          if (existing) {
            existing.languages.push(video.language);
          } else {
            groupMap.set(video.video_group_id, {
              videoGroupId: video.video_group_id,
              title: video.title,
              languages: [video.language],
            });
          }
        }
        setVideoGroups(Array.from(groupMap.values()));
      }

      setLoading(false);
    }

    fetchMedia();
  }, [open, projectId]);

  function getImageUrl(storagePath: string) {
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/${storagePath}`;
  }

  async function handleImageUpload(file: File) {
    const url = await uploadImage(file);
    if (url) {
      toast.success("Image uploaded");
      onSelectImage(url);
      onOpenChange(false);
    } else {
      toast.error("Image upload failed");
    }
  }

  async function handleVideoUpload(file: File) {
    const result = await uploadVideo(file);
    if (result) {
      toast.success("Video uploaded");
      onSelectVideoGroup(result.videoGroupId, result.title);
      onOpenChange(false);
    } else {
      toast.error("Video upload failed");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Media</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as MediaPickerTab)}>
          <TabsList>
            <TabsTrigger value="images" className="gap-1.5">
              <ImageIcon className="h-4 w-4" />
              Images
            </TabsTrigger>
            <TabsTrigger value="videos" className="gap-1.5">
              <Video className="h-4 w-4" />
              Videos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="images" className="mt-4 space-y-4">
            <div className="flex justify-end">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file);
                  e.target.value = "";
                }}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={uploadingImage}
                onClick={() => imageInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-1.5" />
                {uploadingImage ? "Uploading..." : "Upload image"}
              </Button>
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
            ) : images.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No images yet. Upload one to get started.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-3 max-h-80 overflow-y-auto">
                {images.map((image) => (
                  <button
                    key={image.id}
                    className="group relative aspect-square rounded-md border overflow-hidden hover:ring-2 hover:ring-primary transition-all"
                    onClick={() => {
                      onSelectImage(getImageUrl(image.storage_path));
                      onOpenChange(false);
                    }}
                  >
                    <img
                      src={getImageUrl(image.storage_path)}
                      alt={image.filename}
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-black/50 px-2 py-1 text-xs text-white truncate opacity-0 group-hover:opacity-100 transition-opacity">
                      {image.filename}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="videos" className="mt-4 space-y-4">
            <div className="flex justify-end">
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleVideoUpload(file);
                  e.target.value = "";
                }}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={uploadingVideo}
                onClick={() => videoInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-1.5" />
                {uploadingVideo ? "Uploading..." : "Upload video"}
              </Button>
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
            ) : videoGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No videos yet. Upload one to get started.
              </p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {videoGroups.map((group) => (
                  <button
                    key={group.videoGroupId}
                    className="flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left hover:bg-accent/50 transition-colors"
                    onClick={() => {
                      onSelectVideoGroup(group.videoGroupId, group.title);
                      onOpenChange(false);
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <Video className="h-5 w-5 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium">{group.title}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Languages className="h-3.5 w-3.5 text-muted-foreground" />
                      {group.languages.map((lang) => (
                        <span
                          key={lang}
                          className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
                        >
                          {lang.toUpperCase()}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
