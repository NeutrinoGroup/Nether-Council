-- Users table for Google Authentication & Share Referral identities
begin;

create table if not exists public.users (
  id varchar(128) primary key,
  email varchar(256) unique not null,
  name varchar(128) not null,
  picture varchar(512),
  bio text,
  referral_code varchar(64) unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_email_idx on public.users(email);
create index if not exists users_referral_code_idx on public.users(referral_code);

alter table public.users enable row level security;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant usage on schema public to service_role;
    grant select, insert, update, delete on all tables in schema public to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant usage on schema public to anon;
    grant select on public.users to anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant usage on schema public to authenticated;
    grant select, update on public.users to authenticated;
  end if;
end $$;

commit;
