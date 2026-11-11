-- O rascunho também deve respeitar o limite de leitura de dados pessoais.
-- Validar apenas no envio permitiria incluir identidade de outra escola no snapshot.
create function siep_private.staff_school_boundary() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if not exists(
  select 1 from public.school_people sp join public.people p on p.id=sp.person_id and p.institution_id=sp.institution_id
  where sp.institution_id=new.institution_id and sp.school_id=new.school_id and sp.person_id=new.person_id
   and sp.role='staff' and sp.status='approved' and not p.archived
 ) then raise exception 'Profissional sem vínculo aprovado nesta escola' using errcode='23514'; end if;
 return new;
end $$;
revoke all on function siep_private.staff_school_boundary() from public,anon,authenticated;
create trigger staff_school_boundary before insert or update on public.registration_staff for each row execute function siep_private.staff_school_boundary();
