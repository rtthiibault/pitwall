-- PITWALL : colonnes du mode manager (classement mondial des ligues).
-- À exécuter une seule fois dans Supabase > SQL Editor > New query > Run (après schema.sql).
alter table public.profiles
  add column if not exists lp int not null default 0,
  add column if not exists league text,
  add column if not exists mgr_driver text,
  add column if not exists mgr_team text;
create index if not exists profiles_lp on public.profiles (lp desc);
