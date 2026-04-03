import { createServiceClient } from "@/lib/supabase/service";
import { validateApiKey, apiError } from "@/lib/api-key-auth";
import { resolveProject } from "@/lib/api-v1-helpers";
import { randomUUID } from "crypto";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

interface UploadResult {
  imageId: string;
  url: string;
  filename: string;
}

interface UploadError {
  filename: string;
  error: string;
}

function validateImageFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) return "File must be an image (PNG, JPEG, GIF, WebP, SVG)";
  if (file.size > MAX_SIZE) return "File too large (max 10MB)";
  return null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const { slug } = await params;
  const db = createServiceClient();

  const project = await resolveProject(db, auth.orgId, slug);
  if (project instanceof Response) return project;

  const formData = await request.formData();
  const files = formData.getAll("file") as File[];

  if (files.length === 0) return apiError("Missing file", "VALIDATION_ERROR", 400);

  const results: UploadResult[] = [];
  const errors: UploadError[] = [];

  for (const file of files) {
    const validationError = validateImageFile(file);
    if (validationError) {
      errors.push({ filename: file.name, error: validationError });
      continue;
    }

    const ext = file.name.split(".").pop() ?? "png";
    const storagePath = `${project.id}/content/${randomUUID()}.${ext}`;

    const { error: uploadError } = await db.storage
      .from("assets")
      .upload(storagePath, file);

    if (uploadError) {
      errors.push({ filename: file.name, error: uploadError.message });
      continue;
    }

    const { data: row, error: insertError } = await db.from("images").insert({
      project_id: project.id,
      storage_path: storagePath,
      filename: file.name,
      size_bytes: file.size,
    }).select("id").single();

    if (insertError) {
      errors.push({ filename: file.name, error: insertError.message });
      continue;
    }

    const { data: urlData } = db.storage.from("assets").getPublicUrl(storagePath);

    results.push({
      imageId: row.id,
      url: urlData.publicUrl,
      filename: file.name,
    });
  }

  if (results.length === 0 && errors.length > 0) {
    return apiError(errors[0].error, "VALIDATION_ERROR", 400);
  }

  if (files.length === 1 && results.length === 1) {
    return Response.json(results[0], { status: 201 });
  }

  const body: Record<string, unknown> = { images: results };
  if (errors.length > 0) body.errors = errors;
  return Response.json(body, { status: 201 });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = await validateApiKey(request);
  if (auth instanceof Response) return auth;

  const { slug } = await params;
  const db = createServiceClient();

  const project = await resolveProject(db, auth.orgId, slug);
  if (project instanceof Response) return project;

  const { data, error } = await db
    .from("images")
    .select("id, storage_path, filename, alt_text, width, height, created_at")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false });

  if (error) return apiError(error.message, "INTERNAL", 500);

  const images = (data ?? []).map((img) => {
    const { data: urlData } = db.storage.from("assets").getPublicUrl(img.storage_path);
    return {
      id: img.id,
      url: urlData.publicUrl,
      filename: img.filename,
      alt_text: img.alt_text,
      width: img.width,
      height: img.height,
      created_at: img.created_at,
    };
  });

  return Response.json({ images });
}
