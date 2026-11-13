-- O otimizador pode avaliar o predicado antes de filtrar outra instituição.
-- Contexto incompatível deve excluir o candidato, sem interromper a consulta.
create or replace function siep_private.candidate_athlete_issues(event_uuid uuid,person_uuid uuid,category_uuid uuid,proof_uuid uuid,registration_uuid uuid default null) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare category public.event_categories; person public.people; rule public.event_rules; rows jsonb; issues jsonb:='[]'; key text; count_value integer; reference_date date;
begin
 select * into category from public.event_categories where id=category_uuid and event_id=event_uuid;
 if not found then return jsonb_build_array('category_unavailable');end if;
 select * into person from public.people where id=person_uuid and institution_id=category.institution_id;
 if not found then return jsonb_build_array('person_unavailable');end if;
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
