"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Check, AlertCircle } from "lucide-react";

interface ProcessingJob {
  id: string;
  status: string;
  step: string | null;
  step_message: string | null;
  progress: number;
  error_message: string | null;
  languages: string[];
}

interface JobProgressProps {
  jobId: string;
  onComplete?: () => void;
}

const STEP_ORDER = [
  "uploading",
  "transcribing",
  "generating_docs",
  "translating",
  "complete",
];

export function JobProgress({ jobId, onComplete }: JobProgressProps) {
  const [job, setJob] = useState<ProcessingJob | null>(null);
  const supabase = createClient();

  useEffect(() => {
    let active = true;

    async function poll() {
      const { data } = await supabase
        .from("processing_jobs")
        .select("*")
        .eq("id", jobId)
        .single();

      if (!active || !data) return;

      setJob(data as ProcessingJob);

      if (data.status === "completed") {
        onComplete?.();
        return;
      }

      if (data.status === "failed") return;

      setTimeout(poll, 2000);
    }

    poll();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  if (!job) return null;

  const targetLanguages = job.languages.filter((l) => l !== "en");

  const steps = [
    { key: "uploading", label: "Uploading video to AI" },
    { key: "transcribing", label: "Extracting content" },
    { key: "generating_docs", label: "Generating documentation" },
    ...targetLanguages.map((l) => ({
      key: `translating_${l}`,
      label: `Translating to ${l}`,
    })),
    { key: "complete", label: "Done" },
  ];

  function isStepCompleted(stepKey: string) {
    if (!job) return false;
    if (job.status === "completed") return true;

    const currentStep = job.step ?? "";

    if (stepKey.startsWith("translating_")) {
      const lang = stepKey.replace("translating_", "");
      const langIdx = targetLanguages.indexOf(lang);
      if (currentStep === "translating") {
        const currentLangIdx = targetLanguages.findIndex((l) =>
          job.step_message?.includes(l)
        );
        return langIdx < currentLangIdx;
      }
      const stepIdx = STEP_ORDER.indexOf("translating");
      const currentIdx = STEP_ORDER.indexOf(currentStep);
      return currentIdx > stepIdx;
    }

    if (stepKey === "complete") return job.status === "completed";

    const stepIdx = STEP_ORDER.indexOf(stepKey);
    const currentIdx = STEP_ORDER.indexOf(currentStep);
    return stepIdx >= 0 && currentIdx > stepIdx;
  }

  function isStepActive(stepKey: string) {
    if (!job || job.status !== "processing") return false;
    const currentStep = job.step ?? "";

    if (stepKey.startsWith("translating_")) {
      const lang = stepKey.replace("translating_", "");
      return (
        currentStep === "translating" &&
        (job.step_message?.includes(lang) ?? false)
      );
    }
    return currentStep === stepKey;
  }

  const progress = job.progress ?? 0;

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
          <div
            className="bg-primary h-2 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>

        <div className="space-y-2">
          {steps.map((step) => {
            const completed = isStepCompleted(step.key);
            const active = isStepActive(step.key);

            return (
              <div key={step.key} className="flex items-center gap-2 text-sm">
                {completed ? (
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                ) : active ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
                ) : (
                  <div className="h-4 w-4 rounded-full border border-muted-foreground/30 flex-shrink-0" />
                )}
                <span
                  className={
                    completed
                      ? "text-muted-foreground line-through"
                      : active
                        ? "font-medium"
                        : "text-muted-foreground"
                  }
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

        {job.status === "failed" && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {job.error_message ?? "Processing failed"}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
