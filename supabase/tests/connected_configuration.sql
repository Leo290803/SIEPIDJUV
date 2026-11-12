do $$
declare tenant uuid:=gen_random_uuid(); other_tenant uuid:=gen_random_uuid(); admin_uuid uuid:=gen_random_uuid(); other_user uuid:=gen_random_uuid(); ev uuid:=gen_random_uuid(); sport uuid:=gen_random_uuid(); cat uuid:=gen_random_uuid(); proof uuid:=gen_random_uuid(); req uuid:=gen_random_uuid(); copy_uuid uuid; version_number bigint; initial_version bigint; assigned uuid:=gen_random_uuid();
begin
 begin
  insert into auth.users(id) values(admin_uuid),(other_user);
  insert into public.institutions(id,name,slug) values(tenant,'Teste conectado','connected-'||tenant),(other_tenant,'Outro','connected-'||other_tenant);
  insert into public.institution_memberships(institution_id,user_id,role,status) values(tenant,admin_uuid,'admin','approved');
  insert into public.events(id,institution_id,name) values(ev,tenant,'Evento');
  perform set_config('request.jwt.claim.sub',admin_uuid::text,true);
  execute 'set local role authenticated';
  version_number:=public.siep_save_event_configuration(ev,1,'sports',jsonb_build_object('modalities',jsonb_build_array(jsonb_build_object('id',sport,'name','Atletismo','classification','individual','enabled',true)),'categories',jsonb_build_array(jsonb_build_object('id',cat,'modality_id',sport,'name','Faixa','participation','individual','birth_year_start',2011,'birth_year_end',2014,'min_athletes',1,'max_athletes',1,'enabled',true)),'proofs',jsonb_build_array(jsonb_build_object('id',proof,'category_id',cat,'name','100 m','kind','individual','slots_per_school',3,'min_athletes',1,'enabled',true))));
  if not exists(select 1 from public.event_proofs where id=proof and slots_per_school=3) then raise exception 'Configuração não persistiu'; end if;
  begin perform public.siep_save_event_configuration(ev,1,'functions','{"roles":[]}'); raise exception 'Versão antiga aceita'; exception when serialization_failure then null; end;
  initial_version:=version_number;
  begin
   perform public.siep_save_event_configuration(ev,version_number,'rules','{"rules":[{"id":"11111111-1111-4111-8111-111111111111","kind":"modalities","enabled":true,"parameters":{"total":2}},{"id":"22222222-2222-4222-8222-222222222222","kind":"modalities","enabled":true,"parameters":{"total":-1}}]}');
   raise exception 'Configuração inválida aceita';
  exception when check_violation then null; end;
  if exists(select 1 from public.event_rules where event_id=ev) or (select configuration_version from public.events where id=ev)<>initial_version then raise exception 'Salvamento parcial ocorreu'; end if;
  version_number:=public.siep_save_event_configuration(ev,version_number,'requirements',jsonb_build_object('fields','[]'::jsonb,'documents',jsonb_build_array(jsonb_build_object('id',req,'name','Foto','required',true,'image_only',true,'max_bytes',5242880,'enabled',true))));
  version_number:=public.siep_save_event_configuration(ev,version_number,'requirements','{"fields":[],"documents":[]}');
  if not exists(select 1 from public.document_requirements where id=req and not enabled) then raise exception 'Exigência antiga não preservada'; end if;
  copy_uuid:=public.siep_duplicate_event(ev,'Cópia','2027');
  if not exists(select 1 from public.document_requirements where event_id=copy_uuid and not enabled) then raise exception 'Duplicação reativou documento não solicitado'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',other_user::text,true);
  execute 'set local role authenticated';
  begin perform public.siep_save_event_configuration(ev,version_number,'functions','{"roles":[]}'); raise exception 'Outra conta editou configuração'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  -- E-mail reservado não libera acesso enquanto não for confirmado pelo Auth.
  insert into siep_private.bootstrap_administrators(institution_id,email) values(other_tenant,'bootstrap-test@example.invalid');
  insert into auth.users(id,email) values(assigned,'bootstrap-test@example.invalid');
  if exists(select 1 from public.institution_memberships where user_id=assigned) then raise exception 'Conta não confirmada ganhou acesso'; end if;
  update auth.users set email_confirmed_at=now() where id=assigned;
  if not exists(select 1 from public.institution_memberships where user_id=assigned and institution_id=other_tenant and role='admin' and status='approved') then raise exception 'Primeiro admin confirmado não foi provisionado'; end if;
  if not exists(select 1 from siep_private.bootstrap_administrators where institution_id=other_tenant and assigned_user_id=assigned) then raise exception 'Reserva não foi consumida'; end if;
  raise exception using errcode='Z0001',message='rollback connected fixtures';
 exception when sqlstate 'Z0001' then null; end;
end $$;
