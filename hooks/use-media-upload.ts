"use client";

import { useUpload } from "./use-upload";

export function useMediaUpload(projectId: string) {
  const { upload: baseUpload, uploading, error } = useUpload<string>(
    projectId,
    {
      endpoint: "media/upload",
      buildFormData: () => {},
      parseResult: (json) => json.url as string,
    }
  );

  return { upload: baseUpload, uploading, error };
}
