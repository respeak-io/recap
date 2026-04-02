"use client";

import { useState, useCallback } from "react";

interface VideoUploadResult {
  videoId: string;
  title: string;
  videoGroupId: string;
}

interface UploadOptions {
  language?: string;
  videoGroupId?: string;
}

export function useVideoUpload(projectId: string) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File, options?: UploadOptions): Promise<VideoUploadResult | null> => {
      setUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append("file", file);
      if (options?.language) formData.append("language", options.language);
      if (options?.videoGroupId) formData.append("videoGroupId", options.videoGroupId);

      try {
        const res = await fetch(
          `/api/projects/${projectId}/media/upload-video`,
          { method: "POST", body: formData }
        );

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Upload failed");
        }

        const result = await res.json();
        return result as VideoUploadResult;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Upload failed";
        setError(msg);
        return null;
      } finally {
        setUploading(false);
      }
    },
    [projectId]
  );

  return { upload, uploading, error };
}
