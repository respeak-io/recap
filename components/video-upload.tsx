"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProcessingStatus } from "./processing-status";

const AUDIENCES = [
  { id: "developers", label: "Developers" },
  { id: "end-users", label: "End Users" },
  { id: "ai-agents", label: "AI Agents" },
];

const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "de", label: "Deutsch" },
  { id: "es", label: "Espanol" },
  { id: "fr", label: "Francais" },
  { id: "ja", label: "Japanese" },
  { id: "zh", label: "Chinese" },
  { id: "ko", label: "Korean" },
  { id: "pt", label: "Portugues" },
];

export function VideoUpload({ projectId }: { projectId: string }) {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [audiences, setAudiences] = useState<string[]>(["developers"]);
  const [languages, setLanguages] = useState<string[]>(["en"]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [processingVideoId, setProcessingVideoId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const supabase = createClient();

  function toggleAudience(id: string) {
    setAudiences((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }

  function toggleLanguage(id: string) {
    setLanguages((prev) => {
      if (prev.includes(id)) {
        // Don't allow removing the last language
        if (prev.length <= 1) return prev;
        return prev.filter((l) => l !== id);
      }
      return [...prev, id];
    });
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      const urlRes = await fetch("/api/videos/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const { videoId, uploadUrl } = await urlRes.json();

      if (!uploadUrl) throw new Error("Failed to get upload URL");

      setUploadProgress(10);
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!uploadRes.ok) throw new Error("Upload failed");
      setUploadProgress(80);

      await supabase
        .from("videos")
        .update({ title: title || file.name })
        .eq("id", videoId);

      setUploadProgress(100);
      setUploading(false);

      // Switch to processing view
      setProcessingVideoId(videoId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setUploading(false);
    }
  }

  function handleProcessingComplete() {
    setProcessingVideoId(null);
    setTitle("");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    router.refresh();
  }

  // Show processing status after upload
  if (processingVideoId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Processing video</CardTitle>
        </CardHeader>
        <CardContent>
          <ProcessingStatus
            videoId={processingVideoId}
            audiences={audiences}
            languages={languages}
            onComplete={handleProcessingComplete}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload video</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleUpload} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="video-title">Title</Label>
            <Input
              id="video-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Getting Started Tutorial"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="video-file">Video file</Label>
            <Input
              id="video-file"
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label>Target audiences</Label>
            <div className="flex gap-3">
              {AUDIENCES.map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={audiences.includes(a.id)}
                    onChange={() => toggleAudience(a.id)}
                    className="rounded"
                  />
                  {a.label}
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Languages</Label>
            <p className="text-xs text-muted-foreground">
              First selected language is the primary. Others will be translated.
            </p>
            <div className="flex flex-wrap gap-3">
              {LANGUAGES.map((l) => (
                <label key={l.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={languages.includes(l.id)}
                    onChange={() => toggleLanguage(l.id)}
                    className="rounded"
                  />
                  {l.label}
                </label>
              ))}
            </div>
          </div>
          {uploading && (
            <div className="w-full bg-secondary rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={uploading || !file}>
            {uploading ? "Uploading..." : "Upload & generate docs"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
