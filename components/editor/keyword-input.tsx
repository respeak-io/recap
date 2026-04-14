"use client";

import { useState, type KeyboardEvent, type ClipboardEvent } from "react";
import { MAX_KEYWORDS, normalizeKeywords } from "@/lib/keywords";

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
};

export function KeywordInput({ value, onChange }: Props) {
  const [input, setInput] = useState("");
  const atMax = value.length >= MAX_KEYWORDS;

  function commit(raw: string) {
    if (!raw.trim()) return;
    const merged = normalizeKeywords([...value, raw]).slice(0, MAX_KEYWORDS);
    if (merged.length === value.length) return; // duplicate or empty after normalize
    onChange(merged);
    setInput("");
  }

  function commitMany(parts: string[]) {
    const merged = normalizeKeywords([...value, ...parts]).slice(0, MAX_KEYWORDS);
    if (merged.length === value.length) return;
    onChange(merged);
    setInput("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(input);
      return;
    }
    if (e.key === "Backspace" && input === "" && value.length > 0) {
      e.preventDefault();
      onChange(value.slice(0, -1));
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    if (!text.includes(",")) return; // let normal typing happen
    e.preventDefault();
    commitMany(text.split(","));
  }

  function removeAt(idx: number) {
    const next = value.slice();
    next.splice(idx, 1);
    onChange(next);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 py-1">
      {value.map((kw, idx) => (
        <span
          key={`${kw}-${idx}`}
          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
        >
          {kw}
          <button
            type="button"
            aria-label={`Remove ${kw}`}
            onClick={() => removeAt(idx)}
            className="text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        disabled={atMax}
        placeholder={atMax ? "" : value.length === 0 ? "Add keywords..." : ""}
        className="flex-1 min-w-[8ch] bg-transparent text-xs outline-none placeholder:text-muted-foreground/50 disabled:cursor-not-allowed"
      />
      {atMax && (
        <span className="text-xs text-muted-foreground">Max {MAX_KEYWORDS} keywords</span>
      )}
    </div>
  );
}
