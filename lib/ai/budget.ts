import { createServiceClient } from "@/lib/supabase/service";

/**
 * Hard daily spend cap for public AI features (docs search answers).
 *
 * Spend is persisted per UTC day in `ai_usage_daily`, so the cap survives
 * restarts and deploys. Configure with `AI_DAILY_BUDGET_USD` (default $5).
 * Concurrent requests can overshoot by the cost of the calls already in flight,
 * a fraction of a cent each.
 */

const DEFAULT_DAILY_BUDGET_USD = 5;

export function dailyBudgetUsd(): number {
  const raw = Number(process.env.AI_DAILY_BUDGET_USD);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_DAILY_BUDGET_USD;
}

/** Today's (UTC) recorded spend across all features, in USD. */
export async function todaysSpendUsd(): Promise<number> {
  const { data, error } = await createServiceClient()
    .from("ai_usage_daily")
    .select("cost_usd")
    .eq("day", new Date().toISOString().slice(0, 10));
  if (error) throw new Error(`ai budget lookup failed: ${error.message}`);
  return (data ?? []).reduce((sum, row) => sum + Number(row.cost_usd), 0);
}

/**
 * Whether another AI call may run today. Fails closed: if the spend cannot be
 * read, the call is refused (search results still work, only the AI answer is
 * skipped).
 */
export async function isWithinDailyBudget(): Promise<boolean> {
  try {
    return (await todaysSpendUsd()) < dailyBudgetUsd();
  } catch (err) {
    console.error("[ai-budget]", err);
    return false;
  }
}

/** Add one call's usage to today's totals. Never throws. */
export async function recordAiUsage(
  feature: string,
  usage: { inputTokens: number; outputTokens: number; costUsd: number },
): Promise<void> {
  const { error } = await createServiceClient().rpc("record_ai_usage", {
    p_feature: feature,
    p_input_tokens: usage.inputTokens,
    p_output_tokens: usage.outputTokens,
    p_cost_usd: usage.costUsd,
  });
  if (error) console.error("[ai-budget] record failed:", error.message);
}
