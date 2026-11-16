-- Responsável legal por evento, apenas para menores na data explícita de início.
-- Eventos existentes permanecem desativados por padrão; nenhum cadastro é regravado.
create function siep_private.check_guardian_settings() returns trigger
language plpgsql set search_path=pg_catalog as $$
declare policy jsonb:=new.settings->'guardian';item record;ref date;
begin
 if policy is null then return new;end if;
 if jsonb_typeof(policy)<>'object' or jsonb_typeof(policy->'enabled') is distinct from 'boolean' or jsonb_typeof(policy->'fields') is distinct from 'object' then raise exception 'Configuração do responsável legal inválida' using errcode='23514';end if;
 if exists(select 1 from jsonb_object_keys(policy) k where k not in ('enabled','referenceDate','fields')) then raise exception 'Opção desconhecida do responsável' using errcode='23514';end if;
 if jsonb_typeof(policy->'referenceDate') is distinct from 'string' then raise exception 'Data de início do evento inválida' using errcode='23514';end if;
 if coalesce(policy->>'referenceDate','')<>'' then
  if policy->>'referenceDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Data de início do evento inválida' using errcode='23514';end if;
  begin ref:=(policy->>'referenceDate')::date;exception when others then raise exception 'Data de início do evento inválida' using errcode='23514';end;
  if ref<date '1900-01-01' or ref>date '9999-12-31' then raise exception 'Data de início do evento inválida' using errcode='23514';end if;
 elsif (policy->>'enabled')::boolean then raise exception 'Informe a data de início do evento para calcular a idade' using errcode='23514';end if;
 for item in select key,value from jsonb_each(policy->'fields') loop
  if item.key not in ('guardian_name','guardian_cpf','guardian_relationship','guardian_phone','guardian_email') or item.value not in ('"hidden"'::jsonb,'"optional"'::jsonb,'"required"'::jsonb) then raise exception 'Exigência do responsável inválida' using errcode='23514';end if;
 end loop;
 if (select count(*) from jsonb_object_keys(policy->'fields'))<>5 then raise exception 'Configure os cinco campos do responsável' using errcode='23514';end if;
 if (policy->>'enabled')::boolean and not exists(select 1 from jsonb_each_text(policy->'fields') where value<>'hidden') then raise exception 'Selecione ao menos um dado do responsável' using errcode='23514';end if;
 return new;
end $$;
create trigger check_guardian_settings before insert or update of settings on public.events for each row execute function siep_private.check_guardian_settings();
revoke all on function siep_private.check_guardian_settings() from public,anon,authenticated;

create function siep_private.guardian_issues(event_uuid uuid,person_uuid uuid,additional jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare e public.events;p public.people;policy jsonb;ref date;key text;value text;cpf text;issues jsonb:='[]';
begin
 select * into e from public.events where id=event_uuid;
 policy:=e.settings->'guardian';
 if coalesce((policy->>'enabled')::boolean,false)=false then return issues;end if;
 ref:=(policy->>'referenceDate')::date;
 select * into p from public.people where id=person_uuid and institution_id=e.institution_id;
 if not found then return '["guardian_person_unavailable"]';end if;
 if p.birth_date>ref then return '["guardian_birth_after_event"]';end if;
 -- Intervalo de anos trata 29/02 como 28/02 quando o aniversário não é bissexto.
 if (p.birth_date+interval '18 years')::date<=ref then return issues;end if;
 foreach key in array array['guardian_name','guardian_cpf','guardian_relationship','guardian_phone','guardian_email'] loop
  if policy->'fields'->>key='hidden' then continue;end if;
  value:=btrim(coalesce(additional->>key,''));
  if policy->'fields'->>key='required' and value='' then issues:=issues||jsonb_build_array('field_required:'||key);continue;end if;
  if value='' then continue;end if;
  if jsonb_typeof(additional->key)<>'string' then issues:=issues||jsonb_build_array('guardian_invalid:'||key);continue;end if;
  if key='guardian_name' and length(value) not between 2 and 150 then issues:=issues||jsonb_build_array('guardian_invalid:'||key);
  elsif key='guardian_cpf' then
   cpf:=regexp_replace(value,'[^0-9]','','g');
   if not siep_private.valid_cpf(cpf) or cpf=p.cpf then issues:=issues||jsonb_build_array('guardian_invalid:'||key);end if;
  elsif key='guardian_relationship' and value not in ('Mãe','Pai','Tutor(a) legal','Outro responsável legal') then issues:=issues||jsonb_build_array('guardian_invalid:'||key);
  elsif key='guardian_phone' and regexp_replace(value,'[^0-9]','','g') !~ '^[0-9]{10,15}$' then issues:=issues||jsonb_build_array('guardian_invalid:'||key);
  elsif key='guardian_email' and (value !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(value)>200) then issues:=issues||jsonb_build_array('guardian_invalid:'||key);
  end if;
 end loop;
 return issues;
end $$;
revoke all on function siep_private.guardian_issues(uuid,uuid,jsonb) from public,anon,authenticated;

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
 issues:=issues||siep_private.guardian_issues(p.event_id,p.person_id,p.additional_data);
 return issues;
end $$;

create or replace function public.siep_save_event_configuration(p_event_id uuid,p_expected_version bigint,p_section text,p_payload jsonb) returns bigint
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
  if p_payload ? 'guardian' then update public.events set settings=settings||jsonb_build_object('guardian',p_payload->'guardian') where id=e.id;end if;
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

create or replace function public.siep_duplicate_event(p_source_event_id uuid,p_name text,p_edition text,p_registration_start timestamptz default null,p_registration_end timestamptz default null) returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare source public.events; target uuid; modalities jsonb:='{}'; categories jsonb:='{}'; proofs jsonb:='{}'; row_record record; new_uuid uuid;
begin
 select * into source from public.events where id=p_source_event_id for update;
 if not found then raise exception 'Evento indisponível' using errcode='P0002'; end if;
 perform siep_private.require_staff(source.institution_id);
 insert into public.events(institution_id,name,edition,status,registration_start,registration_end,settings) values(source.institution_id,p_name,p_edition,'draft',p_registration_start,p_registration_end,case when source.settings ? 'guardian' then jsonb_set(source.settings,'{guardian}',(source.settings->'guardian')||'{"enabled":false,"referenceDate":""}'::jsonb) else source.settings end) returning id into target;
 for row_record in select * from public.event_modalities where event_id=source.id order by id loop
  new_uuid:=gen_random_uuid(); modalities:=modalities||jsonb_build_object(row_record.id::text,new_uuid);
  insert into public.event_modalities(id,institution_id,event_id,name,classification,enabled) values(new_uuid,source.institution_id,target,row_record.name,row_record.classification,row_record.enabled);
 end loop;
 for row_record in select * from public.event_categories where event_id=source.id order by id loop
  new_uuid:=gen_random_uuid(); categories:=categories||jsonb_build_object(row_record.id::text,new_uuid);
  insert into public.event_categories(id,institution_id,event_id,modality_id,name,participation,birth_year_start,birth_year_end,gender,min_athletes,max_athletes,enabled) values(new_uuid,source.institution_id,target,(modalities->>row_record.modality_id::text)::uuid,row_record.name,row_record.participation,row_record.birth_year_start,row_record.birth_year_end,row_record.gender,row_record.min_athletes,row_record.max_athletes,row_record.enabled);
 end loop;
 for row_record in select * from public.event_proofs where event_id=source.id order by id loop
  new_uuid:=gen_random_uuid(); proofs:=proofs||jsonb_build_object(row_record.id::text,new_uuid);
  insert into public.event_proofs(id,institution_id,event_id,category_id,name,kind,slots_per_school,min_athletes,gender,enabled) values(new_uuid,source.institution_id,target,(categories->>row_record.category_id::text)::uuid,row_record.name,row_record.kind,row_record.slots_per_school,row_record.min_athletes,row_record.gender,row_record.enabled);
 end loop;
 insert into public.event_rules(institution_id,event_id,kind,category_id,proof_id,enabled,parameters) select institution_id,target,kind,(categories->>category_id::text)::uuid,(proofs->>proof_id::text)::uuid,enabled,parameters from public.event_rules where event_id=source.id;
 insert into public.event_fields(institution_id,event_id,field_key,requirement,configuration) select institution_id,target,field_key,requirement,configuration from public.event_fields where event_id=source.id;
 insert into public.document_requirements(institution_id,event_id,name,required,image_only,max_bytes,category_id,enabled) select institution_id,target,name,required,image_only,max_bytes,(categories->>category_id::text)::uuid,enabled from public.document_requirements where event_id=source.id;
 insert into public.event_staff_roles(institution_id,event_id,name,enabled) select institution_id,target,name,enabled from public.event_staff_roles where event_id=source.id;
 return target;
end $$;

revoke all on function public.siep_save_event_configuration(uuid,bigint,text,jsonb),public.siep_duplicate_event(uuid,text,text,timestamptz,timestamptz) from public,anon;
grant execute on function public.siep_save_event_configuration(uuid,bigint,text,jsonb),public.siep_duplicate_event(uuid,text,text,timestamptz,timestamptz) to authenticated;
revoke all on function siep_private.participation_issues(uuid) from public,anon,authenticated;
