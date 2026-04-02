"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Save, Loader2 } from "lucide-react";
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

interface Props {
  image: ImageItem | null;
  projectId: string;
  onClose: () => void;
  onUpdate: () => void;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

interface UsageItem {
  type: string;
  title: string;
  slug: string;
}

export function ImageDetailDialog({
  image,
  projectId,
  onClose,
  onUpdate,
}: Props) {
  const [altText, setAltText] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [usedIn, setUsedIn] = useState<UsageItem[]>([]);
  const [loadingUsage, setLoadingUsage] = useState(false);

  useEffect(() => {
    if (image) {
      setAltText(image.alt_text || "");
      setConfirmDelete(false);
      setLoadingUsage(true);
      fetch(
        `/api/projects/${projectId}/media/usage?type=image&needle=${encodeURIComponent(image.storage_path)}`
      )
        .then((res) => res.json())
        .then((data) => setUsedIn(data.usedIn ?? []))
        .catch(() => setUsedIn([]))
        .finally(() => setLoadingUsage(false));
    }
  }, [image, projectId]);

  const handleSaveAlt = async () => {
    if (!image) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/media/images/${image.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ altText }),
        }
      );
      if (!res.ok) throw new Error("Failed to update");
      toast.success("Alt text updated");
      onUpdate();
    } catch {
      toast.error("Failed to save alt text");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!image) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/media/images/${image.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Image deleted");
      onUpdate();
      onClose();
    } catch {
      toast.error("Failed to delete image");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const formatBytes = (bytes: number | null) => {
    if (bytes === null) return "Unknown";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Dialog open={!!image} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="truncate">{image?.filename}</DialogTitle>
        </DialogHeader>

        {image && (
          <div className="space-y-4">
            {/* Preview */}
            <div className="rounded-lg overflow-hidden border bg-muted flex items-center justify-center max-h-80">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${SUPABASE_URL}/storage/v1/object/public/assets/${image.storage_path}`}
                alt={image.alt_text || image.filename}
                className="max-h-80 object-contain"
              />
            </div>

            {/* Alt text */}
            <div className="space-y-2">
              <Label htmlFor="alt-text">Alt Text</Label>
              <div className="flex gap-2">
                <Input
                  id="alt-text"
                  value={altText}
                  onChange={(e) => setAltText(e.target.value)}
                  placeholder="Describe this image..."
                />
                <Button onClick={handleSaveAlt} disabled={saving} size="sm">
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Info */}
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Size: {formatBytes(image.size_bytes)}</p>
              {image.width && image.height && (
                <p>
                  Dimensions: {image.width} x {image.height}
                </p>
              )}
              <p>
                Uploaded: {new Date(image.created_at).toLocaleDateString()}
              </p>
            </div>

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

            {/* Delete */}
            <div className="flex justify-end pt-2 border-t">
              {confirmDelete && usedIn.length > 0 && (
                <p className="text-sm text-destructive mr-auto self-center">
                  This image is used in {usedIn.length} place(s). Deleting it
                  will break those references.
                </p>
              )}
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <Loader2 className="size-4 animate-spin mr-2" />
                ) : (
                  <Trash2 className="size-4 mr-2" />
                )}
                {confirmDelete ? "Confirm Delete" : "Delete"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
