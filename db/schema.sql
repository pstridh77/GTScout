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
    requested_kar_id uuid references public.kar(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.profiles
    add column if not exists requested_kar_id uuid references public.kar(id) on delete set null;

create index if not exists profiles_kar_id_idx on public.profiles (kar_id);
create index if not exists profiles_requested_kar_id_idx on public.profiles (requested_kar_id);

-- Skapa profil automatiskt när ett konto registreras. Önskad kår är bara en
-- ansökan – en admin måste sätta kar_id för att ge åtkomst till kårens data.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, email, full_name, requested_kar_id)
    values (
        new.id,
        new.email,
        nullif(new.raw_user_meta_data ->> 'full_name', ''),
        (select id from public.kar where id::text = new.raw_user_meta_data ->> 'requested_kar_id')
    )
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

-- En admin utan egen kårtillhörighet är systemadmin och hanterar alla kårer.
create or replace function public.current_user_is_system_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select public.current_user_role() = 'admin' and public.current_user_kar_id() is null;
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

-- ── Märkesanteckningar ───────────────────────────────────────────────────────
-- En anteckning per märke och kår.
create table if not exists public.badge_notes (
    kar_id uuid not null references public.kar(id) on delete cascade,
    badge_id text not null,
    note text not null default '',
    updated_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (kar_id, badge_id)
);

-- ── Aktiviteter ─────────────────────────────────────────────────────────────
-- Aktiviteter är globala att läsa (även för gäster), men ägs av en kår.
-- Endast ledare/admin i ägande kår får ändra.
create table if not exists public.aktiviteter (
    id text primary key,
    kar_id uuid not null references public.kar(id) on delete cascade,
    created_by uuid references public.profiles(id) on delete set null,
    namn text not null,
    kategori text,
    beskrivning text,
    tid text,
    material text[] not null default '{}',
    genomforande text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists aktiviteter_kar_id_idx on public.aktiviteter (kar_id);
create index if not exists aktiviteter_namn_idx on public.aktiviteter (namn);

drop trigger if exists aktiviteter_touch_updated_at on public.aktiviteter;
create trigger aktiviteter_touch_updated_at
    before update on public.aktiviteter
    for each row execute function public.touch_updated_at();

-- Kårspecifika kopplingar mellan märken och aktiviteter. Aktiviteten kan ägas
-- av vilken kår som helst (delad aktivitetsbank) – behörigheten för länken
-- avgörs av länkens egen kar_id, se RLS-policyn nedan.
create table if not exists public.badge_activities (
    kar_id uuid not null references public.kar(id) on delete cascade,
    badge_id text not null,
    activity_id text not null references public.aktiviteter(id) on delete cascade,
    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    primary key (kar_id, badge_id, activity_id)
);

create index if not exists badge_activities_badge_id_idx on public.badge_activities (badge_id);
create index if not exists badge_activities_activity_id_idx on public.badge_activities (activity_id);

drop trigger if exists badge_notes_touch_updated_at on public.badge_notes;
create trigger badge_notes_touch_updated_at
    before update on public.badge_notes
    for each row execute function public.touch_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.kar enable row level security;
alter table public.profiles enable row level security;
alter table public.planeringar enable row level security;
alter table public.badge_notes enable row level security;
alter table public.aktiviteter enable row level security;
alter table public.badge_activities enable row level security;

-- Kårernas namn måste kunna listas innan inloggning, för valet vid registrering.
drop policy if exists "kar_select_all" on public.kar;
create policy "kar_select_all" on public.kar
    for select to anon, authenticated
    using (true);

-- Systemadmin hanterar alla kårer, kårens admin får bara ändra sin egen kår.
drop policy if exists "kar_admin_write" on public.kar;
create policy "kar_admin_write" on public.kar
    for all to authenticated
    using (
        public.current_user_is_system_admin()
        or (public.current_user_role() = 'admin' and id = public.current_user_kar_id())
    )
    with check (
        public.current_user_is_system_admin()
        or (public.current_user_role() = 'admin' and id = public.current_user_kar_id())
    );

drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self" on public.profiles
    for select to authenticated
    using (id = auth.uid());

-- Systemadmin ser alla profiler. Kårens admin ser sin egen kår, konton utan kår
-- och de som ansökt till kåren.
drop policy if exists "profiles_select_kar_admin" on public.profiles;
create policy "profiles_select_kar_admin" on public.profiles
    for select to authenticated
    using (
        public.current_user_is_system_admin()
        or (
            public.current_user_role() = 'admin'
            and (
                kar_id is null
                or kar_id = public.current_user_kar_id()
                or requested_kar_id = public.current_user_kar_id()
            )
        )
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

-- Systemadmin får tilldela vilken kår som helst. Kårens admin får hantera sin
-- egen kår, icke tilldelade konton och dem som ansökt till kåren.
drop policy if exists "profiles_update_kar_admin" on public.profiles;
create policy "profiles_update_kar_admin" on public.profiles
    for update to authenticated
    using (
        public.current_user_is_system_admin()
        or (
            public.current_user_role() = 'admin'
            and (
                kar_id is null
                or kar_id = public.current_user_kar_id()
                or requested_kar_id = public.current_user_kar_id()
            )
        )
    )
    with check (
        public.current_user_is_system_admin()
        or (
            public.current_user_role() = 'admin'
            -- kårens admin får inte sänka sin egen behörighet; det kräver systemadmin
            and not (id = auth.uid() and role <> 'admin')
            -- kårens admin får aldrig skapa/behålla en systemadmin (admin utan kår)
            and not (role = 'admin' and kar_id is null)
            and (kar_id is null or kar_id = public.current_user_kar_id())
        )
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

-- Anteckningar delas inom kåren och får bara ändras av ledare och admin.
drop policy if exists "badge_notes_select_kar" on public.badge_notes;
create policy "badge_notes_select_kar" on public.badge_notes
    for select to authenticated
    using (kar_id = public.current_user_kar_id());

drop policy if exists "badge_notes_write_leader" on public.badge_notes;
create policy "badge_notes_write_leader" on public.badge_notes
    for all to authenticated
    using (
        public.current_user_is_leader()
        and kar_id = public.current_user_kar_id()
    )
    with check (
        public.current_user_is_leader()
        and kar_id = public.current_user_kar_id()
    );

-- Alla får läsa aktiviteter och aktivitetskopplingar, även utan inloggning.
drop policy if exists "aktiviteter_select_all" on public.aktiviteter;
create policy "aktiviteter_select_all" on public.aktiviteter
    for select to anon, authenticated
    using (true);

drop policy if exists "badge_activities_select_all" on public.badge_activities;
create policy "badge_activities_select_all" on public.badge_activities
    for select to anon, authenticated
    using (true);

-- Endast ledare/admin i kåren får skapa och ändra kårens aktiviteter.
drop policy if exists "aktiviteter_write_kar_leader" on public.aktiviteter;
drop policy if exists "aktiviteter_insert_kar_leader" on public.aktiviteter;
create policy "aktiviteter_insert_kar_leader" on public.aktiviteter
    for insert to authenticated
    with check (
        public.current_user_is_leader()
        and kar_id = public.current_user_kar_id()
    );

drop policy if exists "aktiviteter_update_kar_leader" on public.aktiviteter;
create policy "aktiviteter_update_kar_leader" on public.aktiviteter
    for update to authenticated
    using (
        public.current_user_is_leader()
        and kar_id = public.current_user_kar_id()
    )
    with check (
        public.current_user_is_leader()
        and kar_id = public.current_user_kar_id()
    );

-- Endast administratörer får radera aktiviteter från den egna kåren.
drop policy if exists "aktiviteter_delete_kar_admin" on public.aktiviteter;
create policy "aktiviteter_delete_kar_admin" on public.aktiviteter
    for delete to authenticated
    using (
        public.current_user_role() = 'admin'
        and kar_id = public.current_user_kar_id()
    );

-- Endast ledare/admin i kåren får hantera kårens märkeskopplingar. Aktiviteten
-- som länkas behöver inte ägas av den egna kåren (t.ex. statiska json-aktiviteter
-- eller andra kårers delade aktiviteter) – behörigheten avgörs av kopplingens egen kar_id.
drop policy if exists "badge_activities_write_kar_leader" on public.badge_activities;
create policy "badge_activities_write_kar_leader" on public.badge_activities
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
