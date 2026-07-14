-- RaspNVR central schema (Supabase)

create table if not exists public.raspnvr_stores (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.raspnvr_registration_tokens (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.raspnvr_stores (id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists raspnvr_registration_tokens_store_idx
  on public.raspnvr_registration_tokens (store_id);

create table if not exists public.raspnvr_devices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null unique references public.raspnvr_stores (id) on delete cascade,
  api_key_hash text not null,
  hostname text,
  tunnel_url text,
  agent_version text,
  last_seen_at timestamptz,
  last_status jsonb,
  registered_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.raspnvr_commands (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.raspnvr_devices (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  result jsonb,
  created_at timestamptz not null default now(),
  acked_at timestamptz
);

create index if not exists raspnvr_commands_device_status_idx
  on public.raspnvr_commands (device_id, status);

create table if not exists public.raspnvr_recordings (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.raspnvr_devices (id) on delete cascade,
  store_id uuid not null references public.raspnvr_stores (id) on delete cascade,
  camera_id int not null,
  camera_name text,
  storage_path text not null,
  local_path text,
  size_bytes bigint not null default 0,
  started_at timestamptz not null,
  uploaded_at timestamptz not null default now()
);

create index if not exists raspnvr_recordings_store_idx
  on public.raspnvr_recordings (store_id, started_at desc);

insert into public.raspnvr_stores (code, name, sort_order)
values ('mag01', 'Magasin 01', 1)
on conflict (code) do nothing;
