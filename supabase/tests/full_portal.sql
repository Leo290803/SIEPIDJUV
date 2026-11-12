-- CRUD dos componentes conectados, reuso de identidade e revezamento real.
do $$
declare tenant uuid:=gen_random_uuid(); school uuid:=gen_random_uuid(); admin_user uuid:=gen_random_uuid(); denied_user uuid:=gen_random_uuid(); event_uuid uuid:=gen_random_uuid(); modality uuid:=gen_random_uuid(); category uuid:=gen_random_uuid(); proof uuid:=gen_random_uuid(); role_uuid uuid:=gen_random_uuid(); athlete_uuid uuid:=gen_random_uuid(); payload jsonb; result jsonb; first_result jsonb; staff_result jsonb; registration jsonb; allocations jsonb:='[]'; participation jsonb; person_uuid uuid; cpf text; i integer;
begin
 begin
  insert into auth.users(id) values(admin_user),(denied_user);
  insert into public.institutions(id,name,slug) values(tenant,'Portal completo','portal-'||tenant);
  insert into public.institution_memberships(institution_id,user_id,role,status) values(tenant,admin_user,'admin','approved');
  insert into public.schools(id,institution_id,name) values(school,tenant,'Escola de teste');
  insert into public.events(id,institution_id,name,status) values(event_uuid,tenant,'Edição','open');
  insert into public.event_modalities(id,institution_id,event_id,name,classification) values(modality,tenant,event_uuid,'Atletismo','individual');
  insert into public.event_categories(id,institution_id,event_id,modality_id,name,participation,min_athletes,max_athletes) values(category,tenant,event_uuid,modality,'Faixa','individual',1,1);
  insert into public.event_proofs(id,institution_id,event_id,category_id,name,kind,slots_per_school,min_athletes) values(proof,tenant,event_uuid,category,'4 x 100 m','relay',4,4);
  insert into public.event_staff_roles(id,institution_id,event_id,name) values(role_uuid,tenant,event_uuid,'Técnico');
  perform set_config('request.jwt.claim.sub',denied_user::text,true);
  execute 'set local role authenticated';
  begin perform public.siep_save_connected_person(tenant,school,'athlete','{}');raise exception 'Conta sem vínculo cadastrou pessoa';exception when insufficient_privilege then null;end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',admin_user::text,true);
  execute 'set local role authenticated';
  payload:='{"full_name":"Pessoa de teste","birth_date":"2012-01-01","cpf":"52998224725","gender":"Feminino","contact":{"email":"","phone":"","address":""}}';
  first_result:=public.siep_save_connected_person(tenant,school,'athlete',payload,null,athlete_uuid);
  if (first_result->>'person_id')::uuid<>athlete_uuid then raise exception 'ID de criação não preservado';end if;
  result:=public.siep_save_connected_person(tenant,school,'athlete',payload,null,athlete_uuid);
  if (result->>'person_id')::uuid<>athlete_uuid or (select count(*) from public.people where institution_id=tenant)<>1 then raise exception 'Retry duplicou pessoa';end if;
  staff_result:=public.siep_save_connected_person(tenant,school,'staff',payload||'{"position":"Técnico"}',null,gen_random_uuid());
  if staff_result->>'person_id'<>first_result->>'person_id' or (select count(*) from public.people where institution_id=tenant)<>1 then raise exception 'Novo papel duplicou identidade';end if;
  result:=public.siep_save_connected_person(tenant,school,'athlete',payload||'{"archived":true}',(first_result->>'link_id')::uuid,null,(result->>'version')::bigint);
  if not exists(select 1 from public.school_people where id=(result->>'link_id')::uuid and archived) or not exists(select 1 from public.school_people where id=(staff_result->>'link_id')::uuid and not archived) or exists(select 1 from public.people where id=athlete_uuid and archived) then raise exception 'Arquivo de atleta atingiu outro papel/identidade';end if;
  begin perform public.siep_save_connected_person(tenant,school,'athlete',payload,(first_result->>'link_id')::uuid,null,1);raise exception 'Versão antiga aceita';exception when serialization_failure then null;end;
  result:=public.siep_save_connected_person(tenant,school,'athlete',payload,(result->>'link_id')::uuid,null,(result->>'version')::bigint,event_uuid,array[category],'{}');
  participation:=public.siep_save_participation(event_uuid,school,athlete_uuid,array[category],'{}',true);
  allocations:=allocations||jsonb_build_array(jsonb_build_object('participation_id',participation->>'id','slot_number',1));
  for i in 2..4 loop
   cpf:=(array['52998224725','11144477735','12345678909','39053344705'])[i];
   result:=public.siep_save_connected_person(tenant,school,'athlete',jsonb_build_object('full_name','Atleta de teste '||i,'birth_date','2012-01-01','cpf',cpf,'gender','Feminino'),null,gen_random_uuid(),null,event_uuid,array[category],'{}');
   participation:=public.siep_save_participation(event_uuid,school,(result->>'person_id')::uuid,array[category],'{}',true);
   allocations:=allocations||jsonb_build_array(jsonb_build_object('participation_id',participation->>'id','slot_number',i));
  end loop;
  registration:=public.siep_save_registration(event_uuid,school,category,proof,allocations,jsonb_build_array(jsonb_build_object('person_id',athlete_uuid,'staff_role_id',role_uuid)));
  if registration->'issues'<>'[]'::jsonb then raise exception 'Revezamento de quatro atletas recusado: %',registration;end if;
  perform public.siep_transition_registration((registration->>'id')::uuid,1,'submitted','Enviar revezamento');
  update public.event_categories set participation='team',max_athletes=2 where id=category;
  if not public.siep_registration_issues((registration->>'id')::uuid) ? 'category_roster' then raise exception 'Limites explícitos de equipe ignorados no revezamento';end if;
  update public.event_categories set participation='individual',max_athletes=1 where id=category;
  select version into i from public.school_people where id=(first_result->>'link_id')::uuid;
  begin perform public.siep_save_connected_person(tenant,school,'athlete',payload||'{"archived":true}',(first_result->>'link_id')::uuid,null,i);raise exception 'Arquivou perfil em inscrição enviada';exception when check_violation then null;end;
  execute 'reset role';
  raise exception using errcode='Z0001',message='rollback portal fixtures';
 exception when sqlstate 'Z0001' then null;end;
end $$;
