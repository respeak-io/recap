import { createHash, randomBytes } from "crypto";
import { createServiceClient } from "@/lib/supabase/service";

export interface ApiKeyValidation {
  orgId: string;
  keyId: string;
}

export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const raw = randomBytes(20).toString("hex"); // 40 hex chars
  const key = `rd_${raw}`;
  const hash = hashKey(key);
  const prefix = key.slice(0, 11); // "rd_" + 8 chars
  return { key, hash, prefix };
}

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function validateApiKey(
  request: Request
): Promise<ApiKeyValidation | Response> {
  const auth = request.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return Response.json(
      { error: "Missing Authorization header", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const token = auth.slice(7);
  const hash = hashKey(token);

  const db = createServiceClient();
  const { data: apiKey } = await db
    .from("api_keys")
    .select("id, org_id, revoked_at")
    .eq("key_hash", hash)
    .single();

  if (!apiKey || apiKey.revoked_at) {
    return Response.json(
      { error: "Invalid or revoked API key", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  // Update last_used_at (fire-and-forget)
  db.from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", apiKey.id)
    .then(() => {});

  return { orgId: apiKey.org_id, keyId: apiKey.id };
}

export function apiError(
  message: string,
  code: string,
  status: number
): Response {
  return Response.json({ error: message, code }, { status });
}
