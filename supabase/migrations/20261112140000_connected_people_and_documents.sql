-- Estado do perfil por escola/papel: arquivar atleta não arquiva a identidade
-- compartilhada com a comissão técnica ou outro vínculo autorizado.
alter table public.school_people add column archived boolean not null default false;
alter table public.school_people add column version bigint not null default 1;
alter table public.school_people add column updated_at timestamptz not null default now();
create function siep_private.touch_school_person() returns trigger language plpgsql set search_path=pg_catalog as $$
begin new.version:=old.version+1;new.updated_at:=now();return new;end $$;
revoke all on function siep_private.touch_school_person() from public,anon,authenticated;
create trigger touch_school_person before update on public.school_people for each row execute function siep_private.touch_school_person();

create function public.siep_save_connected_person(p_institution_id uuid,p_school_id uuid,p_role text,p_data jsonb,p_link_id uuid default null,p_create_id uuid default null,p_expected_version bigint default null,p_event_id uuid default null,p_category_ids uuid[] default null,p_additional_data jsonb default '{}',p_expected_person_updated_at timestamptz default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare person public.people; link public.school_people; person_uuid uuid; profile jsonb; identity_changed boolean;
begin
 perform siep_private.require_school(p_institution_id,p_school_id);
 if p_role is null or p_role not in ('athlete','staff','responsible') then raise exception 'Papel inválido' using errcode='23514'; end if;
 if p_role='responsible' then perform siep_private.require_staff(p_institution_id); end if;
 if p_event_id is not null then
  perform 1 from public.events where id=p_event_id and institution_id=p_institution_id for update;
  if not found or p_role<>'athlete' then raise exception 'Evento indisponível' using errcode='23514'; end if;
 end if;
 if p_link_id is not null then
  select * into link from public.school_people where id=p_link_id and institution_id=p_institution_id and school_id=p_school_id and role=p_role;
  if not found then raise exception 'Vínculo indisponível; não altere a escola de um cadastro existente' using errcode='42501'; end if;
  select * into strict person from public.people where id=link.person_id for update;
  select * into strict link from public.school_people where id=link.id for update;
  if p_expected_version is null or link.version<>p_expected_version then raise exception 'Cadastro alterado; recarregue' using errcode='40001'; end if;
 else
  select * into person from public.people where institution_id=p_institution_id and cpf=regexp_replace(p_data->>'cpf','[^0-9]','','g') for update;
  if found then
   if not siep_private.can_person(p_institution_id,person.id) then raise exception 'CPF já cadastrado; solicite revisão à secretaria' using errcode='23514'; end if;
   if (person.full_name,person.birth_date,person.gender) is distinct from (btrim(p_data->>'full_name'),(p_data->>'birth_date')::date,p_data->>'gender') then raise exception 'CPF existente com dados diferentes; edite a identidade já cadastrada' using errcode='23514'; end if;
   select * into link from public.school_people where institution_id=p_institution_id and school_id=p_school_id and person_id=person.id and role=p_role;
   if found then
    if p_create_id is null or p_create_id<>person.id then raise exception 'Já existe este cadastro nesta escola; abra Editar' using errcode='23505'; end if;
   elsif p_role='responsible' then
    insert into public.school_people(institution_id,school_id,person_id,role,status) values(p_institution_id,p_school_id,person.id,p_role,'pending') returning * into link;
   else
    perform public.siep_link_person(p_institution_id,p_school_id,person.id,p_role);
    select * into strict link from public.school_people where institution_id=p_institution_id and school_id=p_school_id and person_id=person.id and role=p_role;
   end if;
  else
   insert into public.people(id,institution_id,full_name,birth_date,cpf,gender,contact) values(coalesce(p_create_id,gen_random_uuid()),p_institution_id,btrim(p_data->>'full_name'),(p_data->>'birth_date')::date,regexp_replace(p_data->>'cpf','[^0-9]','','g'),p_data->>'gender',coalesce(p_data->'contact','{}')) returning * into person;
   insert into public.school_people(institution_id,school_id,person_id,role,status) values(p_institution_id,p_school_id,person.id,p_role,case when p_role='responsible' then 'pending' else 'approved' end) returning * into link;
  end if;
 end if;
 if p_role in ('athlete','staff') and link.status<>'approved' then raise exception 'Vínculo encerrado; solicite análise da secretaria antes de reativar' using errcode='23514'; end if;
 person_uuid:=person.id;
 identity_changed:=(person.full_name,person.birth_date,person.cpf,person.gender,person.contact) is distinct from (btrim(p_data->>'full_name'),(p_data->>'birth_date')::date,regexp_replace(p_data->>'cpf','[^0-9]','','g'),p_data->>'gender',coalesce(p_data->'contact','{}'));
 if identity_changed then
  if p_link_id is not null and person.updated_at is distinct from p_expected_person_updated_at then raise exception 'Identidade alterada; recarregue o cadastro' using errcode='40001'; end if;
  if exists(select 1 from public.registration_staff rs join public.registrations r on r.id=rs.registration_id where rs.person_id=person_uuid and r.status in ('submitted','approved')) then raise exception 'Profissional em inscrição enviada; solicite correção antes de editar' using errcode='23514'; end if;
  perform public.siep_save_person(p_institution_id,p_school_id,p_role,p_data||jsonb_build_object('archived',person.archived),person_uuid);
 end if;
 if coalesce((p_data->>'archived')::boolean,false) and (
  exists(select 1 from public.registration_athletes ra join public.registrations r on r.id=ra.registration_id where ra.person_id=person_uuid and r.school_id=p_school_id and r.status in ('submitted','approved')) or
  exists(select 1 from public.registration_staff rs join public.registrations r on r.id=rs.registration_id where rs.person_id=person_uuid and r.school_id=p_school_id and r.status in ('submitted','approved'))
 ) then raise exception 'Cadastro em inscrição enviada; solicite correção antes de arquivar' using errcode='23514'; end if;
 update public.school_people set position=p_data->>'position',professional_registration=p_data->>'professional_registration',archived=coalesce((p_data->>'archived')::boolean,false) where id=link.id returning * into link;
 if p_event_id is not null then profile:=public.siep_save_participation(p_event_id,p_school_id,person_uuid,p_category_ids,p_additional_data,false); end if;
 return jsonb_build_object('person_id',person_uuid,'link_id',link.id,'version',link.version,'participation',profile);
end $$;
revoke all on function public.siep_save_connected_person(uuid,uuid,text,jsonb,uuid,uuid,bigint,uuid,uuid[],jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.siep_save_connected_person(uuid,uuid,text,jsonb,uuid,uuid,bigint,uuid,uuid[],jsonb,timestamptz) to authenticated;

create function public.siep_remove_document(p_document_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare d public.participant_documents; p public.event_participations;
begin
 perform 1 from public.events e join public.participant_documents doc on doc.event_id=e.id where doc.id=p_document_id for update of e;
 select * into d from public.participant_documents where id=p_document_id for update;
 if not found then raise exception 'Documento indisponível' using errcode='P0002'; end if;
 select * into strict p from public.event_participations where id=d.participation_id;
 perform siep_private.require_school(p.institution_id,p.school_id);
 if exists(select 1 from public.registration_athletes ra join public.registrations r on r.id=ra.registration_id where ra.participation_id=p.id and r.status in ('submitted','approved')) then raise exception 'Documento em inscrição enviada; solicite correção' using errcode='23514'; end if;
 update public.participant_documents set status='superseded' where id=d.id and status in ('pending','uploaded');
 update public.event_participations set status='draft',validated_configuration_version=null,updated_at=now() where id=p.id;
end $$;
revoke all on function public.siep_remove_document(uuid) from public,anon,authenticated;
grant execute on function public.siep_remove_document(uuid) to authenticated;

create or replace function siep_private.participation_issues(participation uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare p public.event_participations; person public.people; cat public.event_categories; item record; issues jsonb := '[]';
begin
 select * into p from public.event_participations where id=participation;
 if not found then return jsonb_build_array('participation_not_found'); end if;
 select * into person from public.people where id=p.person_id and institution_id=p.institution_id;
 if person.archived or p.status='archived' then issues:=issues||jsonb_build_array('person_or_participation_archived'); end if;
 if not exists(select 1 from public.school_people sp join public.schools s on s.id=sp.school_id where sp.institution_id=p.institution_id and sp.school_id=p.school_id and sp.person_id=p.person_id and sp.role='athlete' and sp.status='approved' and not sp.archived and not s.archived) then issues:=issues||jsonb_build_array('athlete_school_link_required'); end if;
 if not exists(select 1 from public.participation_categories pc where pc.participation_id=p.id) then issues:=issues||jsonb_build_array('category_required'); end if;
 for cat in select c.* from public.participation_categories pc join public.event_categories c on c.id=pc.category_id where pc.participation_id=p.id loop
  if not cat.enabled or not exists(select 1 from public.event_modalities m where m.id=cat.modality_id and m.enabled) then issues:=issues||jsonb_build_array('category_disabled:'||cat.id); end if;
  if cat.birth_year_start is not null and extract(year from person.birth_date) not between cat.birth_year_start and cat.birth_year_end then issues:=issues||jsonb_build_array('birth_year:'||cat.id); end if;
  if cat.gender is not null and cat.gender<>person.gender then issues:=issues||jsonb_build_array('category_gender:'||cat.id); end if;
 end loop;
 for item in select * from public.event_fields where event_id=p.event_id and requirement='required' and field_key not in ('name','full_name','birth','birth_date','cpf','gender') loop
  if not p.additional_data ? item.field_key or p.additional_data->item.field_key='null'::jsonb or btrim(p.additional_data->>item.field_key)='' then issues:=issues||jsonb_build_array('field_required:'||item.field_key); end if;
 end loop;
 for item in select * from public.document_requirements dr where dr.event_id=p.event_id and dr.required and dr.enabled and (dr.category_id is null or exists(select 1 from public.participation_categories pc where pc.participation_id=p.id and pc.category_id=dr.category_id)) loop
  if not exists(select 1 from public.participant_documents d join storage.objects o on o.bucket_id=d.bucket_id and o.name=d.object_path where d.participation_id=p.id and d.requirement_id=item.id and d.status='uploaded' and d.size_bytes<=item.max_bytes and (not item.image_only or d.mime_type in ('image/png','image/jpeg'))) then issues:=issues||jsonb_build_array('document_required:'||item.id); end if;
 end loop;
 return issues;
end $$;


create or replace function siep_private.registration_issues(registration uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare r public.registrations; c public.event_categories; pr public.event_proofs; rule public.event_rules; athlete record; professional record; issues jsonb:='[]'; n integer; ns integer; value integer; key text; count_value integer; birth date; reference_date date;
begin
 select * into r from public.registrations where id=registration;
 if not found then return jsonb_build_array('registration_not_found'); end if;
 select * into c from public.event_categories where id=r.category_id;
 select * into pr from public.event_proofs where id=r.proof_id;
 if not c.enabled or not exists(select 1 from public.event_modalities m where m.id=c.modality_id and m.enabled) then issues:=issues||jsonb_build_array('category_disabled'); end if;
 if r.proof_id is not null and pr.slots_per_school is null then issues:=issues||jsonb_build_array('proof_capacity_required'); end if;
 if r.proof_id is not null and not pr.enabled then issues:=issues||jsonb_build_array('proof_disabled'); end if;
 if r.proof_id is null and exists(select 1 from public.event_proofs where category_id=c.id) then issues:=issues||jsonb_build_array('proof_required'); end if;
 if exists(select 1 from public.schools where id=r.school_id and archived) then issues:=issues||jsonb_build_array('school_archived'); end if;
 select count(*) into n from public.registration_athletes where registration_id=r.id;
 select count(*) into ns from public.registration_staff where registration_id=r.id;
 if n=0 then issues:=issues||jsonb_build_array('athlete_required'); end if;
 if coalesce(pr.kind,'individual')<>'relay' and ((c.min_athletes is not null and n<c.min_athletes) or (c.max_athletes is not null and n>c.max_athletes)) then issues:=issues||jsonb_build_array('category_roster'); end if;
 if r.proof_id is not null and pr.min_athletes is not null and n<pr.min_athletes then issues:=issues||jsonb_build_array('proof_minimum'); end if;
 for professional in select rs.*,p.archived,er.enabled from public.registration_staff rs join public.people p on p.id=rs.person_id join public.event_staff_roles er on er.id=rs.staff_role_id where rs.registration_id=r.id loop
  if professional.archived or not professional.enabled or not exists(select 1 from public.school_people sp where sp.institution_id=r.institution_id and sp.school_id=r.school_id and sp.person_id=professional.person_id and sp.role='staff' and sp.status='approved' and not sp.archived and btrim(coalesce(sp.position,''))<>'' and lower(btrim(sp.position))=lower(btrim((select name from public.event_staff_roles where id=professional.staff_role_id)))) then issues:=issues||jsonb_build_array('staff_ineligible:'||professional.person_id); end if;
 end loop;
 for athlete in select ra.*,ep.status as participation_status,p.birth_date,p.gender from public.registration_athletes ra join public.event_participations ep on ep.id=ra.participation_id join public.people p on p.id=ra.person_id where ra.registration_id=r.id loop
  if athlete.participation_status<>'complete' or siep_private.participation_issues(athlete.participation_id)<>'[]'::jsonb then issues:=issues||jsonb_build_array('participation_incomplete:'||athlete.person_id); end if;
  if not exists(select 1 from public.participation_categories pc where pc.participation_id=athlete.participation_id and pc.category_id=r.category_id) then issues:=issues||jsonb_build_array('category_not_selected:'||athlete.person_id); end if;
  if c.birth_year_start is not null and extract(year from athlete.birth_date) not between c.birth_year_start and c.birth_year_end then issues:=issues||jsonb_build_array('birth_year:'||athlete.person_id); end if;
  if (c.gender is not null and c.gender<>athlete.gender) or (pr.gender is not null and pr.gender<>athlete.gender) then issues:=issues||jsonb_build_array('gender:'||athlete.person_id); end if;
  issues:=issues||siep_private.candidate_athlete_issues(r.event_id,athlete.person_id,r.category_id,r.proof_id,r.id);
 end loop;
 for rule in select * from public.event_rules where event_id=r.event_id and enabled and (category_id is null or category_id=r.category_id) and (proof_id is null or proof_id=r.proof_id) loop
  if rule.kind in ('roster','staffLimits') then
   count_value:=case when rule.kind='roster' then n else ns end;
   if ((rule.parameters->>'min')::integer is not null and count_value<(rule.parameters->>'min')::integer) or ((rule.parameters->>'max')::integer is not null and count_value>(rule.parameters->>'max')::integer) then issues:=issues||jsonb_build_array('rule:'||rule.id); end if;
  elsif rule.kind='schoolEntries' then
   select count(*) into count_value from public.registrations x where x.event_id=r.event_id and x.school_id=r.school_id and x.category_id=r.category_id and (rule.proof_id is null or x.proof_id=rule.proof_id) and x.status not in ('cancelled','rejected');
   if count_value>(rule.parameters->>'max')::integer then issues:=issues||jsonb_build_array('rule:'||rule.id); end if;
  end if;

 end loop;
 return (select coalesce(jsonb_agg(distinct v),'[]') from jsonb_array_elements(issues) v);
end $$;


create or replace function siep_private.staff_school_boundary() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if not exists(
  select 1 from public.school_people sp join public.people p on p.id=sp.person_id and p.institution_id=sp.institution_id
  where sp.institution_id=new.institution_id and sp.school_id=new.school_id and sp.person_id=new.person_id
   and sp.role='staff' and sp.status='approved' and not sp.archived and not p.archived
 ) then raise exception 'Profissional sem vínculo aprovado nesta escola' using errcode='23514'; end if;
 return new;
end $$;

revoke all on function siep_private.participation_issues(uuid),siep_private.registration_issues(uuid),siep_private.staff_school_boundary() from public,anon,authenticated;

create or replace function siep_private.can_school(tenant uuid,school uuid) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select siep_private.is_staff(tenant) or exists(select 1 from public.school_people sp join public.schools s on s.id=sp.school_id join public.people p on p.id=sp.person_id where sp.institution_id=tenant and sp.school_id=school and sp.role='responsible' and sp.status='approved' and not sp.archived and sp.user_id=auth.uid() and not s.archived and not p.archived);
$$;

create or replace function public.siep_decide_transfer(p_transfer_id uuid,p_status text,p_reason text) returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare t public.athlete_transfer_requests;
begin
 select * into t from public.athlete_transfer_requests where id=p_transfer_id for update;
 if not found then raise exception 'Transferência indisponível' using errcode='P0002'; end if;
 perform siep_private.require_staff(t.institution_id);
 if t.status<>'pending' or p_status not in ('approved','refused') or btrim(coalesce(p_reason,''))='' then raise exception 'Decisão inválida' using errcode='23514'; end if;
 perform 1 from public.people where id=t.person_id for update;
 if p_status='approved' then
  if not exists(select 1 from public.schools where id=t.target_school_id and not archived) or not exists(select 1 from public.people where id=t.person_id and not archived) then raise exception 'Destino/pessoa arquivado' using errcode='23514'; end if;
  if not exists(select 1 from public.school_people where institution_id=t.institution_id and school_id=t.source_school_id and person_id=t.person_id and role='athlete' and status='approved') then raise exception 'Vínculo de origem já alterado' using errcode='23514'; end if;
  if exists(select 1 from public.event_participations p join public.events e on e.id=p.event_id where p.institution_id=t.institution_id and p.person_id=t.person_id and p.status<>'archived' and e.status not in ('closed','archived')) then raise exception 'Há participação em edição em curso; encerre/revise antes de transferir' using errcode='23514'; end if;
  update public.school_people set status='closed' where institution_id=t.institution_id and school_id=t.source_school_id and person_id=t.person_id and role='athlete' and status='approved';
  insert into public.school_people(institution_id,school_id,person_id,role,status) values(t.institution_id,t.target_school_id,t.person_id,'athlete','approved') on conflict(institution_id,school_id,person_id,role) do update set status='approved',archived=false;
 end if;
 update public.athlete_transfer_requests set status=p_status,decision_reason=p_reason,decided_by=auth.uid(),decided_at=now() where id=t.id;
end $$;

