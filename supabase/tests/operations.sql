-- Contratos de autocadastro, documentos, transferência e serviços internos.
do $$
declare tenant uuid:=gen_random_uuid(); admin_user uuid:=gen_random_uuid(); applicant uuid:=gen_random_uuid(); attacker uuid:=gen_random_uuid(); school_user uuid:=gen_random_uuid();
 school uuid:=gen_random_uuid(); target_school uuid:=gen_random_uuid(); ev uuid:=gen_random_uuid(); modality uuid:=gen_random_uuid(); cat uuid:=gen_random_uuid();
 athlete uuid; responsible uuid; participation uuid; requirement uuid:=gen_random_uuid(); link uuid; transfer uuid; result jsonb; document uuid; object_path text; claim siep_private.notification_outbox; notification_uuid uuid;
 identity_data jsonb:='{"full_name":"Responsável","birth_date":"1990-01-01","cpf":"52998224725","gender":"Feminino"}';
begin
 begin
  insert into auth.users(id) values(admin_user),(applicant),(attacker),(school_user);
  insert into public.institutions(id,name,slug) values(tenant,'Operações','ops-'||tenant);
  insert into public.institution_memberships(institution_id,user_id,role,status) values(tenant,admin_user,'admin','approved');
  insert into public.schools(id,institution_id,name) values(school,tenant,'Origem'),(target_school,tenant,'Destino');
  insert into public.events(id,institution_id,name,status) values(ev,tenant,'Edição','open');
  insert into public.event_modalities(id,institution_id,event_id,name,classification) values(modality,tenant,ev,'Atletismo','individual');
  insert into public.event_categories(id,institution_id,event_id,modality_id,name,participation,birth_year_start,birth_year_end) values(cat,tenant,ev,modality,'Faixa','individual',2011,2014);
  insert into public.document_requirements(id,institution_id,event_id,name,image_only,required,max_bytes) values(requirement,tenant,ev,'Foto',true,true,100);

  perform set_config('request.jwt.claim.sub',admin_user::text,true);
  execute 'set local role authenticated';
  responsible:=public.siep_save_person(tenant,school,'responsible',identity_data);
  begin update public.institution_memberships set role='manager' where institution_id=tenant and user_id=admin_user; raise exception 'Último admin removido'; exception when check_violation then null; end;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',applicant::text,true);
  execute 'set local role authenticated';
  if (select count(*) from public.siep_school_directory('ops-'||tenant))<>2 then raise exception 'Diretório de escolas falhou'; end if;
  begin perform public.siep_request_school_link(school,'{"cpf":"52998224725"}'); raise exception 'Solicitação sem dados fixos aceita'; exception when check_violation then null; end;
  link:=public.siep_request_school_link(school,identity_data);
  if exists(select 1 from public.people where id=responsible) then raise exception 'Pendente acessou pessoa existente pelo CPF'; end if;
  if not exists(select 1 from public.school_link_requests where school_person_id=link and user_id=applicant and requested_identity=identity_data) then raise exception 'Dados da solicitação não preservados'; end if;
  begin perform public.siep_decide_school_link(link,'approved','Autoaprovar'); raise exception 'Autoaprovação permitida'; exception when insufficient_privilege then null; end;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',attacker::text,true);
  execute 'set local role authenticated';
  if exists(select 1 from public.school_link_requests where school_person_id=link) then raise exception 'Solicitação exposta a outra conta'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',admin_user::text,true);
  execute 'set local role authenticated';
  perform public.siep_decide_school_link(link,'approved','Identidade e vínculo conferidos');
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',applicant::text,true);
  execute 'set local role authenticated';
  if not exists(select 1 from public.people where id=responsible) then raise exception 'Aprovado sem acesso à sua escola'; end if;
  athlete:=public.siep_save_person(tenant,school,'athlete','{"full_name":"Atleta","birth_date":"2012-01-01","cpf":"11144477735","gender":"Feminino"}');
  perform public.siep_link_person(tenant,school,athlete,'staff');
  perform public.siep_save_person(tenant,school,'staff','{"full_name":"Atleta","birth_date":"2012-01-01","cpf":"11144477735","gender":"Feminino","position":"Técnico","professional_registration":"Informativo"}',athlete);
  if not exists(select 1 from public.school_people where person_id=athlete and role='staff' and position='Técnico' and professional_registration='Informativo') then raise exception 'Perfil profissional não salvo'; end if;
  if (select count(*) from public.people where id=athlete)<>1 or (select count(*) from public.school_people where school_id=school and person_id=athlete and status='approved')<>2 then raise exception 'Papéis duplicaram identidade'; end if;
  perform public.siep_set_active_event(school,ev);
  if not exists(select 1 from public.school_event_contexts where school_id=school and event_id=ev) then raise exception 'Evento ativo não persistido'; end if;
  result:=public.siep_save_participation(ev,school,athlete,array[cat],'{}',false);
  participation:=(result->>'id')::uuid;
  begin perform public.siep_save_participation(ev,school,athlete,array[cat],'{}',true); raise exception 'Concluiu sem documento'; exception when check_violation then null; end;
  result:=public.siep_prepare_document(participation,requirement,'foto.png','image/png',20);
  document:=(result->>'id')::uuid; object_path:=result->>'path';
  if not siep_private.document_access(object_path,true) then raise exception 'Upload autorizado negado'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',attacker::text,true);
  execute 'set local role authenticated';
  if siep_private.document_access(object_path) then raise exception 'Storage vazou documento'; end if;
  begin insert into storage.objects(bucket_id,name,owner_id,metadata) values('siep-documents',object_path,attacker::text,'{"size":20,"mimetype":"image/png"}'); raise exception 'Outro usuário fez upload'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',applicant::text,true);
  execute 'set local role authenticated';
  insert into storage.objects(bucket_id,name,owner_id,metadata) values('siep-documents',object_path,applicant::text,'{"size":21,"mimetype":"image/png"}');
  begin perform public.siep_finalize_document(document); raise exception 'Finalizou tamanho divergente'; exception when check_violation then null; end;
  begin update storage.objects set metadata='{"size":20,"mimetype":"image/png"}' where name=object_path; if found then raise exception 'Objeto foi sobrescrito'; end if; exception when insufficient_privilege then null; end;
  execute 'reset role';
  update storage.objects set metadata='{"size":20,"mimetype":"image/png"}' where bucket_id='siep-documents' and name=object_path;
  execute 'set local role authenticated';
  perform public.siep_finalize_document(document);
  result:=public.siep_save_participation(ev,school,athlete,array[cat],'{}',true);
  if (select count(*) from public.siep_eligible_athletes(ev,school,cat))<>1 then raise exception 'Atleta elegível ausente'; end if;
  result:=public.siep_preview_registration(ev,school,cat,null,jsonb_build_array(jsonb_build_object('participation_id',participation,'slot_number',1)),'[]');
  if result->'issues'<>'[]'::jsonb or exists(select 1 from public.registrations where event_id=ev) then raise exception 'Prévia gravou inscrição ou validou incorretamente'; end if;
  execute 'reset role';

  -- Mapeamento legado rejeita alvo inexistente e aceita pessoa da mesma instituição.
  insert into public.legacy_id_mappings(institution_id,source_namespace,entity_type,legacy_id,target_id) values(tenant,'test-browser','people','old-1',athlete);
  begin insert into public.legacy_id_mappings(institution_id,source_namespace,entity_type,legacy_id,target_id) values(tenant,'test-browser','people','old-2',gen_random_uuid()); raise exception 'Alvo legado inexistente aceito'; exception when foreign_key_violation then null; end;
  -- Secretaria solicita e decide transferência; edição em curso bloqueia aprovação.
  perform set_config('request.jwt.claim.sub',admin_user::text,true);
  execute 'set local role authenticated';
  transfer:=public.siep_request_transfer(tenant,athlete,school,target_school,'Mudança de escola');
  begin perform public.siep_decide_transfer(transfer,'approved','Conferido'); raise exception 'Transferiu com edição em curso'; exception when check_violation then null; end;
  perform public.siep_archive_participation(participation,true);
  update public.events set status='closed' where id=ev;
  perform public.siep_decide_transfer(transfer,'approved','Conferido após encerramento');
  if not exists(select 1 from public.school_people where school_id=target_school and person_id=athlete and role='athlete' and status='approved') then raise exception 'Transferência não criou destino'; end if;
  if not exists(select 1 from public.event_participations where id=participation and school_id=school) then raise exception 'Transferência alterou histórico'; end if;
  execute 'reset role';

  -- Serviço interno tem reserva com token; usuários do portal não podem executá-lo.
  insert into public.notifications(institution_id,recipient_user_id,kind,deduplication_key) values(tenant,applicant,'test','test') returning id into notification_uuid;
  insert into siep_private.notification_outbox(notification_id,available_at) values(notification_uuid,date '1900-01-01');
  execute 'set local role authenticated';
  begin perform siep_private.claim_notifications(1); raise exception 'Portal acessou worker'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  select * into claim from siep_private.claim_notifications(1) where notification_id=notification_uuid;
  if claim.claim_token is null or claim.status<>'processing' then raise exception 'Reserva da outbox falhou'; end if;
  begin perform siep_private.finish_notification(claim.id,gen_random_uuid()); raise exception 'Worker concluiu sem token'; exception when serialization_failure then null; end;
  perform siep_private.finish_notification(claim.id,claim.claim_token);
  if not exists(select 1 from siep_private.notification_outbox where id=claim.id and status='sent') then raise exception 'Worker não concluiu envio'; end if;
  raise exception using errcode='Z0001',message='rollback operations fixtures';
 exception when sqlstate 'Z0001' then null; end;
end $$;
