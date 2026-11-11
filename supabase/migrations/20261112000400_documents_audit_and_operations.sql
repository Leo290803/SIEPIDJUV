-- Documentos: autorização pelo cadastro da edição e objetos imutáveis por caminho.
create function siep_private.document_access(object_name text,for_upload boolean default false) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from public.participant_documents d join public.event_participations p on p.id=d.participation_id where d.object_path=object_name and d.bucket_id='siep-documents' and siep_private.can_school(p.institution_id,p.school_id) and (not for_upload or (d.status='pending' and not exists(select 1 from public.registration_athletes ra join public.registrations r on r.id=ra.registration_id where ra.participation_id=p.id and r.status in ('submitted','approved')))));
$$;
create policy siep_document_read on storage.objects for select to authenticated using(bucket_id='siep-documents' and siep_private.document_access(name));
create policy siep_document_upload on storage.objects for insert to authenticated with check(bucket_id='siep-documents' and owner_id=auth.uid()::text and siep_private.document_access(name,true));
-- Sem UPDATE/DELETE de objetos: versões enviadas permanecem referenciáveis no histórico.

create function public.siep_prepare_document(p_participation_id uuid,p_requirement_id uuid,p_name text,p_mime_type text,p_size_bytes integer) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare p public.event_participations; requirement public.document_requirements; e public.events; document_uuid uuid:=gen_random_uuid(); path text; previous uuid;
begin
 select e0.* into e from public.events e0 join public.event_participations p0 on p0.event_id=e0.id where p0.id=p_participation_id for update of e0;
 if not found then raise exception 'Cadastro indisponível' using errcode='P0002'; end if;
 select * into strict p from public.event_participations where id=p_participation_id for update;
 perform siep_private.require_school(p.institution_id,p.school_id);
 if e.status='archived' or p.status='archived' then raise exception 'Cadastro/evento arquivado' using errcode='23514'; end if;
 if exists(select 1 from public.registration_athletes ra join public.registrations r on r.id=ra.registration_id where ra.participation_id=p.id and r.status in ('submitted','approved')) then raise exception 'Documento pertence a cadastro enviado; solicite correção' using errcode='23514'; end if;
 select * into requirement from public.document_requirements where id=p_requirement_id and institution_id=p.institution_id and event_id=p.event_id;
 if not found or (requirement.category_id is not null and not exists(select 1 from public.participation_categories where participation_id=p.id and category_id=requirement.category_id)) then raise exception 'Exigência não aplicável ao cadastro' using errcode='23514'; end if;
 if p_size_bytes is null or p_size_bytes<1 or p_size_bytes>requirement.max_bytes or p_mime_type is null or p_mime_type not in ('application/pdf','image/png','image/jpeg') or (requirement.image_only and p_mime_type not in ('image/png','image/jpeg')) or btrim(coalesce(p_name,''))='' then raise exception 'Arquivo incompatível com a exigência' using errcode='23514'; end if;
 select id into previous from public.participant_documents where participation_id=p.id and requirement_id=requirement.id and status in ('pending','uploaded') for update;
 if previous is not null then update public.participant_documents set status='superseded' where id=previous; end if;
 path:=p.institution_id::text||'/'||p.event_id||'/'||p.id||'/'||document_uuid||case p_mime_type when 'application/pdf' then '.pdf' when 'image/png' then '.png' else '.jpg' end;
 insert into public.participant_documents(id,institution_id,event_id,participation_id,requirement_id,object_path,mime_type,size_bytes,original_name,replaced_document_id) values(document_uuid,p.institution_id,p.event_id,p.id,requirement.id,path,p_mime_type,p_size_bytes,p_name,previous);
 update public.event_participations set status='draft',validated_configuration_version=null,updated_at=now() where id=p.id;
 return jsonb_build_object('id',document_uuid,'bucket','siep-documents','path',path);
end $$;
create function public.siep_finalize_document(p_document_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare d public.participant_documents; p public.event_participations; object_record storage.objects; requirement public.document_requirements;
begin
 perform 1 from public.events e join public.participant_documents d0 on d0.event_id=e.id where d0.id=p_document_id for update of e;
 select * into d from public.participant_documents where id=p_document_id for update;
 if not found then raise exception 'Documento indisponível' using errcode='P0002'; end if;
 select * into strict p from public.event_participations where id=d.participation_id;
 perform siep_private.require_school(p.institution_id,p.school_id);
 if d.status<>'pending' then raise exception 'Documento não está pendente' using errcode='23514'; end if;
 select * into object_record from storage.objects where bucket_id=d.bucket_id and name=d.object_path;
 if not found then raise exception 'Upload não encontrado no Storage' using errcode='23514'; end if;
 select * into strict requirement from public.document_requirements where id=d.requirement_id;
 if coalesce(object_record.metadata->>'size','') !~ '^[0-9]+$' then raise exception 'Tamanho do objeto não verificado' using errcode='23514'; end if;
 if (object_record.metadata->>'size')::bigint<>d.size_bytes or object_record.metadata->>'mimetype' is distinct from d.mime_type or d.size_bytes>requirement.max_bytes or (requirement.image_only and d.mime_type not in ('image/png','image/jpeg')) then raise exception 'Metadados do upload não correspondem ao documento' using errcode='23514'; end if;
 if exists(select 1 from public.registration_athletes ra join public.registrations r on r.id=ra.registration_id where ra.participation_id=p.id and r.status in ('submitted','approved')) then raise exception 'Cadastro enviado não pode trocar documentos' using errcode='23514'; end if;
 update public.participant_documents set status='uploaded',uploaded_at=now() where id=d.id;
end $$;

-- Trilha administrativa automática. Apenas o dono administrativo pode inserir logs.
create function siep_private.audit_changes() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare before_row jsonb; after_row jsonb; context_row jsonb; tenant uuid;
begin
 if tg_op<>'INSERT' then before_row:=to_jsonb(old); end if;
 if tg_op<>'DELETE' then after_row:=to_jsonb(new); end if;
 context_row:=coalesce(after_row,before_row);
 tenant:=case when tg_table_name='institutions' then (context_row->>'id')::uuid else (context_row->>'institution_id')::uuid end;
 insert into public.audit_log(institution_id,actor_user_id,entity_type,entity_id,action,before_data,after_data) values(tenant,auth.uid(),tg_table_name,(context_row->>'id')::uuid,tg_op,before_row,after_row);
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create function siep_private.immutable_tenant() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin
 if new.id is distinct from old.id or (to_jsonb(new)->>'institution_id') is distinct from (to_jsonb(old)->>'institution_id') then raise exception 'Identificador e instituição são imutáveis' using errcode='23514'; end if;
 return new;
end $$;
do $$ declare t text; begin
 foreach t in array array['institutions','institution_memberships','schools','people','school_people','events','event_modalities','event_categories','event_proofs','event_rules','event_fields','document_requirements','event_staff_roles','event_participations','participation_categories','participant_documents','registrations','registration_athletes','registration_staff','athlete_transfer_requests'] loop
  execute format('create trigger immutable_tenant before update on public.%I for each row execute function siep_private.immutable_tenant()',t);
  execute format('create trigger audit_changes after insert or update or delete on public.%I for each row execute function siep_private.audit_changes()',t);
 end loop;
end $$;

-- Mudança dos campos do evento também incrementa a versão de configuração.
create function siep_private.event_version() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if (new.name,new.edition,new.status,new.registration_start,new.registration_end,new.correction_deadline,new.settings) is distinct from (old.name,old.edition,old.status,old.registration_start,old.registration_end,old.correction_deadline,old.settings) then new.configuration_version:=old.configuration_version+1; end if;
 new.updated_at:=now(); return new;
end $$;
create trigger event_version before update on public.events for each row execute function siep_private.event_version();

-- Transferência aprovada não reescreve inscrições antigas nem muda edição em curso.
create function public.siep_request_transfer(p_institution_id uuid,p_person_id uuid,p_source_school_id uuid,p_target_school_id uuid,p_reason text) returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare transfer_uuid uuid;
begin
 perform siep_private.require_school(p_institution_id,p_target_school_id);
 if not exists(select 1 from public.school_people where institution_id=p_institution_id and school_id=p_source_school_id and person_id=p_person_id and role='athlete' and status='approved') then raise exception 'Vínculo de origem indisponível' using errcode='23514'; end if;
 insert into public.athlete_transfer_requests(institution_id,person_id,source_school_id,target_school_id,request_reason,requested_by) values(p_institution_id,p_person_id,p_source_school_id,p_target_school_id,p_reason,auth.uid()) returning id into transfer_uuid;
 return transfer_uuid;
end $$;
create function public.siep_decide_transfer(p_transfer_id uuid,p_status text,p_reason text) returns void
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
  insert into public.school_people(institution_id,school_id,person_id,role,status) values(t.institution_id,t.target_school_id,t.person_id,'athlete','approved') on conflict(institution_id,school_id,person_id,role) do update set status='approved';
 end if;
 update public.athlete_transfer_requests set status=p_status,decision_reason=p_reason,decided_by=auth.uid(),decided_at=now() where id=t.id;
end $$;

create function public.siep_mark_notification_read(p_notification_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog as $$
begin
 update public.notifications set read_at=coalesce(read_at,now()) where id=p_notification_id and recipient_user_id=auth.uid() and siep_private.in_tenant(institution_id);
 if not found then raise exception 'Notificação indisponível' using errcode='42501'; end if;
end $$;

-- Duplicação apenas da configuração, com novos IDs e referências remapeadas.
create function public.siep_duplicate_event(p_source_event_id uuid,p_name text,p_edition text,p_registration_start timestamptz default null,p_registration_end timestamptz default null) returns uuid
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
 insert into public.document_requirements(institution_id,event_id,name,required,image_only,max_bytes,category_id) select institution_id,target,name,required,image_only,max_bytes,(categories->>category_id::text)::uuid from public.document_requirements where event_id=source.id;
 insert into public.event_staff_roles(institution_id,event_id,name,enabled) select institution_id,target,name,enabled from public.event_staff_roles where event_id=source.id;
 return target;
end $$;

-- Revoga novamente os padrões após criar funções adicionais.
revoke all on all functions in schema siep_private from public,anon,authenticated;
grant execute on function siep_private.is_staff(uuid,boolean),siep_private.can_school(uuid,uuid),siep_private.in_tenant(uuid),siep_private.can_person(uuid,uuid),siep_private.can_participation(uuid),siep_private.document_access(text,boolean) to authenticated;
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'siep\_%' escape '\' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;
