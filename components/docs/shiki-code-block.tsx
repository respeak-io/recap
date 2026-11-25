"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

interface ShikiCodeBlockProps {
  code: string;
  language: string;
  locale: string;
}

function CopyButton({ code, locale }: { code: string; locale: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      return; // No clipboard access (insecure origin, denied): claim nothing.
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  const labels = locale === "de"
    ? { copy: "Code kopieren", copied: "Kopiert" }
    : { copy: "Copy code", copied: "Copied" };
  const label = copied ? labels.copied : labels.copy;

  return (
    <button
      type="button"
      className="docs-code-copy"
      onClick={copy}
      aria-label={label}
      title={label}
      data-copied={copied || undefined}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}

let highlighterPromise: Promise<typeof import("shiki/bundle/web")> | null = null;

function getShiki() {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki/bundle/web");
  }
  return highlighterPromise;
}

export function ShikiCodeBlock({ code, language, locale }: ShikiCodeBlockProps) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getShiki().then(async (shiki) => {
      if (cancelled) return;
      const result = await shiki.codeToHtml(code, {
        lang: language || "text",
        themes: {
          light: "github-light-default",
          dark: "github-dark-default",
        },
        // Emit only --shiki-light/--shiki-dark variables, no inline colors.
        // `.docs-code` in globals.css picks the active set, so switching the
        // theme needs no re-highlight and the block keeps the project's colors.
        defaultColor: false,
        // Comment grey of the light theme is too pale on our tinted surface (4.3:1).
        colorReplacements: {
          "github-light-default": { "#6e7781": "#59636e" },
        },
      });
      if (!cancelled) setHtml(result);
    }).catch((err) => {
      if (process.env.NODE_ENV !== "production") console.warn("[ShikiCodeBlock]", err);
    });
    return () => { cancelled = true; };
  }, [code, language]);

  return (
    <div className="docs-code not-prose">
      {html ? (
        <div dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre>
          <code>{code}</code>
        </pre>
      )}
      <CopyButton code={code} locale={locale} />
    </div>
  );
}
