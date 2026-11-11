-- Integração real PostgreSQL, inclusive SET ROLE/RLS; nenhum fixture persiste.
do $$
declare
 tenant uuid:=gen_random_uuid(); other_tenant uuid:=gen_random_uuid();
 admin_user uuid:=gen_random_uuid(); school_user uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); pending_user uuid:=gen_random_uuid();
 school uuid:=gen_random_uuid(); other_school uuid:=gen_random_uuid(); second_school uuid:=gen_random_uuid();
 ev uuid:=gen_random_uuid(); ev_other uuid:=gen_random_uuid(); sport uuid:=gen_random_uuid(); collective uuid:=gen_random_uuid(); badminton uuid:=gen_random_uuid();
 cat uuid:=gen_random_uuid(); team_cat uuid:=gen_random_uuid(); bad_cat uuid:=gen_random_uuid();
 proof uuid:=gen_random_uuid(); jump uuid:=gen_random_uuid(); relay uuid:=gen_random_uuid();
 person uuid:=gen_random_uuid(); person2 uuid:=gen_random_uuid(); person3 uuid:=gen_random_uuid(); part uuid:=gen_random_uuid(); part2 uuid:=gen_random_uuid();
 staff_role uuid:=gen_random_uuid(); requirement uuid:=gen_random_uuid(); link uuid:=gen_random_uuid();
 result jsonb; saved jsonb; saved2 jsonb; saved3 jsonb; team_saved jsonb; bad_saved jsonb; issues jsonb;
 registration uuid; registration2 uuid; doc uuid; doc_path text; cloned uuid; rule_uuid uuid; n integer; v integer; item text;
begin
 begin
  insert into auth.users(id) values(admin_user),(school_user),(outsider),(pending_user);
  insert into public.institutions(id,name,slug) values(tenant,'Teste workflow','wf-'||tenant),(other_tenant,'Outro cliente','wf-'||other_tenant);
  insert into public.institution_memberships(institution_id,user_id,role,status) values(tenant,admin_user,'admin','approved');
  insert into public.schools(id,institution_id,name) values(school,tenant,'Escola A'),(second_school,tenant,'Escola A2'),(other_school,other_tenant,'Escola B');
  insert into public.people(id,institution_id,full_name,birth_date,cpf,gender) values(person,tenant,'Atleta','2012-06-01','52998224725','Feminino'),(person2,tenant,'Outra atleta','2013-06-01','11144477735','Feminino');
  insert into public.school_people(institution_id,school_id,person_id,role,status,user_id) values(tenant,school,person,'responsible','approved',school_user),(tenant,school,person2,'responsible','pending',pending_user),(tenant,school,person,'athlete','approved',null),(tenant,school,person2,'athlete','approved',null),(tenant,school,person2,'staff','approved',null);
  insert into public.people(id,institution_id,full_name,birth_date,cpf,gender) values(person3,tenant,'Profissional de outra escola','1990-01-01','12345678909','Feminino');
  insert into public.school_people(institution_id,school_id,person_id,role,status,position) values(tenant,second_school,person3,'staff','approved','Técnico');
  update public.school_people set position='Técnico' where institution_id=tenant and person_id=person2 and role='staff';
  insert into public.events(id,institution_id,name,status) values(ev,tenant,'Edição','open'),(ev_other,other_tenant,'Outra edição','open');
  insert into public.event_modalities(id,institution_id,event_id,name,classification) values(sport,tenant,ev,'Atletismo','individual'),(collective,tenant,ev,'Futsal','collective'),(badminton,tenant,ev,'Badminton','individual');
  insert into public.event_categories(id,institution_id,event_id,modality_id,name,participation,birth_year_start,birth_year_end,gender) values(cat,tenant,ev,sport,'12 a 14','individual',2011,2014,'Feminino'),(team_cat,tenant,ev,collective,'Equipe','team',2011,2014,'Feminino'),(bad_cat,tenant,ev,badminton,'Individual','individual',2011,2014,'Feminino');
  insert into public.event_proofs(id,institution_id,event_id,category_id,name,kind,slots_per_school,min_athletes) values(proof,tenant,ev,cat,'100 m','individual',3,1),(jump,tenant,ev,cat,'Salto','individual',3,1),(relay,tenant,ev,cat,'Revezamento','relay',4,1);
  insert into public.event_staff_roles(id,institution_id,event_id,name) values(staff_role,tenant,ev,'Técnico');
  insert into public.event_participations(id,institution_id,event_id,school_id,person_id,status) values(part,tenant,ev,school,person,'complete'),(part2,tenant,ev,school,person2,'complete');
  insert into public.participation_categories(institution_id,event_id,participation_id,category_id) values(tenant,ev,part,cat),(tenant,ev,part,team_cat),(tenant,ev,part,bad_cat),(tenant,ev,part2,cat);

  -- Vínculo pendente não libera leituras nem escrita/RPC.
  perform set_config('request.jwt.claim.sub',pending_user::text,true);
  execute 'set local role authenticated';
  if (select count(*) from public.people where institution_id=tenant)<>0 or (select count(*) from public.events where institution_id=tenant)<>0 then raise exception 'Vínculo pendente liberou dados'; end if;
  begin
   perform public.siep_save_registration(ev,school,cat,proof,'[]','[]');
   raise exception 'Pendente criou inscrição';
  exception when insufficient_privilege then null; end;
  execute 'reset role';

  -- Outro cliente não lê dados de A, mesmo conhecendo UUIDs.
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  execute 'set local role authenticated';
  if exists(select 1 from public.people where id=person) or exists(select 1 from public.registrations where event_id=ev) then raise exception 'RLS vazou dados'; end if;
  begin perform public.siep_registration_issues(gen_random_uuid()); exception when no_data_found then null; end;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',school_user::text,true);
  execute 'set local role authenticated';
  if (select count(*) from public.people where institution_id=tenant)<>2 then raise exception 'Responsável não acessou sua escola'; end if;
  if exists(select 1 from public.schools where id=second_school) then raise exception 'Responsável acessou outra escola'; end if;
  begin update public.school_people set status='approved' where user_id=pending_user; raise exception 'Autoaprovação permitida'; exception when insufficient_privilege then null; end;
  begin insert into public.registrations(institution_id,event_id,school_id,category_id) values(tenant,ev,school,cat); raise exception 'Escrita direta permitida'; exception when insufficient_privilege then null; end;
  begin
   perform public.siep_save_registration(ev,school,cat,jump,'[]',jsonb_build_array(jsonb_build_object('person_id',person3,'staff_role_id',staff_role)));
   raise exception 'Profissional de outra escola entrou no rascunho/snapshot';
  exception when check_violation then null; end;
  saved:=public.siep_save_registration(ev,school,cat,proof,jsonb_build_array(jsonb_build_object('participation_id',part,'slot_number',1)),'[]');
  registration:=(saved->>'id')::uuid;
  if saved->'issues'<>'[]'::jsonb then raise exception 'Inscrição válida recebeu pendências: %',saved; end if;
  begin
   perform public.siep_save_registration(ev,school,cat,proof,'[]','[]',registration,999);
   raise exception 'Revisão antiga foi aceita';
  exception when serialization_failure then null; end;
  begin
   perform public.siep_save_registration(ev,school,cat,proof,jsonb_build_array(jsonb_build_object('participation_id',part,'slot_number',2)),'[]');
   raise exception 'Atleta repetido na prova';
  exception when unique_violation then null; end;
  begin
   perform public.siep_save_registration(ev,school,cat,proof,jsonb_build_array(jsonb_build_object('participation_id',part2,'slot_number',1)),'[]');
   raise exception 'Vaga repetida na prova';
  exception when unique_violation then null; end;
  begin
   perform public.siep_save_registration(ev,school,cat,proof,jsonb_build_array(jsonb_build_object('participation_id',part2,'slot_number',4)),'[]');
   raise exception 'Vaga acima da capacidade';
  exception when check_violation then null; end;
  begin
   perform public.siep_save_registration(ev,second_school,cat,proof,'[]','[]');
   raise exception 'Gravação em outra escola';
  exception when insufficient_privilege then null; end;
  execute 'reset role';

  -- Oito tipos de regra: zero bloqueia, null não limita; rascunhos contam.
  insert into public.event_rules(institution_id,event_id,kind,parameters) values(tenant,ev,'modalities','{"total":0}') returning id into rule_uuid;
  if not siep_private.registration_issues(registration) ? ('rule:'||rule_uuid||':'||person||':total') then raise exception 'Regra modalities não aplicada'; end if;
  update public.event_rules set parameters='{"total":null}' where id=rule_uuid;
  if siep_private.registration_issues(registration)<>'[]'::jsonb then raise exception 'Null limitou modalidade'; end if;
  update public.event_rules set enabled=false where id=rule_uuid;
  insert into public.event_rules(institution_id,event_id,kind,parameters) values(tenant,ev,'athleteCategories','{"max":0}') returning id into rule_uuid;
  if not siep_private.registration_issues(registration) ? ('rule:'||rule_uuid||':'||person) then raise exception 'Regra athleteCategories não aplicada'; end if;
  update public.event_rules set enabled=false where id=rule_uuid;
  insert into public.event_rules(institution_id,event_id,kind,category_id,parameters) values(tenant,ev,'proofs',cat,'{"individual":0,"relay":1}') returning id into rule_uuid;
  if not siep_private.registration_issues(registration) ? ('rule:'||rule_uuid||':'||person||':individual') then raise exception 'Regra proofs não aplicada'; end if;
  update public.event_rules set enabled=false where id=rule_uuid;
  insert into public.event_rules(institution_id,event_id,kind,category_id,proof_id,parameters) values(tenant,ev,'proofEntries',cat,proof,'{"max":0}') returning id into rule_uuid;
  if not siep_private.registration_issues(registration) ? ('rule:'||rule_uuid||':'||person) then raise exception 'Regra proofEntries não aplicada'; end if;
  update public.event_rules set enabled=false where id=rule_uuid;
  foreach item in array array['roster','staffLimits','schoolEntries','age'] loop
   insert into public.event_rules(institution_id,event_id,kind,category_id,parameters) values(tenant,ev,item,cat,case item when 'roster' then '{"max":0}'::jsonb when 'staffLimits' then '{"min":1}'::jsonb when 'schoolEntries' then '{"max":0}'::jsonb else '{"min":20,"referenceDate":"2026-01-01"}'::jsonb end) returning id into rule_uuid;
   issues:=siep_private.registration_issues(registration);
   if not exists(select 1 from jsonb_array_elements_text(issues) x where x like 'rule:'||rule_uuid||'%') then raise exception 'Regra % não aplicada: %',item,issues; end if;
   update public.event_rules set enabled=false where id=rule_uuid;
  end loop;
  begin insert into public.event_rules(institution_id,event_id,kind,parameters) values(tenant,ev,'modalities','{"total":-1}'); raise exception 'Regra negativa aceita'; exception when check_violation then null; end;
  begin insert into public.event_rules(institution_id,event_id,kind,parameters) values(tenant,ev,'modalities','{"typo":2}'); raise exception 'Parâmetro desconhecido aceito'; exception when check_violation then null; end;
  begin insert into public.event_rules(institution_id,event_id,kind,category_id,parameters) values(tenant,ev,'age',cat,'{"min":10}'); raise exception 'Idade sem referência aceita'; exception when check_violation then null; end;

  -- Exemplo aprovado: duas provas individuais + revezamento + futsal.
  insert into public.event_rules(institution_id,event_id,kind,parameters) values(tenant,ev,'modalities','{"total":2,"individual":1,"collective":1}');
  insert into public.event_rules(institution_id,event_id,kind,category_id,parameters) values(tenant,ev,'proofs',cat,'{"individual":2,"relay":1}');
  execute 'set local role authenticated';
  saved2:=public.siep_save_registration(ev,school,cat,jump,jsonb_build_array(jsonb_build_object('participation_id',part,'slot_number',1)),jsonb_build_array(jsonb_build_object('person_id',person2,'staff_role_id',staff_role)));
  if saved2->'issues'<>'[]'::jsonb then raise exception 'Comissão válida recusada: %',saved2; end if;
  saved3:=public.siep_save_registration(ev,school,cat,relay,jsonb_build_array(jsonb_build_object('participation_id',part,'slot_number',1)),'[]');
  team_saved:=public.siep_save_registration(ev,school,team_cat,null,jsonb_build_array(jsonb_build_object('participation_id',part,'slot_number',1)),'[]');
  if team_saved->'issues'<>'[]'::jsonb or public.siep_registration_issues(registration)<>'[]'::jsonb then raise exception 'Exemplo válido rejeitado'; end if;
  bad_saved:=public.siep_save_registration(ev,school,bad_cat,null,jsonb_build_array(jsonb_build_object('participation_id',part,'slot_number',1)),'[]');
  if bad_saved->'issues'='[]'::jsonb then raise exception 'Segunda modalidade individual permitida'; end if;
  perform public.siep_transition_registration((bad_saved->>'id')::uuid,1,'cancelled','Cancelar teste');
  if public.siep_registration_issues(registration)<>'[]'::jsonb then raise exception 'Cancelada contou'; end if;
  execute 'reset role';

  -- Sexo, ano inclusivo, novas exigências reavaliadas no servidor.
  update public.event_proofs set gender='Masculino' where id=proof;
  if not siep_private.registration_issues(registration) ? ('gender:'||person) then raise exception 'Sexo não validado'; end if;
  update public.event_proofs set gender=null where id=proof;
  update public.event_categories set birth_year_start=2013 where id=cat;
  if not siep_private.registration_issues(registration) ? ('birth_year:'||person) then raise exception 'Ano não validado'; end if;
  update public.event_categories set birth_year_start=2011 where id=cat;
  insert into public.event_fields(institution_id,event_id,field_key,requirement) values(tenant,ev,'phone','required');
  if siep_private.participation_issues(part)='[]'::jsonb then raise exception 'Campo adicional obrigatório ignorado'; end if;
  update public.event_participations set additional_data='{"phone":"999"}' where id in (part,part2);
  insert into public.document_requirements(id,institution_id,event_id,name,required,image_only) values(requirement,tenant,ev,'Foto',true,true);
  execute 'set local role authenticated';
  begin perform public.siep_transition_registration(registration,1,'submitted','Enviar'); raise exception 'Enviou sem documento'; exception when check_violation then null; end;
  begin perform public.siep_prepare_document(part,requirement,'a.pdf','application/pdf',20); raise exception 'PDF aceito em imagem'; exception when check_violation then null; end;
  result:=public.siep_prepare_document(part,requirement,'foto.png','image/png',20);
  doc:=(result->>'id')::uuid; doc_path:=result->>'path';
  begin perform public.siep_finalize_document(doc); raise exception 'Metadado sem upload validado'; exception when check_violation then null; end;
  execute 'reset role';
  -- Fixture de metadados apenas, desfeita: não representa upload de conteúdo real.
  insert into storage.objects(bucket_id,name,owner_id,metadata) values('siep-documents',doc_path,school_user::text,'{"size":20,"mimetype":"image/png"}');
  execute 'set local role authenticated';
  perform public.siep_finalize_document(doc);
  result:=public.siep_save_participation(ev,school,person,array[cat,team_cat,bad_cat],'{"phone":"999"}',true);
  if result->>'status'<>'complete' then raise exception 'Cadastro não concluído'; end if;
  result:=public.siep_transition_registration(registration,1,'submitted','Enviar');
  if result->>'status'<>'submitted' then raise exception 'Envio falhou'; end if;
  begin perform public.siep_transition_registration(registration,2,'approved','Autoaprovar'); raise exception 'Escola aprovou inscrição'; exception when insufficient_privilege then null; end;
  begin perform public.siep_save_registration(ev,school,cat,proof,'[]','[]',registration,2); raise exception 'Editou enviada'; exception when check_violation then null; end;
  begin perform public.siep_prepare_document(part,requirement,'troca.png','image/png',20); raise exception 'Trocou documento enviado'; exception when check_violation then null; end;
  execute 'reset role';
  if not exists(select 1 from public.registration_versions where registration_id=registration and revision=2 and snapshot->'athletes'->0->'person'->>'cpf'='52998224725') then raise exception 'Snapshot enviado não preservou identidade'; end if;
  begin update public.registration_versions set status='draft' where registration_id=registration; raise exception 'Histórico alterável'; exception when check_violation then null; end;

  perform set_config('request.jwt.claim.sub',admin_user::text,true);
  execute 'set local role authenticated';
  result:=public.siep_transition_registration(registration,2,'correction_requested','Corrigir',now()+interval '1 day');
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',school_user::text,true);
  execute 'set local role authenticated';
  result:=public.siep_transition_registration(registration,3,'submitted','Corrigido');
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',admin_user::text,true);
  execute 'set local role authenticated';
  result:=public.siep_transition_registration(registration,4,'approved','Aprovado');
  cloned:=public.siep_duplicate_event(ev,'Nova edição','2027');
  if exists(select 1 from public.registrations where event_id=cloned) or exists(select 1 from public.event_participations where event_id=cloned) then raise exception 'Duplicação copiou pessoas/inscrições'; end if;
  if not exists(select 1 from public.events where id=cloned and status='draft' and registration_start is null and registration_end is null) then raise exception 'Duplicação não zerou datas/situação'; end if;
  if (select count(*) from public.event_proofs where event_id=cloned)<>3 then raise exception 'Duplicação perdeu provas'; end if;
  execute 'reset role';
  if (select count(*) from public.registration_decisions where registration_id=registration)<>4 then raise exception 'Histórico de decisões incompleto'; end if;
  if not exists(select 1 from public.notifications where payload->>'registration_id'=registration::text) then raise exception 'Notificação não persistida'; end if;

  -- Anon não tem acesso às RPCs nem às identidades.
  execute 'set local role anon';
  begin perform count(*) from public.people; raise exception 'Anon leu dados'; exception when insufficient_privilege then null; end;
  begin perform public.siep_registration_issues(registration); raise exception 'Anon executou RPC'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  raise exception using errcode='Z0001',message='rollback workflow fixtures';
 exception when sqlstate 'Z0001' then null; end;
end $$;
