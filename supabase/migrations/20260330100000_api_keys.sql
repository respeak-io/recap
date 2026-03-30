create table api_keys (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  key_hash text not null,
  key_prefix text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index api_keys_key_hash_idx on api_keys (key_hash);
create index api_keys_org_id_idx on api_keys (org_id);

alter table api_keys enable row level security;

create policy "Org members can view api keys"
  on api_keys for select
  using (is_org_member(org_id));

create policy "Org writers can create api keys"
  on api_keys for insert
  with check (is_org_writer(org_id));

create policy "Org writers can update api keys"
  on api_keys for update
  using (is_org_writer(org_id));
