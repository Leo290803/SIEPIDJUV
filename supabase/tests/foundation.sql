-- Executado dentro da transação do runner; fixtures sempre desfeitas.
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); school uuid := gen_random_uuid(); e uuid := gen_random_uuid(); m uuid := gen_random_uuid();
begin
 if not siep_private.valid_cpf('52998224725') or siep_private.valid_cpf('11111111111') or siep_private.valid_cpf('52998224724') then raise exception 'Validação CPF incorreta'; end if;
 if (select count(*) from pg_tables where schemaname='public' and tablename in ('institutions','institution_memberships','schools','people','school_people','membership_decisions','events','event_modalities','event_categories','event_proofs','event_rules','event_fields','document_requirements','event_staff_roles','event_participations','participation_categories','participant_documents','legacy_id_mappings') and rowsecurity) <> 18 then raise exception 'RLS ausente'; end if;
 if exists(select 1 from information_schema.role_table_grants where table_schema='public' and table_name='people' and grantee in ('anon','authenticated')) then raise exception 'Dados pessoais expostos'; end if;
 if not exists(select 1 from storage.buckets where id='siep-documents' and not public and file_size_limit=5242880) then raise exception 'Bucket ausente ou inseguro'; end if;
 -- Subtransação: todos os registros de teste são revertidos no final.
 begin
  insert into public.institutions(id,name,slug) values(a,'Teste A','test-'||a),(b,'Teste B','test-'||b);
  insert into public.schools(id,institution_id,name) values(school,a,'Escola');
  insert into public.events(id,institution_id,name) values(e,a,'Evento');
  insert into public.event_modalities(id,institution_id,event_id,name,classification) values(m,a,e,'Atletismo','individual');
  begin
   insert into public.event_categories(institution_id,event_id,modality_id,name,participation,birth_year_start) values(a,e,m,'Inválida','individual',2011);
   raise exception 'Faixa incompleta aceita';
  exception when check_violation then null; end;
  begin
   insert into public.event_participations(institution_id,event_id,school_id,person_id) values(b,e,school,gen_random_uuid());
   raise exception 'Referência entre instituições aceita';
  exception when foreign_key_violation then null; end;
  begin
   insert into public.people(institution_id,full_name,birth_date,cpf,gender) values(a,'Pessoa','2012-01-01','11111111111','Feminino');
   raise exception 'CPF inválido aceito';
  exception when check_violation then null; end;
  insert into public.people(institution_id,full_name,birth_date,cpf,gender) values(a,'Pessoa','2012-01-01','52998224725','Feminino');
  begin
   insert into public.people(institution_id,full_name,birth_date,cpf,gender) values(a,'Pessoa 2','2012-01-01','52998224725','Feminino');
   raise exception 'CPF duplicado aceito';
  exception when unique_violation then null; end;
  insert into public.people(institution_id,full_name,birth_date,cpf,gender) values(b,'Pessoa outro cliente','2012-01-01','52998224725','Feminino');
  raise exception using errcode='Z0001',message='rollback fixtures';
 exception when sqlstate 'Z0001' then null; end;
end $$;
