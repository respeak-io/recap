"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Upload, ImageIcon, Video, Languages } from "lucide-react";
import { useMediaUpload } from "@/hooks/use-media-upload";
import { useVideoUpload } from "@/hooks/use-video-upload";
import { ImageDetailDialog } from "./image-detail-dialog";
import { VideoGroupDetailDialog } from "./video-group-detail-dialog";
import { toast } from "sonner";

interface ImageItem {
  id: string;
  storage_path: string;
  filename: string;
  alt_text: string;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  created_at: string;
}

interface VideoItem {
  id: string;
  title: string;
  language: string;
  video_group_id: string;
  created_at: string;
  storage_path: string;
}

interface VideoGroup {
  videoGroupId: string;
  title: string;
  languages: string[];
  videos: VideoItem[];
  createdAt: string;
}

function groupVideos(videos: VideoItem[]): VideoGroup[] {
  const map = new Map<string, VideoGroup>();

  for (const v of videos) {
    const existing = map.get(v.video_group_id);
    if (existing) {
      existing.videos.push(v);
      if (!existing.languages.includes(v.language)) {
        existing.languages.push(v.language);
      }
    } else {
      map.set(v.video_group_id, {
        videoGroupId: v.video_group_id,
        title: v.title,
        languages: [v.language],
        videos: [v],
        createdAt: v.created_at,
      });
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export function MediaGallery({ projectId }: { projectId: string }) {
  const supabase = useMemo(() => createClient(), []);

  const [images, setImages] = useState<ImageItem[]>([]);
  const [videoGroups, setVideoGroups] = useState<VideoGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedImage, setSelectedImage] = useState<ImageItem | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<VideoGroup | null>(null);

  const { upload: uploadImage, uploading: uploadingImage } = useMediaUpload(projectId);
  const { upload: uploadVideo, uploading: uploadingVideo } = useVideoUpload(projectId);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const fetchImages = useCallback(async () => {
    const { data } = await supabase
      .from("images")
      .select("id, storage_path, filename, alt_text, width, height, size_bytes, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    setImages((data as ImageItem[]) ?? []);
  }, [projectId, supabase]);

  const fetchVideos = useCallback(async () => {
    const { data } = await supabase
      .from("videos")
      .select("id, title, language, video_group_id, created_at, storage_path")
      .eq("project_id", projectId)
      .eq("status", "ready")
      .order("created_at", { ascending: false });
    setVideoGroups(groupVideos((data as VideoItem[]) ?? []));
  }, [projectId, supabase]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchImages(), fetchVideos()]);
    setLoading(false);
  }, [fetchImages, fetchVideos]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const url = await uploadImage(file);
    if (url) {
      toast.success("Image uploaded");
      fetchImages();
    } else {
      toast.error("Failed to upload image");
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const result = await uploadVideo(file);
    if (result) {
      toast.success("Video uploaded");
      fetchVideos();
    } else {
      toast.error("Failed to upload video");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Loading media...
      </div>
    );
  }

  return (
    <>
      <Tabs defaultValue="images">
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="images" className="gap-2">
              <ImageIcon className="size-4" />
              Images ({images.length})
            </TabsTrigger>
            <TabsTrigger value="videos" className="gap-2">
              <Video className="size-4" />
              Videos ({videoGroups.length})
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="images">
          <div className="mb-4">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
            <Button
              variant="outline"
              onClick={() => imageInputRef.current?.click()}
              disabled={uploadingImage}
            >
              <Upload className="size-4 mr-2" />
              {uploadingImage ? "Uploading..." : "Upload Image"}
            </Button>
          </div>

          {images.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <ImageIcon className="size-12 mb-4 opacity-40" />
              <p className="text-lg font-medium">No images yet</p>
              <p className="text-sm">Upload an image to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {images.map((img) => (
                <button
                  key={img.id}
                  className="group relative aspect-square rounded-lg overflow-hidden border bg-muted hover:ring-2 hover:ring-ring transition-all cursor-pointer"
                  onClick={() => setSelectedImage(img)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${SUPABASE_URL}/storage/v1/object/public/assets/${img.storage_path}`}
                    alt={img.alt_text || img.filename}
                    className="object-cover w-full h-full"
                    loading="lazy"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-white text-xs truncate">{img.filename}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="videos">
          <div className="mb-4">
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleVideoUpload}
            />
            <Button
              variant="outline"
              onClick={() => videoInputRef.current?.click()}
              disabled={uploadingVideo}
            >
              <Upload className="size-4 mr-2" />
              {uploadingVideo ? "Uploading..." : "Upload Video"}
            </Button>
          </div>

          {videoGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Video className="size-12 mb-4 opacity-40" />
              <p className="text-lg font-medium">No videos yet</p>
              <p className="text-sm">Upload a video to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {videoGroups.map((group) => (
                <button
                  key={group.videoGroupId}
                  className="text-left rounded-lg border p-4 hover:ring-2 hover:ring-ring transition-all cursor-pointer"
                  onClick={() => setSelectedGroup(group)}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Video className="size-5 text-muted-foreground" />
                    <h3 className="font-medium truncate">{group.title}</h3>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Languages className="size-4" />
                    <div className="flex gap-1 flex-wrap">
                      {group.languages.map((lang) => (
                        <span
                          key={lang}
                          className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium"
                        >
                          {lang.toUpperCase()}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {new Date(group.createdAt).toLocaleDateString()}
                  </p>
                </button>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ImageDetailDialog
        image={selectedImage}
        projectId={projectId}
        onClose={() => setSelectedImage(null)}
        onUpdate={fetchImages}
      />

      <VideoGroupDetailDialog
        group={selectedGroup}
        projectId={projectId}
        onClose={() => setSelectedGroup(null)}
        onUpdate={fetchVideos}
      />
    </>
  );
}
