-- Use the event limits before creating a draft, with one team per school by default.
create function siep_private.registration_openings(ev uuid,school uuid,category uuid,proof uuid) returns jsonb
language sql stable set search_path=pg_catalog as $$
 with configured as (
  select proof_id, (parameters->>'max')::integer as capacity
  from public.event_rules
  where event_id=ev and category_id=category and enabled and kind='schoolEntries'
   and (proof_id is null or proof_id=proof)
   and parameters->>'max' is not null
 ), limits as (
  select proof_id,capacity from configured
  union all
  select proof,1 from public.event_categories
  where id=category and event_id=ev and participation='team' and not exists(select 1 from configured)
 ), blocked as (
  select l.proof_id
  from limits l
  where l.capacity <= (select count(*) from public.registrations r
   where r.event_id=ev and r.school_id=school and r.category_id=category
    and (l.proof_id is null or r.proof_id=l.proof_id) and r.status not in ('cancelled','rejected'))
 )
 select jsonb_build_object('blocked',exists(select 1 from blocked),'registrations',coalesce((
  select jsonb_agg(jsonb_build_object('id',r.id,'status',r.status,'created_at',r.created_at) order by r.created_at,r.id)
  from public.registrations r
  where r.event_id=ev and r.school_id=school and r.category_id=category and r.status not in ('cancelled','rejected')
   and exists(select 1 from blocked b where b.proof_id is null or b.proof_id=r.proof_id)
 ),'[]'::jsonb));
$$;

create function public.siep_registration_openings(p_event_id uuid,p_school_id uuid,p_category_id uuid,p_proof_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare tenant uuid;
begin
 select institution_id into tenant from public.events where id=p_event_id;
 perform siep_private.require_school(tenant,p_school_id);
 return siep_private.registration_openings(p_event_id,p_school_id,p_category_id,p_proof_id);
end $$;

revoke all on function siep_private.registration_openings(uuid,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.siep_registration_openings(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.siep_registration_openings(uuid,uuid,uuid,uuid) to authenticated;

create or replace function public.siep_save_registration(p_event_id uuid,p_school_id uuid,p_category_id uuid,p_proof_id uuid,p_athletes jsonb,p_staff jsonb,p_registration_id uuid default null,p_expected_revision integer default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare e public.events; r public.registrations; item jsonb; issues jsonb;
begin
 select * into e from public.events where id=p_event_id for update;
 if not found then raise exception 'Evento indisponível' using errcode='P0002'; end if;
 perform siep_private.require_school(e.institution_id,p_school_id);
 if e.status='archived' or exists(select 1 from public.schools where id=p_school_id and archived) then raise exception 'Evento/escola arquivado' using errcode='23514'; end if;
 if jsonb_typeof(p_athletes) is distinct from 'array' or jsonb_typeof(p_staff) is distinct from 'array' then raise exception 'Integrantes devem ser listas' using errcode='23514'; end if;
 if jsonb_array_length(p_athletes)>1000 or jsonb_array_length(p_staff)>100 then raise exception 'Lista de integrantes excessiva' using errcode='23514'; end if;
 -- Mesma ordem de locks em todas as inscrições: evento, depois pessoas por UUID.
 perform 1 from public.people p where p.id in (
  select ep.person_id from public.event_participations ep join jsonb_array_elements(p_athletes) x on ep.id=(x->>'participation_id')::uuid
  union select (x->>'person_id')::uuid from jsonb_array_elements(p_staff) x
 ) order by p.id for share;
 if p_registration_id is null then
  if (siep_private.registration_openings(e.id,p_school_id,p_category_id,p_proof_id)->>'blocked')::boolean then
   raise exception 'Limite de inscrições atingido. Abra uma inscrição existente em Minhas inscrições.' using errcode='23514';
  end if;
  insert into public.registrations(institution_id,event_id,school_id,category_id,proof_id,created_by,updated_by) values(e.institution_id,e.id,p_school_id,p_category_id,p_proof_id,auth.uid(),auth.uid()) returning * into r;
 else
  select * into r from public.registrations where id=p_registration_id and event_id=e.id and school_id=p_school_id for update;
  if not found then raise exception 'Inscrição indisponível' using errcode='P0002'; end if;
  if p_expected_revision is null or p_expected_revision<>r.revision then raise exception 'Inscrição alterada; recarregue a revisão atual' using errcode='40001'; end if;
  if r.status not in ('draft','correction_requested') then raise exception 'Inscrição não editável' using errcode='23514'; end if;
  if r.status='correction_requested' and (coalesce(r.correction_deadline,e.correction_deadline) is not null and now()>coalesce(r.correction_deadline,e.correction_deadline)) then raise exception 'Prazo de correção encerrado' using errcode='23514'; end if;
  if (r.category_id,r.proof_id) is distinct from (p_category_id,p_proof_id) then raise exception 'Categoria/prova imutáveis; cancele e crie outra inscrição' using errcode='23514'; end if;
  delete from public.registration_athletes where registration_id=r.id;
  delete from public.registration_staff where registration_id=r.id;
  update public.registrations set revision=revision+1,updated_at=now(),updated_by=auth.uid() where id=r.id returning * into r;
 end if;
 for item in select value from jsonb_array_elements(p_athletes) loop
  if jsonb_typeof(item)<>'object' or not (item ? 'participation_id' and item ? 'slot_number') then raise exception 'Atleta deve informar participação e vaga' using errcode='23514'; end if;
  insert into public.registration_athletes(institution_id,event_id,school_id,registration_id,participation_id,person_id,slot_number) values(e.institution_id,e.id,p_school_id,r.id,(item->>'participation_id')::uuid,gen_random_uuid(),(item->>'slot_number')::integer);
 end loop;
 for item in select value from jsonb_array_elements(p_staff) loop
  insert into public.registration_staff(institution_id,event_id,school_id,registration_id,person_id,staff_role_id) values(e.institution_id,e.id,p_school_id,r.id,(item->>'person_id')::uuid,(item->>'staff_role_id')::uuid);
 end loop;
 issues:=siep_private.registration_issues(r.id);
 perform siep_private.record_registration(r.id);
 return jsonb_build_object('id',r.id,'revision',r.revision,'status',r.status,'issues',issues);
end $$;

notify pgrst,'reload schema';
