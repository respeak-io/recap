"use client";

import { useState, useCallback } from "react";

interface UseUploadOptions<T> {
  endpoint: string;
  buildFormData: (file: File, form: FormData) => void;
  parseResult: (json: Record<string, unknown>) => T;
}

export function useUpload<T>(projectId: string, options: UseUploadOptions<T>) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File): Promise<T | null> => {
      setUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append("file", file);
      options.buildFormData(file, formData);

      try {
        const res = await fetch(
          `/api/projects/${projectId}/${options.endpoint}`,
          { method: "POST", body: formData }
        );

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Upload failed");
        }

        const result = await res.json();
        return options.parseResult(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Upload failed";
        setError(msg);
        return null;
      } finally {
        setUploading(false);
      }
    },
    [projectId, options]
  );

  return { upload, uploading, error };
}
