-- PITWALL : pronostics « podium » des ligues privées (onglet Mes ligues).
-- À exécuter une seule fois dans Supabase > SQL Editor > New query > Run, APRÈS migration-bet-leagues.sql.
-- Chaque joueur pronostique le top 3 des qualifications et de la course de chaque Grand Prix ; ses pronostics valent
-- pour toutes ses ligues. Les points sont calculés par le site à partir des résultats officiels (aucune monnaie en jeu).

create table if not exists public.podium_picks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  season int not null,
  round int not null,
  session text not null check (session in ('quali', 'race')),
  p1 text not null, p2 text not null, p3 text not null,
  o1 numeric, o2 numeric, o3 numeric,          -- cotes « podium » figées à l'enregistrement (prime de risque, ×1 à ×3)
  lock_at timestamptz not null,               -- début de la session : plus aucune modification ensuite
  updated_at timestamptz not null default now(),
  primary key (user_id, season, round, session),
  check (p1 <> p2 and p1 <> p3 and p2 <> p3)
);
create index if not exists podium_picks_season on public.podium_picks (season, round);
-- (si la table existait déjà sans les cotes)
alter table public.podium_picks add column if not exists o1 numeric;
alter table public.podium_picks add column if not exists o2 numeric;
alter table public.podium_picks add column if not exists o3 numeric;

-- Garde-fou côté serveur : horodatage par le serveur, heure de verrouillage figée à la première saisie,
-- refus de toute saisie ou modification une fois la session commencée.
create or replace function public.podium_pick_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id; new.season := old.season; new.round := old.round; new.session := old.session;
    new.lock_at := old.lock_at;
  end if;
  if now() >= new.lock_at then raise exception 'Pronostics verrouillés : la session a commencé'; end if;
  if new.lock_at > now() + interval '14 days' then raise exception 'Les pronostics ouvrent 14 jours avant la session'; end if;
  -- cotes plausibles uniquement (la prime de risque est plafonnée à ×3 par le site)
  if coalesce(new.o1, 1.01) not between 1.01 and 50 or coalesce(new.o2, 1.01) not between 1.01 and 50 or coalesce(new.o3, 1.01) not between 1.01 and 50 then raise exception 'Cote invalide'; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists podium_pick_guard on public.podium_picks;
create trigger podium_pick_guard before insert or update on public.podium_picks for each row execute function public.podium_pick_guard();

-- Deux joueurs partagent-ils une ligue ? (security definer : pas de récursion des règles RLS)
create or replace function public.shares_bet_league(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.bet_league_members a join public.bet_league_members b on a.league_id = b.league_id
    where a.user_id = auth.uid() and b.user_id = other
  );
$$;
grant execute on function public.shares_bet_league(uuid) to authenticated;

alter table public.podium_picks enable row level security;
-- ses propres pronostics : toujours ; ceux de ses amis de ligue : seulement une fois la session verrouillée
drop policy if exists "voir les pronostics" on public.podium_picks;
create policy "voir les pronostics" on public.podium_picks for select to authenticated
  using (user_id = auth.uid() or (now() >= lock_at and public.shares_bet_league(user_id)));
drop policy if exists "saisir ses pronostics" on public.podium_picks;
create policy "saisir ses pronostics" on public.podium_picks for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "modifier ses pronostics" on public.podium_picks;
create policy "modifier ses pronostics" on public.podium_picks for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
