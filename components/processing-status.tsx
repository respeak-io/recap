"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Check, AlertCircle } from "lucide-react";

interface ProcessingStep {
  step: string;
  message: string;
  progress: number;
  audience?: string;
  language?: string;
}

const STEP_ORDER = [
  "uploading",
  "transcribing",
  "generating_docs",
  "translating",
  "complete",
];

interface ProcessingStatusProps {
  videoId: string;
  audiences: string[];
  languages?: string[];
  onComplete?: () => void;
}

export function ProcessingStatus({
  videoId,
  audiences,
  languages = ["en"],
  onComplete,
}: ProcessingStatusProps) {
  const [currentStep, setCurrentStep] = useState<ProcessingStep | null>(null);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function startProcessing() {
      try {
        const res = await fetch("/api/videos/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoId, audiences, languages }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          setError("Failed to start processing");
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let prevStepKey: string | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = JSON.parse(line.slice(6)) as ProcessingStep;

            if (data.step === "error") {
              setError(data.message);
              return;
            }

            if (data.step === "complete") {
              if (prevStepKey) {
                setCompletedSteps((prev) =>
                  prev.includes(prevStepKey!) ? prev : [...prev, prevStepKey!]
                );
              }
              setCompletedSteps((prev) => [...prev, "complete"]);
              setCurrentStep(data);
              onComplete?.();
              return;
            }

            if (prevStepKey && prevStepKey !== data.step) {
              setCompletedSteps((prev) =>
                prev.includes(prevStepKey!) ? prev : [...prev, prevStepKey!]
              );
            }

            prevStepKey = data.step;
            setCurrentStep(data);
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError("Connection lost during processing");
        }
      }
    }

    startProcessing();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  const additionalLanguages = languages.slice(1);

  const steps = [
    { key: "uploading", label: "Uploading video to AI" },
    { key: "transcribing", label: "Extracting content" },
    ...audiences.map((a) => ({
      key: `generating_docs_${a}`,
      label: `Generating ${a} docs`,
    })),
    ...additionalLanguages.map((l) => ({
      key: `translating_${l}`,
      label: `Translating to ${l}`,
    })),
    { key: "complete", label: "Done" },
  ];

  function isStepCompleted(stepKey: string) {
    if (stepKey.startsWith("generating_docs_")) {
      const audience = stepKey.replace("generating_docs_", "");
      const audienceIdx = audiences.indexOf(audience);
      if (currentStep?.step === "generating_docs") {
        const currentIdx = audiences.indexOf(currentStep.audience ?? "");
        return audienceIdx < currentIdx;
      }
      return (
        completedSteps.includes("generating_docs") ||
        completedSteps.includes("translating") ||
        completedSteps.includes("complete")
      );
    }
    if (stepKey.startsWith("translating_")) {
      const lang = stepKey.replace("translating_", "");
      const langIdx = additionalLanguages.indexOf(lang);
      if (currentStep?.step === "translating") {
        const currentIdx = additionalLanguages.indexOf(
          currentStep.language ?? ""
        );
        return langIdx < currentIdx;
      }
      return completedSteps.includes("translating") || completedSteps.includes("complete");
    }
    if (completedSteps.includes(stepKey)) return true;
    const currentIdx = STEP_ORDER.indexOf(currentStep?.step ?? "");
    const stepIdx = STEP_ORDER.indexOf(stepKey);
    return stepIdx >= 0 && currentIdx > stepIdx;
  }

  function isStepActive(stepKey: string) {
    if (!currentStep) return false;
    if (stepKey.startsWith("generating_docs_")) {
      const audience = stepKey.replace("generating_docs_", "");
      return (
        currentStep.step === "generating_docs" &&
        currentStep.audience === audience
      );
    }
    if (stepKey.startsWith("translating_")) {
      const lang = stepKey.replace("translating_", "");
      return (
        currentStep.step === "translating" && currentStep.language === lang
      );
    }
    return currentStep.step === stepKey;
  }

  const progress = currentStep?.progress ?? 0;

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

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
