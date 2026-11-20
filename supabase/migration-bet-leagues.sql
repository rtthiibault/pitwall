-- PITWALL : ligues de pronostics entre amis (style « Mon Petit Prono »).
-- À exécuter une seule fois dans Supabase > SQL Editor > New query > Run (après schema.sql).
-- La ligue officielle n'a pas besoin de table : c'est le classement de tous les profils.
-- Une ligue privée a un nom et un code d'invitation unique (ex. PIT-K7Q2). On la rejoint avec ce code.

create table if not exists public.bet_leagues (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 3 and 40),
  code text not null unique,
  owner uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.bet_league_members (
  league_id bigint not null references public.bet_leagues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);
create index if not exists bet_league_members_user on public.bet_league_members (user_id);

-- Appartenance (fonction « security definer » : évite la récursion des règles RLS)
create or replace function public.is_bet_league_member(lid bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.bet_league_members where league_id = lid and user_id = auth.uid());
$$;

alter table public.bet_leagues enable row level security;
alter table public.bet_league_members enable row level security;
-- on ne voit que les ligues dont on est membre, et leurs membres
drop policy if exists "voir ses ligues" on public.bet_leagues;
create policy "voir ses ligues" on public.bet_leagues for select to authenticated using (public.is_bet_league_member(id));
drop policy if exists "supprimer sa ligue" on public.bet_leagues;
create policy "supprimer sa ligue" on public.bet_leagues for delete to authenticated using (owner = auth.uid());
drop policy if exists "voir les membres" on public.bet_league_members;
create policy "voir les membres" on public.bet_league_members for select to authenticated using (public.is_bet_league_member(league_id));
drop policy if exists "quitter une ligue" on public.bet_league_members;
create policy "quitter une ligue" on public.bet_league_members for delete to authenticated using (user_id = auth.uid());
-- création et adhésion uniquement par les deux fonctions ci-dessous (pas d'insertion directe)

-- Créer une ligue : code unique généré (PIT- + 4 caractères sans 0/O/1/I), le créateur en devient membre
create or replace function public.create_bet_league(p_name text)
returns public.bet_leagues language plpgsql security definer set search_path = public as $$
declare
  v_code text; v_row public.bet_leagues; alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i int;
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'Créez d''abord votre profil joueur';
  end if;
  if (select count(*) from public.bet_leagues where owner = auth.uid()) >= 20 then
    raise exception 'Vous avez déjà créé 20 ligues';
  end if;
  loop
    v_code := 'PIT-';
    for i in 1..4 loop v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    exit when not exists (select 1 from public.bet_leagues where code = v_code);
  end loop;
  insert into public.bet_leagues (name, code, owner) values (btrim(p_name), v_code, auth.uid()) returning * into v_row;
  insert into public.bet_league_members (league_id, user_id) values (v_row.id, auth.uid());
  return v_row;
end $$;

-- Rejoindre une ligue avec son code (insensible à la casse et aux espaces)
create or replace function public.join_bet_league(p_code text)
returns public.bet_leagues language plpgsql security definer set search_path = public as $$
declare v_row public.bet_leagues;
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'Créez d''abord votre profil joueur';
  end if;
  select * into v_row from public.bet_leagues where code = upper(btrim(p_code));
  if v_row.id is null then raise exception 'Aucune ligue avec ce code'; end if;
  if (select count(*) from public.bet_league_members where league_id = v_row.id) >= 100 then
    raise exception 'Cette ligue est complète (100 membres)';
  end if;
  insert into public.bet_league_members (league_id, user_id) values (v_row.id, auth.uid()) on conflict do nothing;
  return v_row;
end $$;

grant execute on function public.create_bet_league(text) to authenticated;
grant execute on function public.join_bet_league(text) to authenticated;
grant execute on function public.is_bet_league_member(bigint) to authenticated;
