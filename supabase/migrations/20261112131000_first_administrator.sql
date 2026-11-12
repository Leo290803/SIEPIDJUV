-- A identidade administrativa é preparada fora do frontend. Confirmação de e-mail
-- pelo Auth é obrigatória antes de o primeiro vínculo ser liberado.
create table siep_private.bootstrap_administrators (
 institution_id uuid primary key references public.institutions(id),
 email text not null check(email=lower(btrim(email))),
 assigned_user_id uuid references auth.users(id),
 assigned_at timestamptz,
 created_at timestamptz not null default now()
);
revoke all on siep_private.bootstrap_administrators from public,anon,authenticated;
create function siep_private.activate_bootstrap_administrator() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare assignment record;
begin
 if new.email_confirmed_at is null then return new; end if;
 for assignment in select * from siep_private.bootstrap_administrators where email=lower(new.email) and assigned_user_id is null for update loop
  insert into public.institution_memberships(institution_id,user_id,role,status) values(assignment.institution_id,new.id,'admin','approved') on conflict(institution_id,user_id) do update set role='admin',status='approved';
  update siep_private.bootstrap_administrators set assigned_user_id=new.id,assigned_at=now() where institution_id=assignment.institution_id;
 end loop;
 return new;
end $$;
revoke all on function siep_private.activate_bootstrap_administrator() from public,anon,authenticated;
create trigger siep_activate_first_admin after insert or update of email,email_confirmed_at on auth.users for each row execute function siep_private.activate_bootstrap_administrator();
