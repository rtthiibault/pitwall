-- PITWALL : Grand Prix Hebdomadaire (F1 Manager en ligne).
-- À exécuter une seule fois dans Supabase > SQL Editor > New query > Run (après schema.sql).
--
-- Un Grand Prix par semaine (lundi 00 h 00 → dimanche 23 h 59, heure de Paris), identique pour tous les joueurs.
-- Chaque joueur a 2 tentatives ; seul son meilleur temps total de course est gardé (null = DNF / non classé).
-- Le serveur compte les tentatives, n'accepte que la semaine en cours et refuse les temps hors limites.

create table if not exists public.weekly_times (
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_id text not null,                  -- ex. 2026-W48 (semaine ISO)
  time_ms bigint,                         -- meilleur temps total de course, en millisecondes
  position int,                           -- position d'arrivée lors de ce meilleur temps
  chassis text,
  driver text,
  attempts int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, week_id)
);
create index if not exists weekly_times_rank on public.weekly_times (week_id, time_ms);

alter table public.weekly_times enable row level security;
drop policy if exists "voir les chronos" on public.weekly_times;
create policy "voir les chronos" on public.weekly_times for select to authenticated using (true);
-- écriture uniquement par la fonction ci-dessous

create or replace function public.current_week_id()
returns text language sql stable as $$ select to_char(now() at time zone 'Europe/Paris', 'IYYY-"W"IW'); $$;

create or replace function public.submit_weekly(p_week text, p_time_ms bigint, p_position int, p_chassis text, p_driver text)
returns public.weekly_times language plpgsql security definer set search_path = public as $$
declare v_row public.weekly_times;
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'Créez d''abord votre profil joueur';
  end if;
  if p_week <> public.current_week_id() then raise exception 'Ce Grand Prix Hebdomadaire est clôturé'; end if;
  if p_time_ms is not null and (p_time_ms < 1200000 or p_time_ms > 14400000) then raise exception 'Temps de course invalide'; end if;
  select * into v_row from public.weekly_times where user_id = auth.uid() and week_id = p_week for update;
  if v_row.user_id is null then
    insert into public.weekly_times (user_id, week_id, time_ms, position, chassis, driver, attempts)
      values (auth.uid(), p_week, p_time_ms, p_position, left(p_chassis, 40), left(p_driver, 60), 1) returning * into v_row;
    return v_row;
  end if;
  if v_row.attempts >= 2 then raise exception 'Les 2 tentatives de la semaine sont déjà utilisées'; end if;
  update public.weekly_times set attempts = attempts + 1, updated_at = now(),
      time_ms = case when p_time_ms is not null and (time_ms is null or p_time_ms < time_ms) then p_time_ms else time_ms end,
      position = case when p_time_ms is not null and (time_ms is null or p_time_ms < time_ms) then p_position else position end,
      chassis = case when p_time_ms is not null and (time_ms is null or p_time_ms < time_ms) then left(p_chassis, 40) else chassis end,
      driver = case when p_time_ms is not null and (time_ms is null or p_time_ms < time_ms) then left(p_driver, 60) else driver end
    where user_id = auth.uid() and week_id = p_week returning * into v_row;
  return v_row;
end $$;
grant execute on function public.submit_weekly(text, bigint, int, text, text) to authenticated;
grant execute on function public.current_week_id() to authenticated;
