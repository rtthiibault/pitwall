-- PITWALL : grille de pronos du Grand Prix (7 questions), base des classements de ligue.
-- À exécuter une seule fois dans Supabase > SQL Editor > New query > Run, APRÈS migration-bet-leagues.sql
-- et migration-podium.sql (qui crée la fonction shares_bet_league).
-- Une ligne par joueur et par Grand Prix : ses réponses et la valeur en points de chaque réponse,
-- figée au moment du choix (plus le choix est improbable, plus il rapporte). Les points sont calculés
-- par le site à partir des résultats officiels, pour tout le monde de la même façon.

create table if not exists public.grille_picks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  season int not null,
  round int not null,
  answers jsonb not null default '{}'::jsonb,   -- { win, pole, duel0, duel1, fl, dnf, team }
  pv jsonb not null default '{}'::jsonb,        -- valeur figée de chaque réponse (points si c'est juste)
  lock_quali timestamptz not null,              -- début des qualifications : la pole se ferme
  lock_race timestamptz not null,               -- départ de la course : toute la grille se ferme
  updated_at timestamptz not null default now(),
  primary key (user_id, season, round)
);
create index if not exists grille_picks_season on public.grille_picks (season, round);

-- Garde-fou côté serveur : heures de verrouillage figées à la première saisie, aucune modification
-- après le départ, la pole figée dès le début des qualifications, valeurs plafonnées.
create or replace function public.grille_pick_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id; new.season := old.season; new.round := old.round;
    new.lock_quali := old.lock_quali; new.lock_race := old.lock_race;
  end if;
  if now() >= new.lock_race then raise exception 'Grille verrouillée : la course a commencé'; end if;
  if new.lock_race > now() + interval '14 days' then raise exception 'La grille ouvre 14 jours avant la course'; end if;
  if now() >= new.lock_quali then
    new.answers := new.answers - 'pole'; new.pv := new.pv - 'pole';
    if tg_op = 'UPDATE' and old.answers ? 'pole' then
      new.answers := new.answers || jsonb_build_object('pole', old.answers -> 'pole');
      if old.pv ? 'pole' then new.pv := new.pv || jsonb_build_object('pole', old.pv -> 'pole'); end if;
    end if;
  end if;
  if pg_column_size(new.answers) > 2000 or pg_column_size(new.pv) > 1000 then raise exception 'Grille invalide'; end if;
  if exists (select 1 from jsonb_each(new.pv) e where jsonb_typeof(e.value) <> 'number' or (e.value)::text::numeric not between 0 and 150) then
    raise exception 'Valeur de pronostic invalide';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists grille_pick_guard on public.grille_picks;
create trigger grille_pick_guard before insert or update on public.grille_picks for each row execute function public.grille_pick_guard();

alter table public.grille_picks enable row level security;
-- sa propre grille : toujours ; celles des autres joueurs : une fois la course partie (classement officiel et ligues)
drop policy if exists "voir les grilles" on public.grille_picks;
create policy "voir les grilles" on public.grille_picks for select to authenticated
  using (user_id = auth.uid() or now() >= lock_race);
drop policy if exists "saisir sa grille" on public.grille_picks;
create policy "saisir sa grille" on public.grille_picks for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "modifier sa grille" on public.grille_picks;
create policy "modifier sa grille" on public.grille_picks for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
