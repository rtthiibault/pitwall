-- PITWALL : photos de profil importées par les joueurs.
-- À exécuter une fois dans Supabase > SQL Editor, APRÈS migration-profile-v2.sql.
-- Autorise, en plus des images du site, une petite photo JPEG/WebP encodée en base64 (128 px, ~10 Ko, 40 000 caractères au plus).
-- Sans cette migration, la photo importée reste visible sur l'appareil du joueur, mais pas chez les autres joueurs.
alter table public.profiles drop constraint if exists profiles_avatar_ok;
alter table public.profiles add constraint profiles_avatar_ok check (
  avatar is null
  or avatar ~ '^assets/avatars/avatar-[0-9]+\.webp$'
  or (length(avatar) <= 40000 and avatar ~ '^data:image/(jpeg|webp);base64,[A-Za-z0-9+/=]+$')
);
