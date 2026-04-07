create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  normalized_email text not null unique,
  status text not null default 'invited' check (status in ('invited', 'active', 'disabled')),
  session_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  normalized_email text not null,
  invited_by text,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invites_normalized_email_idx
  on invites (normalized_email, expires_at);

create table if not exists auth_challenges (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  normalized_email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  attempt_count integer not null default 0,
  max_attempts integer not null,
  created_at timestamptz not null default now()
);

create index if not exists auth_challenges_normalized_email_idx
  on auth_challenges (normalized_email, created_at desc);
