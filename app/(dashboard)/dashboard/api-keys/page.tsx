import { createClient } from "@/lib/supabase/server";
import { getUserOrg } from "@/lib/queries/projects";
import { BreadcrumbNav } from "@/components/dashboard/breadcrumb-nav";
import { ApiKeyTable } from "@/components/dashboard/api-key-table";

export default async function ApiKeysPage() {
  const supabase = await createClient();
  const orgId = await getUserOrg();

  const { data: keys } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, created_at, last_used_at, revoked_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  return (
    <>
      <BreadcrumbNav items={[{ label: "API Keys" }]} />
      <div className="p-6">
        <ApiKeyTable keys={keys ?? []} />
      </div>
    </>
  );
}
