-- GTScout – steg 1: kårer och användarhantering
-- Kör hela filen i Supabase SQL Editor (Database > SQL Editor).

-- ── Roller ───────────────────────────────────────────────────────────────────
do $$
begin
    if not exists (select 1 from pg_type where typname = 'user_role') then
        create type public.user_role as enum ('gast', 'ledare', 'admin');
    end if;
end
$$;

-- ── Kårer ────────────────────────────────────────────────────────────────────
create table if not exists public.kar (
    id uuid primary key default gen_random_uuid(),
    namn text not null unique,
    ort text,
    created_at timestamptz not null default now()
);

-- ── Profiler (en rad per konto i auth.users) ─────────────────────────────────
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text not null,
    full_name text,
    role public.user_role not null default 'gast',
    kar_id uuid references public.kar(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists profiles_kar_id_idx on public.profiles (kar_id);

-- Skapa profil automatiskt när ett konto registreras.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, email, full_name)
    values (new.id, new.email, nullif(new.raw_user_meta_data ->> 'full_name', ''))
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
    before update on public.profiles
    for each row execute function public.touch_updated_at();

-- ── Hjälpfunktioner (security definer för att undvika rekursiva RLS-anrop) ───
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
    select coalesce((select role from public.profiles where id = auth.uid()), 'gast'::public.user_role);
$$;

create or replace function public.current_user_kar_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select kar_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_user_is_leader()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select public.current_user_role() in ('ledare', 'admin');
$$;

-- ── Planeringar ──────────────────────────────────────────────────────────────
-- Varje planering sparas som ett JSON-dokument så att klientens datamodell kan
-- utvecklas utan schemaändringar. Kolumnerna utanför data är till för filtrering.
create table if not exists public.planeringar (
    id uuid primary key,
    kar_id uuid not null references public.kar(id) on delete cascade,
    created_by uuid references public.profiles(id) on delete set null,
    name text not null default '',
    level text,
    year integer,
    term text,
    data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists planeringar_kar_id_idx on public.planeringar (kar_id);

drop trigger if exists planeringar_touch_updated_at on public.planeringar;
create trigger planeringar_touch_updated_at
    before update on public.planeringar
    for each row execute function public.touch_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.kar enable row level security;
alter table public.profiles enable row level security;
alter table public.planeringar enable row level security;

drop policy if exists "kar_select_all" on public.kar;
create policy "kar_select_all" on public.kar
    for select to authenticated
    using (true);

drop policy if exists "kar_admin_write" on public.kar;
create policy "kar_admin_write" on public.kar
    for all to authenticated
    using (public.current_user_role() = 'admin')
    with check (public.current_user_role() = 'admin');

drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self" on public.profiles
    for select to authenticated
    using (id = auth.uid());

-- Admin ser profiler i sin egen kår samt konton som ännu inte tilldelats en kår.
drop policy if exists "profiles_select_kar_admin" on public.profiles;
create policy "profiles_select_kar_admin" on public.profiles
    for select to authenticated
    using (
        public.current_user_role() = 'admin'
        and (kar_id is null or kar_id = public.current_user_kar_id())
    );

-- Egen profil får uppdateras, men inte roll eller kårtillhörighet.
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
    for update to authenticated
    using (id = auth.uid())
    with check (
        id = auth.uid()
        and role = public.current_user_role()
        and kar_id is not distinct from public.current_user_kar_id()
    );

-- Admin får ändra roll och kårtillhörighet för sin kår och för icke tilldelade konton.
drop policy if exists "profiles_update_kar_admin" on public.profiles;
create policy "profiles_update_kar_admin" on public.profiles
    for update to authenticated
    using (
        public.current_user_role() = 'admin'
        and (kar_id is null or kar_id = public.current_user_kar_id())
    )
    with check (
        public.current_user_role() = 'admin'
        and (kar_id is null or kar_id = public.current_user_kar_id())
    );

-- Planeringar delas inom kåren och får bara ändras av ledare och admin.
drop policy if exists "planeringar_select_kar" on public.planeringar;
create policy "planeringar_select_kar" on public.planeringar
    for select to authenticated
    using (kar_id = public.current_user_kar_id());

drop policy if exists "planeringar_write_leader" on public.planeringar;
create policy "planeringar_write_leader" on public.planeringar
    for all to authenticated
    using (
        public.current_user_is_leader()
        and kar_id = public.current_user_kar_id()
    )
    with check (
        public.current_user_is_leader()
        and kar_id = public.current_user_kar_id()
    );

-- ── Kom igång ────────────────────────────────────────────────────────────────-- 1. insert into public.kar (namn, ort) values ('Gullbrandstorps Scoutkår', 'Halmstad');
-- 2. Skapa användaren via Authentication > Users (e-post + lösenord).
-- 3. update public.profiles
--       set role = 'admin',
--           kar_id = (select id from public.kar where namn = 'Gullbrandstorps Scoutkår')
--     where email = 'din@epost.se';
