"use client";

import { useEffect, useState } from "react";

interface ShikiCodeBlockProps {
  code: string;
  language: string;
}

let highlighterPromise: Promise<typeof import("shiki/bundle/web")> | null = null;

function getShiki() {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki/bundle/web");
  }
  return highlighterPromise;
}

export function ShikiCodeBlock({ code, language }: ShikiCodeBlockProps) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getShiki().then(async (shiki) => {
      if (cancelled) return;
      const result = await shiki.codeToHtml(code, {
        lang: language || "text",
        themes: {
          light: "github-light",
          dark: "github-dark",
        },
      });
      if (!cancelled) setHtml(result);
    }).catch(() => {
      // Shiki failed to load — keep showing plain fallback
    });
    return () => { cancelled = true; };
  }, [code, language]);

  if (html) {
    return (
      <div
        className="rounded-lg overflow-x-auto text-sm leading-relaxed [&_pre]:p-4 [&_pre]:m-0"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <pre className="rounded-lg bg-muted p-4 overflow-x-auto text-sm leading-relaxed">
      <code>{code}</code>
    </pre>
  );
}
