-- GTScout arrangemang. Kör efter db/schema.sql i samma Supabase-projekt.
-- Arrangemang lagras separat från terminsplaneringar, aktiviteter och recept.

create table if not exists public.arrangemang (
    id uuid primary key,
    kar_id uuid not null references public.kar(id) on delete cascade,
    created_by uuid references public.profiles(id) on delete set null,
    title text not null,
    start_date date not null,
    end_date date not null,
    status text not null default 'planned',
    share_token uuid unique,
    data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint arrangemang_title_not_blank check (length(trim(title)) > 0),
    constraint arrangemang_date_range_check check (end_date >= start_date),
    constraint arrangemang_status_check check (status in ('planned', 'completed', 'cancelled'))
);

alter table public.arrangemang
    add column if not exists share_token uuid unique;

create or replace function public.get_shared_arrangement(requested_token uuid)
returns table (id uuid, data jsonb)
language sql
stable
security definer
set search_path = public
as $$
    select a.id, a.data
    from public.arrangemang a
    where a.share_token = requested_token;
$$;

revoke all on function public.get_shared_arrangement(uuid) from public;
grant execute on function public.get_shared_arrangement(uuid) to anon, authenticated;

create index if not exists arrangemang_kar_dates_idx on public.arrangemang (kar_id, start_date, end_date);
create index if not exists arrangemang_status_idx on public.arrangemang (kar_id, status);

drop trigger if exists arrangemang_touch_updated_at on public.arrangemang;
create trigger arrangemang_touch_updated_at
    before update on public.arrangemang
    for each row execute function public.touch_updated_at();

alter table public.arrangemang enable row level security;

drop policy if exists "arrangemang_select_kar" on public.arrangemang;
create policy "arrangemang_select_kar" on public.arrangemang
    for select to authenticated
    using (kar_id = public.current_user_kar_id());

drop policy if exists "arrangemang_insert_leader" on public.arrangemang;
create policy "arrangemang_insert_leader" on public.arrangemang
    for insert to authenticated
    with check (public.current_user_is_leader() and kar_id = public.current_user_kar_id());

drop policy if exists "arrangemang_update_leader" on public.arrangemang;
create policy "arrangemang_update_leader" on public.arrangemang
    for update to authenticated
    using (public.current_user_is_leader() and kar_id = public.current_user_kar_id())
    with check (public.current_user_is_leader() and kar_id = public.current_user_kar_id());

drop policy if exists "arrangemang_delete_leader" on public.arrangemang;
create policy "arrangemang_delete_leader" on public.arrangemang
    for delete to authenticated
    using (public.current_user_is_leader() and kar_id = public.current_user_kar_id());
