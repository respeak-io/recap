"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const AUDIENCES = [
  { id: "developers", label: "Developers" },
  { id: "end-users", label: "End Users" },
  { id: "ai-agents", label: "AI Agents" },
];

export function VideoUpload({ projectId }: { projectId: string }) {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [audiences, setAudiences] = useState<string[]>(["developers"]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const supabase = createClient();

  function toggleAudience(id: string) {
    setAudiences((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);
    setProgress(0);

    try {
      // Get presigned upload URL
      const urlRes = await fetch("/api/videos/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const { videoId, uploadUrl } = await urlRes.json();

      if (!uploadUrl) throw new Error("Failed to get upload URL");

      // Upload file directly to Supabase Storage
      setProgress(10);
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!uploadRes.ok) throw new Error("Upload failed");
      setProgress(50);

      // Update video title
      await supabase
        .from("videos")
        .update({ title: title || file.name })
        .eq("id", videoId);

      setProgress(60);

      // Trigger processing
      const processRes = await fetch("/api/videos/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, audiences }),
      });

      if (!processRes.ok) throw new Error("Processing failed to start");
      setProgress(100);

      setTitle("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
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
          {uploading && (
            <div className="w-full bg-secondary rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{ width: `${progress}%` }}
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
