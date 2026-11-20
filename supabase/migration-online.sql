-- PITWALL : F1 Manager en ligne (courses programmées entre joueurs).
-- À exécuter une seule fois dans Supabase > SQL Editor > New query > Run (après schema.sql).
--
-- Principe : un salon se remplit ; dès 5 joueurs, un compte à rebours de 60 s démarre (d'autres peuvent encore entrer,
-- jusqu'à 20) ; au départ, les places libres sont prises par des IA. Le salon garde tout ce qui décide de la course
-- (voitures des joueurs figées à l'inscription, IA, graine, circuit) : chaque navigateur recalcule exactement la même course.

create table if not exists public.online_lobbies (
  id bigint generated always as identity primary key,
  division text not null,                 -- 'open' (Bronze, Argent) ou 'elite' (Or et plus)
  version int not null,                   -- version du moteur de course (tous les joueurs d'un salon ont la même)
  season int not null,
  round int not null,
  circuit text not null,
  seed bigint not null,
  bots jsonb not null,                    -- grille d'IA (fournie par le créateur du salon)
  created_at timestamptz not null default now(),
  countdown_at timestamptz,               -- 5e joueur arrivé
  start_at timestamptz                    -- départ : countdown_at + 60 s
);
create index if not exists online_lobbies_open on public.online_lobbies (division, version, start_at);

create table if not exists public.online_entries (
  lobby_id bigint not null references public.online_lobbies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  username text not null,
  payload jsonb not null,                 -- pilote, voiture, réglage, pneus de départ, plan d'arrêts, consigne voiture de sécurité
  joined_at timestamptz not null default now(),
  seen_at timestamptz not null default now(),
  primary key (lobby_id, user_id)
);
create index if not exists online_entries_user on public.online_entries (user_id, joined_at desc);

alter table public.online_lobbies enable row level security;
alter table public.online_entries enable row level security;
drop policy if exists "voir les salons" on public.online_lobbies;
create policy "voir les salons" on public.online_lobbies for select to authenticated using (true);
drop policy if exists "voir les engagés" on public.online_entries;
create policy "voir les engagés" on public.online_entries for select to authenticated using (true);
-- toute écriture passe par les fonctions ci-dessous

-- Rejoindre une course : salon ouvert de la même division et version, sinon nouveau salon.
create or replace function public.join_online(p_division text, p_version int, p_season int, p_round int, p_circuit text, p_payload jsonb, p_bots jsonb)
returns public.online_lobbies language plpgsql security definer set search_path = public as $$
declare v_lobby public.online_lobbies; v_name text; v_n int;
begin
  select username into v_name from public.profiles where id = auth.uid();
  if v_name is null then raise exception 'Créez d''abord votre profil joueur'; end if;
  if p_division not in ('open', 'elite') then raise exception 'Division inconnue'; end if;
  -- joueurs inactifs depuis plus de 45 s dans un salon pas encore parti : retirés
  delete from public.online_entries e using public.online_lobbies l
    where e.lobby_id = l.id and l.start_at is null and e.seen_at < now() - interval '45 seconds';
  -- déjà inscrit dans un salon pas encore parti : on met à jour sa voiture
  select l.* into v_lobby from public.online_lobbies l join public.online_entries e on e.lobby_id = l.id
    where e.user_id = auth.uid() and (l.start_at is null or l.start_at > now()) order by l.created_at desc limit 1;
  if v_lobby.id is not null then
    update public.online_entries set payload = p_payload, seen_at = now() where lobby_id = v_lobby.id and user_id = auth.uid();
    return v_lobby;
  end if;
  select l.* into v_lobby from public.online_lobbies l
    where l.division = p_division and l.version = p_version and (l.start_at is null or l.start_at > now() + interval '3 seconds')
      and (select count(*) from public.online_entries e where e.lobby_id = l.id) < 20
    order by l.created_at limit 1 for update;
  if v_lobby.id is null then
    insert into public.online_lobbies (division, version, season, round, circuit, seed, bots)
      values (p_division, p_version, p_season, p_round, p_circuit, floor(random() * 2147483647)::bigint, p_bots)
      returning * into v_lobby;
  end if;
  insert into public.online_entries (lobby_id, user_id, username, payload) values (v_lobby.id, auth.uid(), v_name, p_payload);
  select count(*) into v_n from public.online_entries where lobby_id = v_lobby.id;
  if v_n >= 5 and v_lobby.countdown_at is null then
    update public.online_lobbies set countdown_at = now(), start_at = now() + interval '60 seconds' where id = v_lobby.id returning * into v_lobby;
  end if;
  return v_lobby;
end $$;

-- Présence dans le salon (toutes les 15 s tant qu'on attend)
create or replace function public.ping_online(p_lobby bigint)
returns void language sql security definer set search_path = public as $$
  update public.online_entries set seen_at = now() where lobby_id = p_lobby and user_id = auth.uid();
$$;

-- Quitter un salon avant le départ
create or replace function public.leave_online(p_lobby bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.online_entries e using public.online_lobbies l
    where e.lobby_id = p_lobby and e.user_id = auth.uid() and l.id = p_lobby and (l.start_at is null or l.start_at > now());
  -- moins de 5 joueurs avant le départ : le compte à rebours s'arrête
  update public.online_lobbies set countdown_at = null, start_at = null
    where id = p_lobby and start_at > now() and (select count(*) from public.online_entries where lobby_id = p_lobby) < 5;
end $$;

grant execute on function public.join_online(text, int, int, int, text, jsonb, jsonb) to authenticated;
grant execute on function public.ping_online(bigint) to authenticated;
grant execute on function public.leave_online(bigint) to authenticated;
