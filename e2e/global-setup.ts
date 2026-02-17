import * as fs from "node:fs";
import * as path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { TEST_USER, seedTestData } from "./helpers/seed";

function loadEnvLocal() {
  const envPath = path.resolve(__dirname, "../.env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error(`.env.local not found at ${envPath}`);
  }
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

async function globalSetup() {
  loadEnvLocal();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // Health-check Supabase
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/health`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
  } catch (err) {
    throw new Error(
      `Supabase is not running at ${supabaseUrl}. Start it with: supabase start\n${err}`
    );
  }

  // Service role client
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Delete existing test user if present
  const { data: existingUsers } = await admin.auth.admin.listUsers();
  const existing = (existingUsers?.users ?? []).find(
    (u: { email?: string }) => u.email === TEST_USER.email
  );
  if (existing) {
    // Clean up any leftover test data first
    const { cleanupTestData } = await import("./helpers/seed");
    await cleanupTestData(admin, existing.id);
    await admin.auth.admin.deleteUser(existing.id);
  }

  // Create test user
  const { data: newUser, error: createErr } =
    await admin.auth.admin.createUser({
      email: TEST_USER.email,
      password: TEST_USER.password,
      email_confirm: true,
    });

  if (createErr || !newUser.user) {
    throw new Error(`Failed to create test user: ${createErr?.message}`);
  }

  const userId = newUser.user.id;

  // Sign in with anon client to get session tokens
  const anon = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: session, error: signInErr } =
    await anon.auth.signInWithPassword({
      email: TEST_USER.email,
      password: TEST_USER.password,
    });

  if (signInErr || !session.session) {
    throw new Error(`Failed to sign in test user: ${signInErr?.message}`);
  }

  // Build storageState with Supabase auth cookies
  const sessionPayload = JSON.stringify({
    access_token: session.session.access_token,
    refresh_token: session.session.refresh_token,
    expires_in: session.session.expires_in,
    expires_at: session.session.expires_at,
    token_type: session.session.token_type,
    user: session.session.user,
  });

  // Supabase SSR uses chunked cookies when payload > 3180 chars
  const CHUNK_SIZE = 3180;
  const cookieName = "sb-localhost-auth-token";
  const cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Lax";
  }> = [];

  if (sessionPayload.length <= CHUNK_SIZE) {
    cookies.push({
      name: cookieName,
      value: sessionPayload,
      domain: "localhost",
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    });
  } else {
    const chunks = Math.ceil(sessionPayload.length / CHUNK_SIZE);
    for (let i = 0; i < chunks; i++) {
      cookies.push({
        name: `${cookieName}.${i}`,
        value: sessionPayload.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
        domain: "localhost",
        path: "/",
        httpOnly: false,
        secure: false,
        sameSite: "Lax",
      });
    }
  }

  const storageState = {
    cookies,
    origins: [],
  };

  // Write storage state
  const authDir = path.resolve(__dirname, ".auth");
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(authDir, "user.json"),
    JSON.stringify(storageState, null, 2)
  );

  // Seed test data
  await seedTestData(admin, userId);
}

export default globalSetup;
