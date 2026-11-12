-- Mantém exigências desativadas na duplicação após a integração de formulários.
create or replace function public.siep_duplicate_event(p_source_event_id uuid,p_name text,p_edition text,p_registration_start timestamptz default null,p_registration_end timestamptz default null) returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare source public.events; target uuid; modalities jsonb:='{}'; categories jsonb:='{}'; proofs jsonb:='{}'; row_record record; new_uuid uuid;
begin
 select * into source from public.events where id=p_source_event_id for update;
 if not found then raise exception 'Evento indisponível' using errcode='P0002'; end if;
 perform siep_private.require_staff(source.institution_id);
 insert into public.events(institution_id,name,edition,status,registration_start,registration_end,settings) values(source.institution_id,p_name,p_edition,'draft',p_registration_start,p_registration_end,source.settings) returning id into target;
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

revoke all on function public.siep_duplicate_event(uuid,text,text,timestamptz,timestamptz) from public,anon;
