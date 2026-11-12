-- O revezamento de categoria individual usa o mínimo próprio da prova.
-- Categorias de equipe continuam acumulando seus limites explícitos.
create or replace function siep_private.registration_issues(registration uuid) returns jsonb
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
 if (coalesce(pr.kind,'individual')<>'relay' or c.participation='team') and ((c.min_athletes is not null and n<c.min_athletes) or (c.max_athletes is not null and n>c.max_athletes)) then issues:=issues||jsonb_build_array('category_roster'); end if;
 if r.proof_id is not null and pr.min_athletes is not null and n<pr.min_athletes then issues:=issues||jsonb_build_array('proof_minimum'); end if;
 for professional in select rs.*,p.archived,er.enabled from public.registration_staff rs join public.people p on p.id=rs.person_id join public.event_staff_roles er on er.id=rs.staff_role_id where rs.registration_id=r.id loop
  if professional.archived or not professional.enabled or not exists(select 1 from public.school_people sp where sp.institution_id=r.institution_id and sp.school_id=r.school_id and sp.person_id=professional.person_id and sp.role='staff' and sp.status='approved' and not sp.archived and btrim(coalesce(sp.position,''))<>'' and lower(btrim(sp.position))=lower(btrim((select name from public.event_staff_roles where id=professional.staff_role_id)))) then issues:=issues||jsonb_build_array('staff_ineligible:'||professional.person_id); end if;
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


revoke all on function siep_private.registration_issues(uuid) from public,anon,authenticated;
