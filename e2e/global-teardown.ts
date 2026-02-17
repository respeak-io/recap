import * as fs from "node:fs";
import * as path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { TEST_USER, cleanupTestData } from "./helpers/seed";

function loadEnvLocal() {
  const envPath = path.resolve(__dirname, "../.env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex);
    const value = trimmed.slice(eqIndex + 1);
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function globalTeardown() {
  loadEnvLocal();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  try {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Find test user
    const { data: users } = await admin.auth.admin.listUsers();
    const testUser = (users?.users ?? []).find(
      (u: { email?: string }) => u.email === TEST_USER.email
    );

    if (testUser) {
      await cleanupTestData(admin, testUser.id);
      await admin.auth.admin.deleteUser(testUser.id);
    }
  } catch {
    // Supabase may not be reachable if setup failed — skip cleanup
  }

  // Remove auth state file
  const authFile = path.resolve(__dirname, ".auth/user.json");
  if (fs.existsSync(authFile)) {
    fs.unlinkSync(authFile);
  }
}

export default globalTeardown;
