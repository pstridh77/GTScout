-- Kör efter db/schema.sql i varje Supabase-miljö.
create table if not exists public.planerade_lagerbal (
    id uuid primary key,
    kar_id uuid not null references public.kar(id) on delete cascade,
    created_by uuid references public.profiles(id) on delete set null,
    data jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists planerade_lagerbal_kar_idx on public.planerade_lagerbal (kar_id);

drop trigger if exists planerade_lagerbal_touch_updated_at on public.planerade_lagerbal;
create trigger planerade_lagerbal_touch_updated_at
    before update on public.planerade_lagerbal
    for each row execute function public.touch_updated_at();

alter table public.planerade_lagerbal enable row level security;

drop policy if exists "planerade_lagerbal_select_kar" on public.planerade_lagerbal;
create policy "planerade_lagerbal_select_kar" on public.planerade_lagerbal
    for select to authenticated using (kar_id = public.current_user_kar_id());

drop policy if exists "planerade_lagerbal_insert_leader" on public.planerade_lagerbal;
create policy "planerade_lagerbal_insert_leader" on public.planerade_lagerbal
    for insert to authenticated
    with check (public.current_user_is_leader() and kar_id = public.current_user_kar_id());

drop policy if exists "planerade_lagerbal_update_leader" on public.planerade_lagerbal;
create policy "planerade_lagerbal_update_leader" on public.planerade_lagerbal
    for update to authenticated
    using (public.current_user_is_leader() and kar_id = public.current_user_kar_id())
    with check (public.current_user_is_leader() and kar_id = public.current_user_kar_id());

drop policy if exists "planerade_lagerbal_delete_leader" on public.planerade_lagerbal;
create policy "planerade_lagerbal_delete_leader" on public.planerade_lagerbal
    for delete to authenticated
    using (public.current_user_is_leader() and kar_id = public.current_user_kar_id());
