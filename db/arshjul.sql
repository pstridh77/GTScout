-- Kårens årshjul. Kör efter db/schema.sql i samma Supabase-projekt.
create table if not exists public.arshjul (
    id uuid primary key,
    kar_id uuid not null references public.kar(id) on delete cascade,
    created_by uuid references public.profiles(id) on delete set null,
    name text not null,
    share_token uuid unique,
    data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint arshjul_name_not_blank check (length(trim(name)) > 0)
);

alter table public.arshjul
    add column if not exists share_token uuid unique;

create unique index if not exists arshjul_kar_id_id_idx on public.arshjul (kar_id, id);

create table if not exists public.kar_arshjul_settings (
    kar_id uuid primary key references public.kar(id) on delete cascade,
    default_wheel_id uuid,
    updated_at timestamptz not null default now(),
    constraint kar_arshjul_settings_default_wheel_fk
        foreign key (kar_id, default_wheel_id)
        references public.arshjul(kar_id, id)
        on delete cascade
);

create or replace function public.get_shared_arshjul(requested_token uuid)
returns table (id uuid, name text, data jsonb)
language sql
stable
security definer
set search_path = public
as $$
    select wheel.id, wheel.name, wheel.data
    from public.arshjul as wheel
    where wheel.share_token = requested_token;
$$;

revoke all on function public.get_shared_arshjul(uuid) from public;
grant execute on function public.get_shared_arshjul(uuid) to anon, authenticated;

create index if not exists arshjul_kar_name_idx on public.arshjul (kar_id, name);

drop trigger if exists arshjul_touch_updated_at on public.arshjul;
create trigger arshjul_touch_updated_at
    before update on public.arshjul
    for each row execute function public.touch_updated_at();

drop trigger if exists kar_arshjul_settings_touch_updated_at on public.kar_arshjul_settings;
create trigger kar_arshjul_settings_touch_updated_at
    before update on public.kar_arshjul_settings
    for each row execute function public.touch_updated_at();

alter table public.arshjul enable row level security;
alter table public.kar_arshjul_settings enable row level security;

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

drop policy if exists "kar_arshjul_settings_select_kar" on public.kar_arshjul_settings;
create policy "kar_arshjul_settings_select_kar" on public.kar_arshjul_settings
    for select to authenticated
    using (kar_id = public.current_user_kar_id());

drop policy if exists "kar_arshjul_settings_insert_admin" on public.kar_arshjul_settings;
create policy "kar_arshjul_settings_insert_admin" on public.kar_arshjul_settings
    for insert to authenticated
    with check (
        public.current_user_role() = 'admin'
        and kar_id = public.current_user_kar_id()
    );

drop policy if exists "kar_arshjul_settings_update_admin" on public.kar_arshjul_settings;
create policy "kar_arshjul_settings_update_admin" on public.kar_arshjul_settings
    for update to authenticated
    using (
        public.current_user_role() = 'admin'
        and kar_id = public.current_user_kar_id()
    )
    with check (
        public.current_user_role() = 'admin'
        and kar_id = public.current_user_kar_id()
    );
