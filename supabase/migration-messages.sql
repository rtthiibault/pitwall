-- PITWALL : messagerie privée entre amis.
-- À exécuter une fois dans Supabase > SQL Editor > New query > Run, APRÈS schema.sql (table friendships).
-- Un message ne peut être envoyé qu'à un ami (lien « accepted »), il n'est visible que par ses deux joueurs,
-- et seul le destinataire peut le marquer comme lu.
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  from_id uuid not null references auth.users (id) on delete cascade,
  to_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists messages_to_unread on public.messages (to_id, read_at);
create index if not exists messages_pair on public.messages (least(from_id, to_id), greatest(from_id, to_id), created_at desc);
alter table public.messages enable row level security;

drop policy if exists "lire ses messages" on public.messages;
create policy "lire ses messages" on public.messages for select to authenticated using (auth.uid() in (from_id, to_id));

drop policy if exists "écrire à un ami" on public.messages;
create policy "écrire à un ami" on public.messages for insert to authenticated with check (
  auth.uid() = from_id and from_id <> to_id and read_at is null
  and exists (select 1 from public.friendships f where f.status = 'accepted'
    and ((f.requester = from_id and f.addressee = to_id) or (f.requester = to_id and f.addressee = from_id)))
);

drop policy if exists "marquer lu" on public.messages;
create policy "marquer lu" on public.messages for update to authenticated using (auth.uid() = to_id) with check (auth.uid() = to_id);

-- seul read_at peut changer : le texte, l'expéditeur et le destinataire sont figés
create or replace function public.messages_only_read() returns trigger language plpgsql as $$
begin
  if new.body <> old.body or new.from_id <> old.from_id or new.to_id <> old.to_id or new.created_at <> old.created_at then
    raise exception 'seul le statut de lecture peut être modifié';
  end if;
  return new;
end $$;
drop trigger if exists messages_only_read on public.messages;
create trigger messages_only_read before update on public.messages for each row execute function public.messages_only_read();
