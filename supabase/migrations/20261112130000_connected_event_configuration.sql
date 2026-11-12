alter table public.document_requirements add column enabled boolean not null default true;
create or replace function siep_private.participation_issues(participation uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare p public.event_participations; person public.people; cat public.event_categories; item record; issues jsonb := '[]';
begin
 select * into p from public.event_participations where id=participation;
 if not found then return jsonb_build_array('participation_not_found'); end if;
 select * into person from public.people where id=p.person_id and institution_id=p.institution_id;
 if person.archived or p.status='archived' then issues:=issues||jsonb_build_array('person_or_participation_archived'); end if;
 if not exists(select 1 from public.school_people sp join public.schools s on s.id=sp.school_id where sp.institution_id=p.institution_id and sp.school_id=p.school_id and sp.person_id=p.person_id and sp.role='athlete' and sp.status='approved' and not s.archived) then issues:=issues||jsonb_build_array('athlete_school_link_required'); end if;
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

create or replace function public.siep_prepare_document(p_participation_id uuid,p_requirement_id uuid,p_name text,p_mime_type text,p_size_bytes integer) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare p public.event_participations; requirement public.document_requirements; e public.events; document_uuid uuid:=gen_random_uuid(); path text; previous uuid;
begin
 select e0.* into e from public.events e0 join public.event_participations p0 on p0.event_id=e0.id where p0.id=p_participation_id for update of e0;
 if not found then raise exception 'Cadastro indisponível' using errcode='P0002'; end if;
 select * into strict p from public.event_participations where id=p_participation_id for update;
 perform siep_private.require_school(p.institution_id,p.school_id);
 if e.status='archived' or p.status='archived' then raise exception 'Cadastro/evento arquivado' using errcode='23514'; end if;
 if exists(select 1 from public.registration_athletes ra join public.registrations r on r.id=ra.registration_id where ra.participation_id=p.id and r.status in ('submitted','approved')) then raise exception 'Documento pertence a cadastro enviado; solicite correção' using errcode='23514'; end if;
 select * into requirement from public.document_requirements where id=p_requirement_id and institution_id=p.institution_id and event_id=p.event_id and enabled;
 if not found or (requirement.category_id is not null and not exists(select 1 from public.participation_categories where participation_id=p.id and category_id=requirement.category_id)) then raise exception 'Exigência não aplicável ao cadastro' using errcode='23514'; end if;
 if p_size_bytes is null or p_size_bytes<1 or p_size_bytes>requirement.max_bytes or p_mime_type is null or p_mime_type not in ('application/pdf','image/png','image/jpeg') or (requirement.image_only and p_mime_type not in ('image/png','image/jpeg')) or btrim(coalesce(p_name,''))='' then raise exception 'Arquivo incompatível com a exigência' using errcode='23514'; end if;
 select id into previous from public.participant_documents where participation_id=p.id and requirement_id=requirement.id and status in ('pending','uploaded') for update;
 if previous is not null then update public.participant_documents set status='superseded' where id=previous; end if;
 path:=p.institution_id::text||'/'||p.event_id||'/'||p.id||'/'||document_uuid||case p_mime_type when 'application/pdf' then '.pdf' when 'image/png' then '.png' else '.jpg' end;
 insert into public.participant_documents(id,institution_id,event_id,participation_id,requirement_id,object_path,mime_type,size_bytes,original_name,replaced_document_id) values(document_uuid,p.institution_id,p.event_id,p.id,requirement.id,path,p_mime_type,p_size_bytes,p_name,previous);
 update public.event_participations set status='draft',validated_configuration_version=null,updated_at=now() where id=p.id;
 return jsonb_build_object('id',document_uuid,'bucket','siep-documents','path',path);
end $$;

-- Salva uma seção inteira em transação e rejeita edição desatualizada.
create function public.siep_save_event_configuration(p_event_id uuid,p_expected_version bigint,p_section text,p_payload jsonb) returns bigint
language plpgsql security definer set search_path=pg_catalog as $$
declare e public.events; row_data jsonb;
begin
 select * into e from public.events where id=p_event_id for update;
 if not found then raise exception 'Evento indisponível' using errcode='P0002'; end if;
 perform siep_private.require_staff(e.institution_id);
 if p_expected_version is null or p_expected_version<>e.configuration_version then raise exception 'Configuração alterada; recarregue o evento' using errcode='40001'; end if;
 if p_section is null or p_section not in ('sports','rules','requirements','functions') or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Seção inválida' using errcode='23514'; end if;
 if p_section='sports' then
  if jsonb_typeof(p_payload->'modalities') is distinct from 'array' then raise exception 'Lista modalities obrigatória' using errcode='23514'; end if;
  for row_data in select value from jsonb_array_elements(p_payload->'modalities') loop
   update public.event_modalities set name=(row_data->>'name')::text,classification=(row_data->>'classification')::text,enabled=(row_data->>'enabled')::boolean where id=(row_data->>'id')::uuid and institution_id=e.institution_id and event_id=e.id;
   if not found then insert into public.event_modalities(id,institution_id,event_id,name,classification,enabled) values((row_data->>'id')::uuid,e.institution_id,e.id,(row_data->>'name')::text,(row_data->>'classification')::text,(row_data->>'enabled')::boolean); end if;
  end loop;
  update public.event_modalities t set enabled=false where event_id=e.id and not exists(select 1 from jsonb_array_elements(p_payload->'modalities') x where (x->>'id')::uuid=t.id);
  if jsonb_typeof(p_payload->'categories') is distinct from 'array' then raise exception 'Lista categories obrigatória' using errcode='23514'; end if;
  for row_data in select value from jsonb_array_elements(p_payload->'categories') loop
   update public.event_categories set modality_id=(row_data->>'modality_id')::uuid,name=(row_data->>'name')::text,participation=(row_data->>'participation')::text,birth_year_start=(row_data->>'birth_year_start')::integer,birth_year_end=(row_data->>'birth_year_end')::integer,gender=(row_data->>'gender')::text,min_athletes=(row_data->>'min_athletes')::integer,max_athletes=(row_data->>'max_athletes')::integer,enabled=(row_data->>'enabled')::boolean where id=(row_data->>'id')::uuid and institution_id=e.institution_id and event_id=e.id;
   if not found then insert into public.event_categories(id,institution_id,event_id,modality_id,name,participation,birth_year_start,birth_year_end,gender,min_athletes,max_athletes,enabled) values((row_data->>'id')::uuid,e.institution_id,e.id,(row_data->>'modality_id')::uuid,(row_data->>'name')::text,(row_data->>'participation')::text,(row_data->>'birth_year_start')::integer,(row_data->>'birth_year_end')::integer,(row_data->>'gender')::text,(row_data->>'min_athletes')::integer,(row_data->>'max_athletes')::integer,(row_data->>'enabled')::boolean); end if;
  end loop;
  update public.event_categories t set enabled=false where event_id=e.id and not exists(select 1 from jsonb_array_elements(p_payload->'categories') x where (x->>'id')::uuid=t.id);
  if jsonb_typeof(p_payload->'proofs') is distinct from 'array' then raise exception 'Lista proofs obrigatória' using errcode='23514'; end if;
  for row_data in select value from jsonb_array_elements(p_payload->'proofs') loop
   update public.event_proofs set category_id=(row_data->>'category_id')::uuid,name=(row_data->>'name')::text,kind=(row_data->>'kind')::text,slots_per_school=(row_data->>'slots_per_school')::integer,min_athletes=(row_data->>'min_athletes')::integer,gender=(row_data->>'gender')::text,enabled=(row_data->>'enabled')::boolean where id=(row_data->>'id')::uuid and institution_id=e.institution_id and event_id=e.id;
   if not found then insert into public.event_proofs(id,institution_id,event_id,category_id,name,kind,slots_per_school,min_athletes,gender,enabled) values((row_data->>'id')::uuid,e.institution_id,e.id,(row_data->>'category_id')::uuid,(row_data->>'name')::text,(row_data->>'kind')::text,(row_data->>'slots_per_school')::integer,(row_data->>'min_athletes')::integer,(row_data->>'gender')::text,(row_data->>'enabled')::boolean); end if;
  end loop;
  update public.event_proofs t set enabled=false where event_id=e.id and not exists(select 1 from jsonb_array_elements(p_payload->'proofs') x where (x->>'id')::uuid=t.id);
 end if;
 if p_section='rules' then
  if jsonb_typeof(p_payload->'rules') is distinct from 'array' then raise exception 'Lista rules obrigatória' using errcode='23514'; end if;
  for row_data in select value from jsonb_array_elements(p_payload->'rules') loop
   update public.event_rules set kind=(row_data->>'kind')::text,category_id=(row_data->>'category_id')::uuid,proof_id=(row_data->>'proof_id')::uuid,enabled=(row_data->>'enabled')::boolean,parameters=row_data->'parameters' where id=(row_data->>'id')::uuid and institution_id=e.institution_id and event_id=e.id;
   if not found then insert into public.event_rules(id,institution_id,event_id,kind,category_id,proof_id,enabled,parameters) values((row_data->>'id')::uuid,e.institution_id,e.id,(row_data->>'kind')::text,(row_data->>'category_id')::uuid,(row_data->>'proof_id')::uuid,(row_data->>'enabled')::boolean,row_data->'parameters'); end if;
  end loop;
  delete from public.event_rules t where event_id=e.id and not exists(select 1 from jsonb_array_elements(p_payload->'rules') x where (x->>'id')::uuid=t.id);
 end if;
 if p_section='requirements' then
  if jsonb_typeof(p_payload->'fields') is distinct from 'array' then raise exception 'Lista fields obrigatória' using errcode='23514'; end if;
  for row_data in select value from jsonb_array_elements(p_payload->'fields') loop
   update public.event_fields set field_key=(row_data->>'field_key')::text,requirement=(row_data->>'requirement')::text,configuration=row_data->'configuration' where id=(row_data->>'id')::uuid and institution_id=e.institution_id and event_id=e.id;
   if not found then insert into public.event_fields(id,institution_id,event_id,field_key,requirement,configuration) values((row_data->>'id')::uuid,e.institution_id,e.id,(row_data->>'field_key')::text,(row_data->>'requirement')::text,row_data->'configuration'); end if;
  end loop;
  update public.event_fields t set requirement='hidden' where event_id=e.id and field_key not in ('name','full_name','birth','birth_date','cpf','gender') and not exists(select 1 from jsonb_array_elements(p_payload->'fields') x where (x->>'id')::uuid=t.id);
  if jsonb_typeof(p_payload->'documents') is distinct from 'array' then raise exception 'Lista documents obrigatória' using errcode='23514'; end if;
  for row_data in select value from jsonb_array_elements(p_payload->'documents') loop
   update public.document_requirements set name=(row_data->>'name')::text,required=(row_data->>'required')::boolean,image_only=(row_data->>'image_only')::boolean,max_bytes=(row_data->>'max_bytes')::integer,category_id=(row_data->>'category_id')::uuid,enabled=(row_data->>'enabled')::boolean where id=(row_data->>'id')::uuid and institution_id=e.institution_id and event_id=e.id;
   if not found then insert into public.document_requirements(id,institution_id,event_id,name,required,image_only,max_bytes,category_id,enabled) values((row_data->>'id')::uuid,e.institution_id,e.id,(row_data->>'name')::text,(row_data->>'required')::boolean,(row_data->>'image_only')::boolean,(row_data->>'max_bytes')::integer,(row_data->>'category_id')::uuid,(row_data->>'enabled')::boolean); end if;
  end loop;
  update public.document_requirements t set enabled=false where event_id=e.id and not exists(select 1 from jsonb_array_elements(p_payload->'documents') x where (x->>'id')::uuid=t.id);
 end if;
 if p_section='functions' then
  if jsonb_typeof(p_payload->'roles') is distinct from 'array' then raise exception 'Lista roles obrigatória' using errcode='23514'; end if;
  for row_data in select value from jsonb_array_elements(p_payload->'roles') loop
   update public.event_staff_roles set name=(row_data->>'name')::text,enabled=(row_data->>'enabled')::boolean where id=(row_data->>'id')::uuid and institution_id=e.institution_id and event_id=e.id;
   if not found then insert into public.event_staff_roles(id,institution_id,event_id,name,enabled) values((row_data->>'id')::uuid,e.institution_id,e.id,(row_data->>'name')::text,(row_data->>'enabled')::boolean); end if;
  end loop;
  update public.event_staff_roles t set enabled=false where event_id=e.id and not exists(select 1 from jsonb_array_elements(p_payload->'roles') x where (x->>'id')::uuid=t.id);
 end if;
 return (select configuration_version from public.events where id=e.id);
end $$;
revoke all on function public.siep_save_event_configuration(uuid,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.siep_save_event_configuration(uuid,bigint,text,jsonb) to authenticated;
revoke all on function public.siep_prepare_document(uuid,uuid,text,text,integer) from public,anon;
revoke all on function siep_private.participation_issues(uuid) from public,anon,authenticated;
