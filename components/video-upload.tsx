"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { ProcessingStatus } from "./processing-status";
import { Upload } from "lucide-react";

const LANGUAGES = [
  { id: "en", label: "English", flag: "\u{1F1FA}\u{1F1F8}" },
  { id: "de", label: "Deutsch", flag: "\u{1F1E9}\u{1F1EA}" },
  { id: "es", label: "Espanol", flag: "\u{1F1EA}\u{1F1F8}" },
  { id: "fr", label: "Francais", flag: "\u{1F1EB}\u{1F1F7}" },
  { id: "ja", label: "Japanese", flag: "\u{1F1EF}\u{1F1F5}" },
  { id: "zh", label: "Chinese", flag: "\u{1F1E8}\u{1F1F3}" },
  { id: "ko", label: "Korean", flag: "\u{1F1F0}\u{1F1F7}" },
  { id: "pt", label: "Portugues", flag: "\u{1F1E7}\u{1F1F7}" },
];

export function VideoUpload({ projectId }: { projectId: string }) {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [languages, setLanguages] = useState<string[]>(["en"]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [processingVideoId, setProcessingVideoId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const supabase = createClient();

  function toggleLanguage(id: string) {
    setLanguages((prev) => {
      if (prev.includes(id)) {
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

  if (processingVideoId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Processing video</CardTitle>
        </CardHeader>
        <CardContent>
          <ProcessingStatus
            videoId={processingVideoId}
            languages={languages}
            onComplete={handleProcessingComplete}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleUpload} className="space-y-8">
      {/* Video file */}
      <div className="grid gap-6 md:grid-cols-[1fr_1.5fr]">
        <div>
          <Label className="text-base font-medium">Video file</Label>
          <p className="text-sm text-muted-foreground mt-1">
            Upload an MP4, MOV, or WebM file. Screen recordings, product demos, and tutorials work best.
          </p>
        </div>
        <div className="space-y-3">
          <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary transition-colors">
            <Upload className="size-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground mb-2">
              {file ? file.name : "Drag and drop or click to select"}
            </p>
            <Input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="max-w-xs mx-auto"
              required
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Title */}
      <div className="grid gap-6 md:grid-cols-[1fr_1.5fr]">
        <div>
          <Label className="text-base font-medium">Title</Label>
          <p className="text-sm text-muted-foreground mt-1">
            A name for this video. Used as the default title for generated articles.
          </p>
        </div>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Getting Started Tutorial"
        />
      </div>

      <Separator />

      {/* Languages */}
      <div className="grid gap-6 md:grid-cols-[1fr_1.5fr]">
        <div>
          <Label className="text-base font-medium">Languages</Label>
          <p className="text-sm text-muted-foreground mt-1">
            First selected language is the primary. Others will be auto-translated.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((l) => (
            <label
              key={l.id}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                languages.includes(l.id)
                  ? "border-primary bg-primary/5"
                  : "hover:bg-accent/50"
              }`}
            >
              <input
                type="checkbox"
                checked={languages.includes(l.id)}
                onChange={() => toggleLanguage(l.id)}
                className="sr-only"
              />
              <span className="text-base">{l.flag}</span>
              <span className="text-sm">{l.label}</span>
            </label>
          ))}
        </div>
      </div>

      <Separator />

      {/* Upload status */}
      {uploading && <Progress value={uploadProgress} className="w-full" />}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end">
        <Button type="submit" disabled={uploading || !file} size="lg">
          {uploading ? "Uploading..." : "Upload & generate docs"}
        </Button>
      </div>
    </form>
  );
}
