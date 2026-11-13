-- Daily AI usage per feature, used to enforce a hard daily spend cap on public
-- AI endpoints (docs search answers) and to see what AI calls cost.
--
-- Only the service role touches this table: RLS is enabled with no policies,
-- and the RPC below is executable by service_role only.

create table ai_usage_daily (
  day date not null default current_date,
  feature text not null,
  requests integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  primary key (day, feature)
);

alter table ai_usage_daily enable row level security;

create or replace function record_ai_usage(
  p_feature text,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_cost_usd numeric
) returns numeric
language sql
security definer
set search_path = public
as $$
  insert into ai_usage_daily as u (day, feature, requests, input_tokens, output_tokens, cost_usd)
  values (current_date, p_feature, 1, p_input_tokens, p_output_tokens, p_cost_usd)
  on conflict (day, feature) do update set
    requests = u.requests + 1,
    input_tokens = u.input_tokens + excluded.input_tokens,
    output_tokens = u.output_tokens + excluded.output_tokens,
    cost_usd = u.cost_usd + excluded.cost_usd
  returning cost_usd;
$$;

revoke execute on function record_ai_usage(text, bigint, bigint, numeric) from public, anon, authenticated;
grant execute on function record_ai_usage(text, bigint, bigint, numeric) to service_role;
