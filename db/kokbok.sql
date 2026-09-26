-- GTScout Scoutkokbok. Kör efter db/schema.sql i samma Supabase-projekt.
-- Recepten är öppet läsbara och har medvetet ingen relation till planeringar.

create table if not exists public.kokbok_recept (
    id uuid primary key default gen_random_uuid(),
    kar_id uuid not null references public.kar(id) on delete cascade,
    created_by uuid references public.profiles(id) on delete set null,
    namn text not null,
    kategori text not null default 'Övrigt',
    beskrivning text,
    ingredienser text[] not null default '{}',
    ingredienser_skalningar jsonb not null default '[]'::jsonb,
    instruktioner text not null default '',
    portioner integer not null default 4 check (portioner > 0),
    tid text,
    svarighet text not null default 'Enkel' check (svarighet in ('Enkel', 'Medel', 'Avancerad')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint kokbok_recept_namn_not_blank check (length(trim(namn)) > 0)
);

alter table public.kokbok_recept
    add column if not exists ingredienser_skalningar jsonb not null default '[]'::jsonb;

create table if not exists public.kokbok_recept_kategorier (
    recept_id uuid not null references public.kokbok_recept(id) on delete cascade,
    kategori text not null,
    primary key (recept_id, kategori)
);

create index if not exists kokbok_recept_kar_id_idx on public.kokbok_recept (kar_id);
create index if not exists kokbok_recept_namn_idx on public.kokbok_recept (namn);

-- Kategoritabellen är en framtida utbyggnadspunkt och används inte av UI:t ännu.
-- Den håller schemaändringen separat utan att skapa någon planeringskoppling.
drop trigger if exists kokbok_recept_touch_updated_at on public.kokbok_recept;
create trigger kokbok_recept_touch_updated_at
    before update on public.kokbok_recept
    for each row execute function public.touch_updated_at();

alter table public.kokbok_recept enable row level security;
alter table public.kokbok_recept_kategorier enable row level security;

drop policy if exists "kokbok_recept_select_kar" on public.kokbok_recept;
drop policy if exists "kokbok_recept_select_all" on public.kokbok_recept;
create policy "kokbok_recept_select_all" on public.kokbok_recept
    for select to anon, authenticated
    using (true);

drop policy if exists "kokbok_recept_write_leader" on public.kokbok_recept;
create policy "kokbok_recept_write_leader" on public.kokbok_recept
    for all to authenticated
    using (public.current_user_is_leader() and kar_id = public.current_user_kar_id())
    with check (public.current_user_is_leader() and kar_id = public.current_user_kar_id());

drop policy if exists "kokbok_kategorier_select_kar" on public.kokbok_recept_kategorier;
drop policy if exists "kokbok_kategorier_select_all" on public.kokbok_recept_kategorier;
create policy "kokbok_kategorier_select_all" on public.kokbok_recept_kategorier
    for select to anon, authenticated
    using (true);

drop policy if exists "kokbok_kategorier_write_leader" on public.kokbok_recept_kategorier;
create policy "kokbok_kategorier_write_leader" on public.kokbok_recept_kategorier
    for all to authenticated
    using (public.current_user_is_leader() and exists (select 1 from public.kokbok_recept r where r.id = recept_id and r.kar_id = public.current_user_kar_id()))
    with check (public.current_user_is_leader() and exists (select 1 from public.kokbok_recept r where r.id = recept_id and r.kar_id = public.current_user_kar_id()));
