"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Trash2, Upload, Loader2, Video } from "lucide-react";
import { useVideoUpload } from "@/hooks/use-video-upload";
import { toast } from "sonner";

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

interface Props {
  group: VideoGroup | null;
  projectId: string;
  onClose: () => void;
  onUpdate: () => void;
}

interface UsageItem {
  type: string;
  title: string;
  slug: string;
}

const AVAILABLE_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "de", label: "German" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" },
];

export function VideoGroupDetailDialog({
  group,
  projectId,
  onClose,
  onUpdate,
}: Props) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [usedIn, setUsedIn] = useState<UsageItem[]>([]);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("");

  const { upload: uploadVideo, uploading } = useVideoUpload(projectId);
  const variantInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (group) {
      setSelectedLanguage("");
      setLoadingUsage(true);
      fetch(
        `/api/projects/${projectId}/media/usage?type=video&needle=${encodeURIComponent(group.videoGroupId)}`
      )
        .then((res) => res.json())
        .then((data) => setUsedIn(data.usedIn ?? []))
        .catch(() => setUsedIn([]))
        .finally(() => setLoadingUsage(false));
    }
  }, [group, projectId]);

  const handleDeleteVariant = async (videoId: string) => {
    setDeletingId(videoId);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/media/videos/${videoId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Video variant deleted");
      onUpdate();

      // Close dialog if last variant deleted
      if (group && group.videos.length <= 1) {
        onClose();
      }
    } catch {
      toast.error("Failed to delete video variant");
    } finally {
      setDeletingId(null);
    }
  };

  const handleAddVariant = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !group || !selectedLanguage) return;
    e.target.value = "";

    const result = await uploadVideo(file, {
      language: selectedLanguage,
      videoGroupId: group.videoGroupId,
    });
    if (result) {
      toast.success(`Added ${selectedLanguage.toUpperCase()} variant`);
      setSelectedLanguage("");
      onUpdate();
    } else {
      toast.error("Failed to upload video variant");
    }
  };

  const missingLanguages = group
    ? AVAILABLE_LANGUAGES.filter(
        (l) => !group.languages.includes(l.code)
      )
    : [];

  return (
    <Dialog open={!!group} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="truncate">{group?.title}</DialogTitle>
        </DialogHeader>

        {group && (
          <div className="space-y-4">
            {/* Language variants */}
            <div>
              <p className="text-sm font-medium mb-2">Language Variants</p>
              <div className="space-y-2">
                {group.videos.map((video) => (
                  <div
                    key={video.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <Video className="size-4 text-muted-foreground" />
                      <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                        {video.language.toUpperCase()}
                      </span>
                      <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                        {video.title}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeleteVariant(video.id)}
                      disabled={deletingId !== null}
                    >
                      {deletingId === video.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Add variant */}
            {missingLanguages.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">
                  Add Language Variant
                </p>
                <div className="flex gap-2">
                  <Select
                    value={selectedLanguage}
                    onValueChange={setSelectedLanguage}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent>
                      {missingLanguages.map((lang) => (
                        <SelectItem key={lang.code} value={lang.code}>
                          {lang.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <input
                    ref={variantInputRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={handleAddVariant}
                  />
                  <Button
                    variant="outline"
                    disabled={!selectedLanguage || uploading}
                    onClick={() => variantInputRef.current?.click()}
                  >
                    {uploading ? (
                      <Loader2 className="size-4 animate-spin mr-2" />
                    ) : (
                      <Upload className="size-4 mr-2" />
                    )}
                    {uploading ? "Uploading..." : "Upload"}
                  </Button>
                </div>
              </div>
            )}

            {/* Used in */}
            <div>
              <p className="text-sm font-medium mb-1">Used in</p>
              {loadingUsage ? (
                <p className="text-sm text-muted-foreground">Checking...</p>
              ) : usedIn.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Not used in any content.
                </p>
              ) : (
                <ul className="text-sm space-y-1">
                  {usedIn.map((item, i) => (
                    <li key={`${item.type}-${item.slug}`} className="text-muted-foreground">
                      {item.type}: {item.title}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Meta info */}
            <div className="text-sm text-muted-foreground space-y-1 pt-2 border-t">
              <p>Group ID: {group.videoGroupId}</p>
              <p>
                Created: {new Date(group.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
