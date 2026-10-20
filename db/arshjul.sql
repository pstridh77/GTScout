-- Kårens årshjul. Kör efter db/schema.sql i samma Supabase-projekt.
create table if not exists public.arshjul (
    id uuid primary key,
    kar_id uuid not null references public.kar(id) on delete cascade,
    created_by uuid references public.profiles(id) on delete set null,
    name text not null,
    data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint arshjul_name_not_blank check (length(trim(name)) > 0)
);

create index if not exists arshjul_kar_name_idx on public.arshjul (kar_id, name);

drop trigger if exists arshjul_touch_updated_at on public.arshjul;
create trigger arshjul_touch_updated_at
    before update on public.arshjul
    for each row execute function public.touch_updated_at();

alter table public.arshjul enable row level security;

drop policy if exists "arshjul_select_kar" on public.arshjul;
create policy "arshjul_select_kar" on public.arshjul
    for select to authenticated
    using (kar_id = public.current_user_kar_id());

drop policy if exists "arshjul_insert_leader" on public.arshjul;
create policy "arshjul_insert_leader" on public.arshjul
    for insert to authenticated
    with check (public.current_user_is_leader() and kar_id = public.current_user_kar_id());

drop policy if exists "arshjul_update_leader" on public.arshjul;
create policy "arshjul_update_leader" on public.arshjul
    for update to authenticated
    using (public.current_user_is_leader() and kar_id = public.current_user_kar_id())
    with check (public.current_user_is_leader() and kar_id = public.current_user_kar_id());

drop policy if exists "arshjul_delete_leader" on public.arshjul;
create policy "arshjul_delete_leader" on public.arshjul
    for delete to authenticated
    using (public.current_user_is_leader() and kar_id = public.current_user_kar_id());
