-- Matriz real de privilégios. JWT pode continuar válido após a revogação:
-- os vínculos do banco precisam negar o acesso imediatamente.
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();sa uuid:=gen_random_uuid();sa2 uuid:=gen_random_uuid();sb uuid:=gen_random_uuid();admin_user uuid:=gen_random_uuid();manager_user uuid:=gen_random_uuid();school_user uuid:=gen_random_uuid();pending_user uuid:=gen_random_uuid();other_user uuid:=gen_random_uuid();invited_user uuid:=gen_random_uuid();pa uuid:=gen_random_uuid();pb uuid:=gen_random_uuid();r jsonb;admin_email text:='admin-'||gen_random_uuid()||'@example.invalid'; invited_email text:='staff-'||gen_random_uuid()||'@example.invalid';
begin
 begin
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(admin_user,admin_email,now(),'{}'),(manager_user,'manager-'||gen_random_uuid()||'@example.invalid',now(),'{}'),(school_user,'school-'||gen_random_uuid()||'@example.invalid',now(),'{"role":"admin","is_admin":true}'),(pending_user,'pending-'||gen_random_uuid()||'@example.invalid',now(),'{}'),(other_user,'other-'||gen_random_uuid()||'@example.invalid',now(),'{}'),(invited_user,invited_email,now(),'{}');
  insert into public.institutions(id,name,slug) values(a,'Cliente A','permission-'||a),(b,'Cliente B','permission-'||b);
  insert into public.institution_memberships(institution_id,user_id,role,status) values(a,admin_user,'admin','approved'),(a,manager_user,'manager','approved'),(b,other_user,'manager','approved');
  insert into public.schools(id,institution_id,name) values(sa,a,'Escola A'),(sa2,a,'Escola A2'),(sb,b,'Escola B');
  insert into public.people(id,institution_id,full_name,birth_date,cpf,gender) values(pa,a,'Responsável A','1990-01-01','52998224725','Feminino'),(pb,b,'Responsável B','1990-01-01','52998224725','Feminino');
  insert into public.school_people(institution_id,school_id,person_id,role,status,user_id) values(a,sa,pa,'responsible','approved',school_user),(a,sa2,pa,'responsible','pending',pending_user),(b,sb,pb,'responsible','approved',other_user);
  perform set_config('request.jwt.claim.sub',admin_user::text,true);
  execute 'set local role authenticated';
  r:=public.siep_my_access();
  if jsonb_array_length(r)<>1 or r->0->>'staff_role'<>'admin' or r->0->'schools'<>'[]'::jsonb then raise exception 'Administrador recebeu vínculo escolar automático ou escopo incorreto';end if;
  begin perform public.siep_set_staff_account(b,invited_email,'admin','approved');raise exception 'Administrador alterou outra instituição';exception when insufficient_privilege then null;end;
  perform public.siep_set_staff_account(a,upper(invited_email),'manager','approved');
  if jsonb_array_length(public.siep_staff_accounts(a))<>3 then raise exception 'Listagem administrativa incompleta';end if;
  begin perform public.siep_set_staff_account(a,admin_email,'admin','closed');raise exception 'Último administrador removido';exception when check_violation then null;end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',manager_user::text,true);
  execute 'set local role authenticated';
  if public.siep_my_access()->0->>'staff_role'<>'manager' then raise exception 'Gestor não reconhecido';end if;
  begin perform public.siep_staff_accounts(a);raise exception 'Gestor leu gestão administrativa';exception when insufficient_privilege then null;end;
  begin perform public.siep_set_staff_account(a,admin_email,'manager','closed');raise exception 'Gestor alterou permissões';exception when insufficient_privilege then null;end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',school_user::text,true);
  execute 'set local role authenticated';
  r:=public.siep_my_access();
  if r->0->>'staff_role' is not null or jsonb_array_length(r->0->'schools')<>1 or r->0->'schools'->0->>'id'<>sa::text then raise exception 'Metadado falsificado ou escola alheia concedeu acesso';end if;
  if exists(select 1 from public.schools where id=sa2 or id=sb) then raise exception 'Responsável leu outra escola';end if;
  perform public.siep_save_connected_person(a,sa,'athlete','{"full_name":"Aluno autorizado","birth_date":"2012-01-01","cpf":"11144477735","gender":"Feminino"}');
  if not exists(select 1 from public.people where full_name='Aluno autorizado' and institution_id=a) then raise exception 'Responsável não conseguiu cadastrar na própria escola';end if;
  begin perform public.siep_save_connected_person(a,sa2,'athlete','{}');raise exception 'Responsável escreveu em outra escola';exception when insufficient_privilege then null;end;
  begin perform public.siep_set_staff_account(a,invited_email,'admin','approved');raise exception 'Responsável elevou privilégios';exception when insufficient_privilege then null;end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',pending_user::text,true);
  execute 'set local role authenticated';
  if public.siep_my_access()<>'[]'::jsonb or exists(select 1 from public.people where institution_id=a) then raise exception 'Pendente recebeu acesso';end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',invited_user::text,true);
  execute 'set local role authenticated';
  if public.siep_my_access()->0->>'staff_role'<>'manager' then raise exception 'Vínculo de gestor não foi liberado';end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',admin_user::text,true);
  execute 'set local role authenticated';
  perform public.siep_set_staff_account(a,invited_email,'manager','closed');
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',invited_user::text,true);
  execute 'set local role authenticated';
  if public.siep_my_access()<>'[]'::jsonb or exists(select 1 from public.events where institution_id=a) or exists(select 1 from public.schools where institution_id=a) then raise exception 'Revogação não retirou acesso com a mesma identidade autenticada';end if;
  execute 'reset role';
  execute 'set local role anon';
  begin perform public.siep_my_access();raise exception 'Anon consultou vínculos';exception when insufficient_privilege then null;end;
  execute 'reset role';
  raise exception using errcode='Z0001',message='rollback permission fixtures';
 exception when sqlstate 'Z0001' then null;end;
end $$;
