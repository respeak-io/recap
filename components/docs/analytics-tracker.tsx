"use client";

import { useEffect, useRef } from "react";

interface AnalyticsTrackerProps {
  projectId: string;
  articleSlug: string;
  articleId: string;
  audience: string;
  language: string;
}

export function AnalyticsTracker({
  projectId,
  articleSlug,
  articleId,
  audience,
  language,
}: AnalyticsTrackerProps) {
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;

    fetch("/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "page_view",
        projectId,
        articleSlug,
        articleId,
        audience,
        language,
      }),
    }).catch(() => {
      // Silently ignore tracking failures
    });
  }, [projectId, articleSlug, articleId, audience, language]);

  return null;
}
