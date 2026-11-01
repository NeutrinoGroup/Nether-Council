-- Three application tables only. No transcript/audio or user profile table.
-- Private schema: keep it OUT of the Supabase Data API exposed schemas.
begin;
create schema if not exists nether;
revoke all on schema nether from public;

create table nether.calls (
  id uuid primary key,
  campaign_id text not null check (length(campaign_id) between 1 and 100),
  source_session_id uuid,
  character_id text not null check (character_id in ('meng-po','hei-wuchang','bai-wuchang','zhong-kui','frankenstein','werewolf','vampire')),
  locale text not null check (locale in ('zh','en')),
  mode text not null check (mode in ('personal','host')),
  status text not null default 'created' check (status in ('created','active','completed','failed')),
  started_at timestamptz,
  completed_at timestamptz,
  card_rendered_at timestamptz,
  card_saved_at timestamptz,
  share_invoked_at timestamptz,
  invite_copied_at timestamptz,
  story_turns integer not null default 0 check (story_turns between 0 and 16),
  interruption_count integer not null default 0 check (interruption_count >= 0),
  card_save_count integer not null default 0 check (card_save_count >= 0),
  share_count integer not null default 0 check (share_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  connect_ms integer check (connect_ms between 0 and 300000),
  first_audio_ms integer check (first_audio_ms between 0 and 300000),
  stop_ms integer check (stop_ms between 0 and 300000),
  translation_ms integer check (translation_ms between 0 and 300000),
  result_ms integer check (result_ms between 0 and 300000),
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index calls_campaign_created_idx on nether.calls(campaign_id, created_at desc);
create index calls_referral_idx on nether.calls(source_session_id) where source_session_id is not null;

create table nether.cache (
  namespace text not null check (namespace in ('identity','asset')),
  key text not null check (length(key) between 1 and 200),
  version integer not null check (version > 0),
  call_id uuid references nether.calls(id) on delete cascade,
  model text not null check (length(model) between 1 and 100),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 65536),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(namespace, key, version),
  check (namespace <> 'identity' or call_id is not null),
  check (expires_at > updated_at and expires_at <= updated_at + interval '7 days'),
  check (namespace <> 'identity' or expires_at <= updated_at + interval '24 hours')
);
create index cache_expiry_idx on nether.cache(expires_at);

create table nether.outbox (
  id uuid primary key default gen_random_uuid(),
  event_key uuid not null unique,
  call_id uuid not null references nether.calls(id) on delete cascade,
  event_type text not null check (event_type in ('conversation_started','conversation_completed','card_rendered','card_download_created','share_invoked','invite_copied','referred_conversation_started','connection_error','latency')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 4096),
  status text not null default 'pending' check (status in ('pending','processing','done','dead')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  available_at timestamptz not null default now(),
  lease_token uuid,
  locked_until timestamptz,
  completed_at timestamptz,
  last_error text check (last_error in ('delivery_failed','lease_expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (attempts <= max_attempts),
  check ((status = 'processing' and lease_token is not null and locked_until is not null)
      or (status <> 'processing' and lease_token is null and locked_until is null))
);
create index outbox_pending_idx on nether.outbox(available_at, created_at) where status = 'pending';
create index outbox_lease_idx on nether.outbox(locked_until) where status = 'processing';

alter table nether.calls enable row level security;
alter table nether.cache enable row level security;
alter table nether.outbox enable row level security;
revoke all on all tables in schema nether from public;
-- The server-only Supabase service role bypasses RLS. Browser roles get no grants
-- or policies. Direct Python access uses a separately provisioned trusted DB role.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant usage on schema nether to service_role;
    grant select, insert, update, delete on all tables in schema nether to service_role;
  end if;
end $$;
commit;
