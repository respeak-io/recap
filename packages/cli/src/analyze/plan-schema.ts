import { z } from "zod/v4";

// --- Step schema ---

export const StepSchema = z.object({
  action: z.string().min(1),
  narration: z.string().min(1),
  pause: z.number().int().nonnegative().default(0),
  timeout: z.number().int().positive().default(10000),
});

export type Step = z.infer<typeof StepSchema>;

// --- Feature schema ---

export const FeatureSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  category: z.string().min(1),
  steps: z.array(StepSchema).min(1),
});

export type Feature = z.infer<typeof FeatureSchema>;

// --- Auth schema ---

export const AuthSchema = z.object({
  strategy: z.enum(["credentials", "cookie", "script"]),
  credentials: z
    .object({ email: z.string(), password: z.string() })
    .optional(),
  setup_script: z.string().optional(),
});

export type Auth = z.infer<typeof AuthSchema>;

// --- Viewport schema ---

export const ViewportSchema = z.object({
  width: z.number().int().positive().default(1280),
  height: z.number().int().positive().default(720),
});

// --- App schema ---

export const AppSchema = z.object({
  url: z.url(),
  auth: AuthSchema,
  viewport: ViewportSchema.default({ width: 1280, height: 720 }),
});

// --- Recording schema ---

export const RecordingConfigSchema = z.object({
  max_concurrent: z.number().int().positive().default(3),
});

// --- TTS schema ---

export const TTSConfigSchema = z.object({
  provider: z.enum(["google", "openai", "elevenlabs"]).default("google"),
  voice: z.string().default("en-US-Studio-O"),
  speed: z.number().positive().default(1.0),
});

// --- Output schema ---

export const OutputSchema = z.object({
  video_dir: z.string().default("./generated/videos"),
  docs_dir: z.string().default("./generated/docs"),
  languages: z.array(z.string()).min(1).default(["en"]),
  tts: TTSConfigSchema.default({}),
  screenshots: z.boolean().default(true),
});

// --- Plan schema (top-level) ---

export const PlanSchema = z.object({
  version: z.literal(1),
  app: AppSchema,
  recording: RecordingConfigSchema.default({}),
  features: z.array(FeatureSchema).min(1),
  output: OutputSchema.default({}),
});

export type Plan = z.infer<typeof PlanSchema>;

// --- Recording manifest schemas ---

export const ManifestStepSchema = z.object({
  stepIndex: z.number().int().nonnegative(),
  startedAt: z.number().nonnegative(),
  completedAt: z.number().nonnegative(),
  screenshot: z.string().optional(),
});

export type ManifestStep = z.infer<typeof ManifestStepSchema>;

export const ManifestFeatureSchema = z.object({
  video_path: z.string(),
  status: z.enum(["success", "failed"]),
  steps: z.array(ManifestStepSchema),
  duration_ms: z.number().nonnegative(),
  error: z.string().optional(),
  error_screenshot: z.string().optional(),
});

export type ManifestFeature = z.infer<typeof ManifestFeatureSchema>;

export const RecordingManifestSchema = z.object({
  version: z.literal(1),
  recorded_at: z.string(),
  features: z.record(z.string(), ManifestFeatureSchema),
});

export type RecordingManifest = z.infer<typeof RecordingManifestSchema>;
