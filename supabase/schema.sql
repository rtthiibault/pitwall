-- PITWALL : système d'amis (à exécuter une seule fois dans Supabase > SQL Editor > New query > Run)

-- Profils publics (pseudo + statistiques de jeu). Aucune donnée personnelle.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_.-]{3,24}$'),
  team text,
  balance numeric not null default 1000,
  profit numeric not null default 0,
  bets_won int not null default 0,
  bets_done int not null default 0,
  best_odds numeric not null default 0,
  achievements int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists profiles_username_lower on public.profiles (lower(username));

alter table public.profiles enable row level security;
drop policy if exists "profils visibles" on public.profiles;
create policy "profils visibles" on public.profiles for select to authenticated using (true);
drop policy if exists "créer son profil" on public.profiles;
create policy "créer son profil" on public.profiles for insert to authenticated with check (auth.uid() = id);
drop policy if exists "modifier son profil" on public.profiles;
create policy "modifier son profil" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Liens d'amitié : une demande (pending) devient une amitié (accepted) quand le destinataire accepte.
create table if not exists public.friendships (
  id bigint generated always as identity primary key,
  requester uuid not null references public.profiles (id) on delete cascade,
  addressee uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester <> addressee)
);
create unique index if not exists friendships_pair on public.friendships (least(requester, addressee), greatest(requester, addressee));

alter table public.friendships enable row level security;
drop policy if exists "voir ses liens" on public.friendships;
create policy "voir ses liens" on public.friendships for select to authenticated using (auth.uid() in (requester, addressee));
drop policy if exists "envoyer une demande" on public.friendships;
create policy "envoyer une demande" on public.friendships for insert to authenticated with check (auth.uid() = requester and status = 'pending');
drop policy if exists "accepter une demande" on public.friendships;
create policy "accepter une demande" on public.friendships for update to authenticated using (auth.uid() = addressee) with check (auth.uid() = addressee and status = 'accepted');
drop policy if exists "supprimer un lien" on public.friendships;
create policy "supprimer un lien" on public.friendships for delete to authenticated using (auth.uid() in (requester, addressee));
