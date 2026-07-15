-- Vues live personnalisables (central admin)

create table if not exists public.raspnvr_views (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0,
  is_all boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.raspnvr_view_items (
  id uuid primary key default gen_random_uuid(),
  view_id uuid not null references public.raspnvr_views (id) on delete cascade,
  store_id uuid not null references public.raspnvr_stores (id) on delete cascade,
  camera_id int not null,
  sort_order int not null default 0,
  unique (view_id, store_id, camera_id)
);

create index if not exists raspnvr_view_items_view_idx
  on public.raspnvr_view_items (view_id, sort_order);

insert into public.raspnvr_views (name, sort_order, is_all)
select 'Toutes', 0, true
where not exists (select 1 from public.raspnvr_views where is_all = true);
