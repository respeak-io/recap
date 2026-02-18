"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Check, AlertCircle, Video, RotateCcw } from "lucide-react";

interface Job {
  id: string;
  status: string;
  step: string | null;
  step_message: string | null;
  progress: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  videos: { title: string } | null;
}

interface ActiveJobsProps {
  projectId: string;
  initialJobs: Job[];
}

export function ActiveJobs({ projectId, initialJobs }: ActiveJobsProps) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [retrying, setRetrying] = useState<string | null>(null);
  const supabase = createClient();

  const hasActiveJobs = jobs.some(
    (j) => j.status === "pending" || j.status === "processing"
  );

  useEffect(() => {
    if (!hasActiveJobs) return;

    let active = true;

    async function poll() {
      const { data } = await supabase
        .from("processing_jobs")
        .select("*, videos(title)")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(5);

      if (!active || !data) return;
      setJobs(data as Job[]);

      const stillActive = data.some(
        (j: { status: string }) =>
          j.status === "pending" || j.status === "processing"
      );
      if (stillActive) {
        setTimeout(poll, 2000);
      }
    }

    const timer = setTimeout(poll, 2000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActiveJobs, projectId]);

  async function handleRetry(jobId: string) {
    setRetrying(jobId);
    try {
      const res = await fetch("/api/videos/process/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      if (res.ok) {
        // Refresh job list to pick up the new job
        const { data } = await supabase
          .from("processing_jobs")
          .select("*, videos(title)")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .limit(5);
        if (data) setJobs(data as Job[]);
      }
    } finally {
      setRetrying(null);
    }
  }

  // Hide retried jobs — they've been replaced by a new job
  const visibleJobs = jobs.filter((j) => j.status !== "retried");

  if (visibleJobs.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Processing Jobs
          {hasActiveJobs && (
            <Loader2 className="size-4 animate-spin text-primary" />
          )}
        </CardTitle>
        <CardDescription>Video processing activity</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {visibleJobs.map((job) => (
            <div
              key={job.id}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                {job.status === "processing" || job.status === "pending" ? (
                  <Loader2 className="size-4 animate-spin text-primary flex-shrink-0" />
                ) : job.status === "completed" ? (
                  <Check className="size-4 text-green-500 flex-shrink-0" />
                ) : (
                  <AlertCircle className="size-4 text-destructive flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Video className="size-3 text-muted-foreground" />
                    <span className="text-sm font-medium truncate">
                      {job.videos?.title ?? "Untitled video"}
                    </span>
                  </div>
                  {(job.status === "processing" ||
                    job.status === "pending") && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {job.step_message ?? "Waiting..."}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {(job.status === "processing" ||
                  job.status === "pending") && (
                  <div className="w-20 bg-secondary rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-primary h-1.5 rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.round(job.progress * 100)}%`,
                      }}
                    />
                  </div>
                )}
                {job.status === "failed" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2"
                    disabled={retrying === job.id}
                    onClick={() => handleRetry(job.id)}
                  >
                    <RotateCcw
                      className={`size-3 mr-1 ${retrying === job.id ? "animate-spin" : ""}`}
                    />
                    Retry
                  </Button>
                )}
                <Badge
                  variant={
                    job.status === "completed"
                      ? "default"
                      : job.status === "failed"
                        ? "destructive"
                        : "secondary"
                  }
                  className="text-xs"
                >
                  {job.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
