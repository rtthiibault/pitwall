-- PITWALL : statistiques détaillées du F1 Manager et photo de profil.
-- À exécuter une seule fois dans Supabase > SQL Editor > New query > Run, APRÈS migration-manager.sql.
-- Sert au classement détaillé de l'onglet Ligues du F1 Manager (équipe, coéquipier, victoires, podiums,
-- meilleure position, points) et à l'affichage de la photo de profil choisie par chaque joueur.
alter table public.profiles
  add column if not exists mgr_mate text,
  add column if not exists mgr_wins int not null default 0,
  add column if not exists mgr_podiums int not null default 0,
  add column if not exists mgr_best int,
  add column if not exists mgr_points int not null default 0,
  add column if not exists mgr_races int not null default 0,
  add column if not exists avatar text;

-- photo de profil : uniquement une des images fournies par le site
alter table public.profiles drop constraint if exists profiles_avatar_ok;
alter table public.profiles add constraint profiles_avatar_ok check (avatar is null or avatar ~ '^assets/avatars/avatar-[0-9]+\.webp$');
-- valeurs plausibles
alter table public.profiles drop constraint if exists profiles_mgr_stats_ok;
alter table public.profiles add constraint profiles_mgr_stats_ok check (mgr_wins >= 0 and mgr_podiums >= mgr_wins and mgr_races >= mgr_podiums and mgr_points >= 0 and (mgr_best is null or mgr_best between 1 and 22));

create index if not exists profiles_mgr_points on public.profiles (mgr_points desc);
