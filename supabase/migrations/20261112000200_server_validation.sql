-- Parâmetros têm contrato único com o catálogo existente, sem limites implícitos.
create function siep_private.check_rule_parameters() returns trigger
language plpgsql set search_path=pg_catalog as $$
declare allowed text[]; item record; reference_date date;
begin
 allowed := case new.kind when 'modalities' then array['total','individual','collective'] when 'proofs' then array['individual','relay'] when 'age' then array['min','max','referenceDate'] when 'roster' then array['min','max'] when 'staffLimits' then array['min','max'] else array['max'] end;
 for item in select key,value from jsonb_each(new.parameters) loop
  if not item.key=any(allowed) then raise exception 'Parâmetro de regra desconhecido: %',item.key using errcode='23514'; end if;
  if item.key<>'referenceDate' and item.value<>'null'::jsonb and (jsonb_typeof(item.value)<>'number' or item.value::text !~ '^[0-9]+$' or (item.value::text)::numeric>2147483647) then
   raise exception 'Limite deve ser inteiro não negativo ou null' using errcode='23514';
  end if;
 end loop;
 if (new.parameters->>'min')::integer > (new.parameters->>'max')::integer then raise exception 'Mínimo maior que máximo' using errcode='23514'; end if;
 if new.kind='age' then
  if coalesce(new.parameters->>'referenceDate','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Data de referência obrigatória' using errcode='23514'; end if;
  begin reference_date := (new.parameters->>'referenceDate')::date;
  exception when others then raise exception 'Data de referência inválida' using errcode='23514'; end;
 end if;
 return new;
end $$;
create trigger event_rule_parameters before insert or update on public.event_rules for each row execute function siep_private.check_rule_parameters();

create function siep_private.participation_issues(participation uuid) returns jsonb
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
 for item in select * from public.document_requirements dr where dr.event_id=p.event_id and dr.required and (dr.category_id is null or exists(select 1 from public.participation_categories pc where pc.participation_id=p.id and pc.category_id=dr.category_id)) loop
  if not exists(select 1 from public.participant_documents d join storage.objects o on o.bucket_id=d.bucket_id and o.name=d.object_path where d.participation_id=p.id and d.requirement_id=item.id and d.status='uploaded' and d.size_bytes<=item.max_bytes and (not item.image_only or d.mime_type in ('image/png','image/jpeg'))) then issues:=issues||jsonb_build_array('document_required:'||item.id); end if;
 end loop;
 return issues;
end $$;

-- Avaliação hipotética por atleta: inclui a escolha candidata sem reservar vaga.
create function siep_private.candidate_athlete_issues(event_uuid uuid,person_uuid uuid,category_uuid uuid,proof_uuid uuid,registration_uuid uuid default null) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare category public.event_categories; person public.people; rule public.event_rules; rows jsonb; issues jsonb:='[]'; key text; count_value integer; reference_date date;
begin
 select * into strict category from public.event_categories where id=category_uuid and event_id=event_uuid;
 select * into strict person from public.people where id=person_uuid and institution_id=category.institution_id;
 select coalesce(jsonb_agg(jsonb_build_object('category_id',x.category_id,'modality_id',c.modality_id,'classification',m.classification,'proof_id',x.proof_id,'proof_kind',p.kind)),'[]') into rows from public.registration_athletes ra join public.registrations x on x.id=ra.registration_id join public.event_categories c on c.id=x.category_id join public.event_modalities m on m.id=c.modality_id left join public.event_proofs p on p.id=x.proof_id where x.event_id=event_uuid and ra.person_id=person_uuid and x.status not in ('cancelled','rejected') and (registration_uuid is null or x.id<>registration_uuid);
 rows:=rows||jsonb_build_array(jsonb_build_object('category_id',category.id,'modality_id',category.modality_id,'classification',(select classification from public.event_modalities where id=category.modality_id),'proof_id',proof_uuid,'proof_kind',(select kind from public.event_proofs where id=proof_uuid)));
 for rule in select * from public.event_rules where event_id=event_uuid and enabled and (category_id is null or category_id=category.id) and (proof_id is null or proof_id=proof_uuid) loop
  if rule.kind='modalities' then
   foreach key in array array['total','individual','collective'] loop
    select count(distinct x->>'modality_id') into count_value from jsonb_array_elements(rows) x where key='total' or x->>'classification'=key;
    if count_value>(rule.parameters->>key)::integer then issues:=issues||jsonb_build_array('rule:'||rule.id||':'||person_uuid||':'||key); end if;
   end loop;
  elsif rule.kind='athleteCategories' then
   select count(distinct x->>'category_id') into count_value from jsonb_array_elements(rows) x where x->>'modality_id'=category.modality_id::text;
   if count_value>(rule.parameters->>'max')::integer then issues:=issues||jsonb_build_array('rule:'||rule.id||':'||person_uuid); end if;
  elsif rule.kind='proofs' then
   foreach key in array array['individual','relay'] loop
    select count(distinct x->>'proof_id') into count_value from jsonb_array_elements(rows) x where x->>'category_id'=category.id::text and x->>'proof_kind'=key;
    if count_value>(rule.parameters->>key)::integer then issues:=issues||jsonb_build_array('rule:'||rule.id||':'||person_uuid||':'||key); end if;
   end loop;
  elsif rule.kind='proofEntries' then
   select count(*) into count_value from jsonb_array_elements(rows) x where x->>'proof_id'=proof_uuid::text;
   if count_value>(rule.parameters->>'max')::integer then issues:=issues||jsonb_build_array('rule:'||rule.id||':'||person_uuid); end if;
  elsif rule.kind='age' then
   reference_date:=(rule.parameters->>'referenceDate')::date;
   count_value:=extract(year from age(reference_date,person.birth_date));
   if person.birth_date>reference_date or count_value<(rule.parameters->>'min')::integer or count_value>(rule.parameters->>'max')::integer then issues:=issues||jsonb_build_array('rule:'||rule.id||':'||person_uuid); end if;
  end if;
 end loop;
 return issues;
end $$;

create function siep_private.registration_issues(registration uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare r public.registrations; c public.event_categories; pr public.event_proofs; rule public.event_rules; athlete record; professional record; issues jsonb:='[]'; n integer; ns integer; value integer; key text; count_value integer; birth date; reference_date date;
begin
 select * into r from public.registrations where id=registration;
 if not found then return jsonb_build_array('registration_not_found'); end if;
 select * into c from public.event_categories where id=r.category_id;
 select * into pr from public.event_proofs where id=r.proof_id;
 if not c.enabled or not exists(select 1 from public.event_modalities m where m.id=c.modality_id and m.enabled) then issues:=issues||jsonb_build_array('category_disabled'); end if;
 if r.proof_id is not null and pr.slots_per_school is null then issues:=issues||jsonb_build_array('proof_capacity_required'); end if;
 if r.proof_id is not null and not pr.enabled then issues:=issues||jsonb_build_array('proof_disabled'); end if;
 if r.proof_id is null and exists(select 1 from public.event_proofs where category_id=c.id) then issues:=issues||jsonb_build_array('proof_required'); end if;
 if exists(select 1 from public.schools where id=r.school_id and archived) then issues:=issues||jsonb_build_array('school_archived'); end if;
 select count(*) into n from public.registration_athletes where registration_id=r.id;
 select count(*) into ns from public.registration_staff where registration_id=r.id;
 if n=0 then issues:=issues||jsonb_build_array('athlete_required'); end if;
 if (c.min_athletes is not null and n<c.min_athletes) or (c.max_athletes is not null and n>c.max_athletes) then issues:=issues||jsonb_build_array('category_roster'); end if;
 if r.proof_id is not null and pr.min_athletes is not null and n<pr.min_athletes then issues:=issues||jsonb_build_array('proof_minimum'); end if;
 for professional in select rs.*,p.archived,er.enabled from public.registration_staff rs join public.people p on p.id=rs.person_id join public.event_staff_roles er on er.id=rs.staff_role_id where rs.registration_id=r.id loop
  if professional.archived or not professional.enabled or not exists(select 1 from public.school_people sp where sp.institution_id=r.institution_id and sp.school_id=r.school_id and sp.person_id=professional.person_id and sp.role='staff' and sp.status='approved' and btrim(coalesce(sp.position,''))<>'' and lower(btrim(sp.position))=lower(btrim((select name from public.event_staff_roles where id=professional.staff_role_id)))) then issues:=issues||jsonb_build_array('staff_ineligible:'||professional.person_id); end if;
 end loop;
 for athlete in select ra.*,ep.status as participation_status,p.birth_date,p.gender from public.registration_athletes ra join public.event_participations ep on ep.id=ra.participation_id join public.people p on p.id=ra.person_id where ra.registration_id=r.id loop
  if athlete.participation_status<>'complete' or siep_private.participation_issues(athlete.participation_id)<>'[]'::jsonb then issues:=issues||jsonb_build_array('participation_incomplete:'||athlete.person_id); end if;
  if not exists(select 1 from public.participation_categories pc where pc.participation_id=athlete.participation_id and pc.category_id=r.category_id) then issues:=issues||jsonb_build_array('category_not_selected:'||athlete.person_id); end if;
  if c.birth_year_start is not null and extract(year from athlete.birth_date) not between c.birth_year_start and c.birth_year_end then issues:=issues||jsonb_build_array('birth_year:'||athlete.person_id); end if;
  if (c.gender is not null and c.gender<>athlete.gender) or (pr.gender is not null and pr.gender<>athlete.gender) then issues:=issues||jsonb_build_array('gender:'||athlete.person_id); end if;
  issues:=issues||siep_private.candidate_athlete_issues(r.event_id,athlete.person_id,r.category_id,r.proof_id,r.id);
 end loop;
 for rule in select * from public.event_rules where event_id=r.event_id and enabled and (category_id is null or category_id=r.category_id) and (proof_id is null or proof_id=r.proof_id) loop
  if rule.kind in ('roster','staffLimits') then
   count_value:=case when rule.kind='roster' then n else ns end;
   if ((rule.parameters->>'min')::integer is not null and count_value<(rule.parameters->>'min')::integer) or ((rule.parameters->>'max')::integer is not null and count_value>(rule.parameters->>'max')::integer) then issues:=issues||jsonb_build_array('rule:'||rule.id); end if;
  elsif rule.kind='schoolEntries' then
   select count(*) into count_value from public.registrations x where x.event_id=r.event_id and x.school_id=r.school_id and x.category_id=r.category_id and (rule.proof_id is null or x.proof_id=rule.proof_id) and x.status not in ('cancelled','rejected');
   if count_value>(rule.parameters->>'max')::integer then issues:=issues||jsonb_build_array('rule:'||rule.id); end if;
  end if;

 end loop;
 return (select coalesce(jsonb_agg(distinct v),'[]') from jsonb_array_elements(issues) v);
end $$;

create function siep_private.prepare_roster() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare r public.registrations; p public.event_participations; proof public.event_proofs;
begin
 select * into r from public.registrations where id=new.registration_id;
 if not found then raise exception 'Inscrição ausente' using errcode='23503'; end if;
 select * into p from public.event_participations where id=new.participation_id;
 if not found then raise exception 'Participação ausente' using errcode='23503'; end if;
 new.institution_id:=r.institution_id; new.event_id:=r.event_id; new.school_id:=r.school_id;
 new.person_id:=p.person_id; new.proof_id:=r.proof_id; new.active:=r.status not in ('cancelled','rejected');
 select * into proof from public.event_proofs where id=r.proof_id;
 if new.active and proof.slots_per_school is not null and new.slot_number>proof.slots_per_school then raise exception 'Vaga além da capacidade da prova' using errcode='23514'; end if;
 return new;
end $$;
create trigger prepare_registration_athlete before insert or update on public.registration_athletes for each row execute function siep_private.prepare_roster();

create function siep_private.sync_registration_roster() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if (new.institution_id,new.event_id,new.school_id,new.category_id,new.proof_id) is distinct from (old.institution_id,old.event_id,old.school_id,old.category_id,old.proof_id) then raise exception 'Contexto da inscrição é imutável; crie outra inscrição' using errcode='23514'; end if;
 if new.status is distinct from old.status then update public.registration_athletes set active=new.status not in ('cancelled','rejected') where registration_id=new.id; end if;
 return new;
end $$;
create trigger sync_registration_roster after update on public.registrations for each row execute function siep_private.sync_registration_roster();

create function siep_private.immutable_history() returns trigger language plpgsql set search_path=pg_catalog as $$
begin raise exception 'Histórico é imutável' using errcode='23514'; end $$;
do $$ declare t text; begin
 foreach t in array array['registration_versions','registration_decisions','membership_decisions','event_configuration_versions','audit_log'] loop
 execute format('create trigger immutable_history before update or delete on public.%I for each row execute function siep_private.immutable_history()',t);
 end loop;
end $$;

-- Toda alteração administrativa de configuração usa a mesma trava das inscrições.
create function siep_private.lock_event_configuration() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare event_uuid uuid;
begin
 event_uuid:=case when tg_op='DELETE' then old.event_id else new.event_id end;
 if tg_op='UPDATE' and (new.institution_id,new.event_id) is distinct from (old.institution_id,old.event_id) then raise exception 'Instituição/edição imutáveis' using errcode='23514'; end if;
 perform 1 from public.events where id=event_uuid for update;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create function siep_private.bump_event_configuration() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare event_uuid uuid;
begin
 event_uuid:=case when tg_op='DELETE' then old.event_id else new.event_id end;
 update public.events set configuration_version=configuration_version+1,updated_at=now() where id=event_uuid;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
do $$ declare t text; begin
 foreach t in array array['event_modalities','event_categories','event_proofs','event_rules','event_fields','document_requirements','event_staff_roles'] loop
 execute format('create trigger a_lock_configuration before insert or update or delete on public.%I for each row execute function siep_private.lock_event_configuration()',t);
 execute format('create trigger z_bump_configuration after insert or update or delete on public.%I for each row execute function siep_private.bump_event_configuration()',t);
 end loop;
end $$;

create function siep_private.event_snapshot(event_uuid uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog as $$
 select jsonb_build_object('event',to_jsonb(e),'modalities',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.event_modalities x where x.event_id=e.id),'categories',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.event_categories x where x.event_id=e.id),'proofs',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.event_proofs x where x.event_id=e.id),'rules',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.event_rules x where x.event_id=e.id),'fields',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.event_fields x where x.event_id=e.id),'documents',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.document_requirements x where x.event_id=e.id),'staff_roles',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.event_staff_roles x where x.event_id=e.id)) from public.events e where e.id=event_uuid;
$$;

-- Toda função privada criada nesta migração fica sem execução pública.
revoke all on all functions in schema siep_private from public,anon,authenticated;
