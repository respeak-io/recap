"use client";

import { useState, useCallback } from "react";
import { useUpload } from "./use-upload";

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
  const [uploadOptions, setUploadOptions] = useState<UploadOptions>({});

  const { upload: baseUpload, uploading, error } = useUpload<VideoUploadResult>(
    projectId,
    {
      endpoint: "media/upload-video",
      buildFormData: (_file, form) => {
        if (uploadOptions.language) form.append("language", uploadOptions.language);
        if (uploadOptions.videoGroupId) form.append("videoGroupId", uploadOptions.videoGroupId);
      },
      parseResult: (json) => json as unknown as VideoUploadResult,
    }
  );

  const upload = useCallback(
    async (file: File, options?: UploadOptions): Promise<VideoUploadResult | null> => {
      setUploadOptions(options ?? {});
      return baseUpload(file);
    },
    [baseUpload]
  );

  return { upload, uploading, error };
}
