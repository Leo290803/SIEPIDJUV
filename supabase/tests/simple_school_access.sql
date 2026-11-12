do $$
declare tenant uuid:=gen_random_uuid();school_a uuid:=gen_random_uuid();school_b uuid:=gen_random_uuid();actor uuid:=gen_random_uuid();admin_user uuid:=gen_random_uuid();link_id uuid;other_link uuid;person_uuid uuid;person_count integer;
begin
 begin
  insert into auth.users(id,email,email_confirmed_at) values(actor,'simple-'||actor||'@example.invalid',now()),(admin_user,'simple-admin-'||admin_user||'@example.invalid',now());
  insert into public.institutions(id,name,slug) values(tenant,'Teste acesso simples','simple-'||tenant);
  insert into public.schools(id,institution_id,name) values(school_a,tenant,'Escola escolhida'),(school_b,tenant,'Outra escola');
  insert into public.institution_memberships(institution_id,user_id,role,status) values(tenant,admin_user,'admin','approved');
  perform set_config('request.jwt.claim.sub',actor::text,true);
  execute 'set local role authenticated';
  execute 'reset role';
  begin perform public.siep_request_school_access(school_a,' ');raise exception 'Nome vazio aceito';exception when check_violation then null;end;
  link_id:=public.siep_request_school_access(school_a,'Responsável sem dados civis');
  execute 'set local role authenticated';
  if public.siep_my_access()<>'[]'::jsonb then raise exception 'Pedido pendente liberou acesso';end if;
  execute 'reset role';
  begin perform public.siep_request_school_access(school_a,'Outro nome');raise exception 'Pedido duplicado aceito';exception when check_violation then null;end;
  other_link:=public.siep_request_school_access(school_b,'Responsável sem dados civis');
  execute 'reset role';
  select person_id into person_uuid from public.school_people where id=link_id;
  if not exists(select 1 from public.school_people where id=link_id and school_id=school_a and status='pending' and user_id=actor) then raise exception 'Pedido associado à escola errada';end if;
  if not exists(select 1 from public.people where id=person_uuid and cpf is null and birth_date is null and gender is null) then raise exception 'Dados civis inventados';end if;
  if (select person_id from public.school_people where id=other_link)<>person_uuid then raise exception 'Pessoa duplicada ao pedir outra escola';end if;
  begin insert into public.school_people(institution_id,school_id,person_id,role,status) values(tenant,school_a,person_uuid,'athlete','approved');raise exception 'Atleta incompleto permitido';exception when check_violation then null;end;
  begin insert into public.school_people(institution_id,school_id,person_id,role,status) values(tenant,school_a,person_uuid,'staff','approved');raise exception 'Profissional incompleto permitido';exception when check_violation then null;end;
  perform set_config('request.jwt.claim.sub',admin_user::text,true);
  execute 'set local role authenticated';
  perform public.siep_decide_school_link(link_id,'approved','Vínculo conferido com a escola');
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',actor::text,true);
  execute 'set local role authenticated';
  if public.siep_my_access()->0->'schools'->0->>'id'<>school_a::text or jsonb_array_length(public.siep_my_access()->0->'schools')<>1 then raise exception 'Aprovação liberou escola errada';end if;
  execute 'reset role';
  -- Completar os dados depois preserva a identidade e os vínculos.
  update public.people set cpf='52998224725',birth_date='1990-01-01',gender='Feminino' where id=person_uuid;
  insert into public.school_people(institution_id,school_id,person_id,role,status) values(tenant,school_a,person_uuid,'athlete','approved');
  begin update public.people set cpf=null,birth_date=null,gender=null where id=person_uuid;raise exception 'Identidade esportiva esvaziada';exception when check_violation then null;end;
  raise exception 'rollback_simple_school_access' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;
 end;
end $$;
