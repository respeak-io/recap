import { createClient } from "@/lib/supabase/server";
import { getUserOrg } from "@/lib/queries/projects";
import { generateApiKey } from "@/lib/api-key-auth";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const orgId = await getUserOrg();

  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, created_by, created_at, last_used_at, revoked_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const orgId = await getUserOrg();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json();
  if (!body.name) return NextResponse.json({ error: "name is required" }, { status: 422 });

  const { key, hash, prefix } = generateApiKey();

  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      org_id: orgId,
      name: body.name,
      key_hash: hash,
      key_prefix: prefix,
      created_by: user.id,
    })
    .select("id, name, key_prefix, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ...data, key }, { status: 201 });
}
