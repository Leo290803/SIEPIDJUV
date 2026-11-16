-- Somente os registros da tela atual e os detalhes necessários ao formulário.
create function public.siep_portal_page(p_institution_id uuid,p_mode text default 'light',p_school_id uuid default null,p_role text default null,p_filters jsonb default '{}',p_offset integer default 0,p_limit integer default 25,p_detail_id uuid default null,p_edit boolean default false)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog set statement_timeout='10s' as $$
declare tenant uuid:=p_institution_id;school uuid:=p_school_id;event uuid; staff boolean; ids uuid[]:='{}';pids uuid[]:='{}';rids uuid[]:='{}';allocation_rids uuid[]:='{}';partids uuid[]:='{}';links uuid[]:='{}';total bigint:=0;payload jsonb;summary jsonb; search text:=siep_private.report_text(coalesce(p_filters->>'query',''));state text:=coalesce(p_filters->>'status','all');
begin
 staff:=siep_private.is_staff(tenant);
 if not staff and (school is null or not siep_private.can_school(tenant,school)) then raise exception 'Acesso indisponível' using errcode='42501';end if;
 if school is not null and not exists(select 1 from public.schools where id=school and institution_id=tenant) then raise exception 'Escola indisponível' using errcode='42501';end if;
 if p_mode is null or p_mode not in ('light','dashboard','people','registrations','notifications') or p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset not between 0 and 1000000 or octet_length(p_filters::text)>2048 then raise exception 'Consulta inválida' using errcode='22023';end if;
 if p_mode='people' and (p_role is null or p_role not in ('athlete','staff','responsible') or (p_role='responsible' and not staff)) then raise exception 'Papel indisponível' using errcode='42501';end if;
 event:=nullif(p_filters->>'eventId','')::uuid;
 if school is not null and event is null then select c.event_id into event from public.school_event_contexts c join public.events e on e.id=c.event_id and e.status='open' where c.institution_id=tenant and c.school_id=school;end if;
 if p_mode='people' then
  with matching as materialized (
   select sp.id,p.full_name from public.school_people sp join public.people p on p.id=sp.person_id join public.schools s on s.id=sp.school_id
   where sp.institution_id=tenant and sp.role=p_role and (school is null or sp.school_id=school) and (nullif(p_filters->>'schoolId','') is null or sp.school_id=(p_filters->>'schoolId')::uuid)
   and (state in ('all','Todos') or (state in ('active','archived') and (p.archived or sp.archived or (sp.role in ('athlete','staff') and sp.status<>'approved'))=(state='archived')) or sp.status=case state when 'Pendente' then 'pending' when 'Aprovado' then 'approved' when 'Recusado' then 'refused' when 'Encerrado' then 'closed' end)
   and (staff or siep_private.can_person(tenant,p.id))
   and (search='' or strpos(siep_private.report_text(p.full_name||' '||p.cpf||' '||s.name||' '||coalesce(p.contact->>'email','')||' '||coalesce(sp.position,'')||' '||coalesce(sp.professional_registration,'')),search)>0 or (search ~ '^[0-9. /-]+$' and strpos(p.cpf,regexp_replace(search,'[^0-9]','','g'))>0))
  ), page as(select id from matching order by full_name,id offset p_offset limit p_limit)
  select (select count(*) from matching),coalesce((select array_agg(id) from page),'{}') into total,ids;
  if p_detail_id is not null then
   if not exists(select 1 from public.school_people sp where sp.id=p_detail_id and sp.institution_id=tenant and sp.role=p_role and (school is null or sp.school_id=school)) then raise exception 'Cadastro indisponível' using errcode='42501';end if;
   ids:=array_append(ids,p_detail_id);
  end if;
  select coalesce(array_agg(distinct sp.person_id),'{}') into pids from public.school_people sp where sp.id=any(ids);
  links:=ids;
 elsif p_mode='registrations' then
  with matching as materialized (
   select r.id,e.name as event_name,s.name as school_name from public.registrations r join public.events e on e.id=r.event_id join public.schools s on s.id=r.school_id
   where r.institution_id=tenant and (school is null or r.school_id=school) and (event is null or r.event_id=event) and (state='all' or r.status=state) and (search='' or strpos(siep_private.report_text(e.name||' '||s.name),search)>0)
  ),page as(select id from matching order by event_name,school_name,id offset p_offset limit p_limit)
  select (select count(*) from matching),coalesce((select array_agg(id) from page),'{}') into total,rids;
  if p_detail_id is not null then
   if not exists(select 1 from public.registrations r where r.id=p_detail_id and r.institution_id=tenant and (school is null or r.school_id=school)) then raise exception 'Inscrição indisponível' using errcode='42501';end if;
   rids:=array_append(rids,p_detail_id);
   if p_edit then select r.school_id,r.event_id into school,event from public.registrations r where r.id=p_detail_id;end if;
  end if;
  allocation_rids:=rids;
  if p_edit and school is not null and event is not null then select coalesce(array_agg(r.id),'{}') into allocation_rids from public.registrations r where r.institution_id=tenant and r.school_id=school and r.event_id=event;end if;
  select coalesce(array_agg(distinct person_id),'{}') into pids from (select a.person_id from public.registration_athletes a where a.registration_id=any(allocation_rids) union select a.person_id from public.registration_staff a where a.registration_id=any(rids) union select sp.person_id from public.school_people sp where p_edit and school is not null and sp.institution_id=tenant and sp.school_id=school and sp.role='staff') p;
  select coalesce(array_agg(sp.id),'{}') into links from public.school_people sp where sp.institution_id=tenant and sp.person_id=any(pids) and ((school is not null and sp.school_id=school) or (school is null and exists(select 1 from public.registrations r where r.id=any(rids) and r.school_id=sp.school_id)));
 end if;
 if not staff then select coalesce(array_agg(p.id),'{}') into pids from public.people p where p.id=any(pids) and siep_private.can_person(tenant,p.id);end if;
 select coalesce(array_agg(ep.id),'{}') into partids from public.event_participations ep where ep.institution_id=tenant and ep.person_id=any(pids) and (
  (p_mode='people' and event is not null and ep.event_id=event and exists(select 1 from public.school_people sp where sp.id=any(links) and sp.school_id=ep.school_id))
  or (p_mode='registrations' and exists(select 1 from public.registration_athletes a where a.registration_id=any(allocation_rids) and a.participation_id=ep.id))
 );
 select jsonb_build_object(
  'pendingLinks',(select count(*) from public.school_people sp where sp.institution_id=tenant and sp.role='responsible' and sp.status='pending' and (school is null or sp.school_id=school)),
  'submitted',(select count(*) from public.registrations r where r.institution_id=tenant and r.status='submitted' and (school is null or r.school_id=school)),
  'athletesInEvent',(select count(*) from public.event_participations ep where school is not null and ep.institution_id=tenant and ep.school_id=school and ep.event_id=event and exists(select 1 from public.school_people sp join public.people p on p.id=sp.person_id where sp.institution_id=tenant and sp.person_id=ep.person_id and sp.school_id=school and sp.role='athlete' and sp.status='approved' and not sp.archived and not p.archived)),
  'registrationsInEvent',(select count(*) from public.registrations r where school is not null and r.institution_id=tenant and r.school_id=school and (event is null or r.event_id=event)),
  'schoolStaff',(select count(*) from public.school_people sp join public.people p on p.id=sp.person_id where school is not null and sp.institution_id=tenant and sp.school_id=school and sp.role='staff' and sp.status='approved' and not sp.archived and not p.archived),
  'unread',(select count(*) from public.notifications n where n.institution_id=tenant and n.recipient_user_id=auth.uid() and n.read_at is null)
 ) into summary;
 select jsonb_build_object(
 'people',coalesce((select jsonb_agg(to_jsonb(p)) from public.people p where p.institution_id=tenant and p.id=any(pids)),'[]'),
 'school_people',coalesce((select jsonb_agg(to_jsonb(sp) order by p.full_name,sp.id) from public.school_people sp join public.people p on p.id=sp.person_id where sp.id=any(links)),'[]'),
 'person_photos',coalesce((select jsonb_agg(to_jsonb(ph)) from public.person_photos ph where ph.institution_id=tenant and ph.person_id=any(pids) and ph.is_current),'[]'),
 'event_participations',coalesce((select jsonb_agg(to_jsonb(ep)) from public.event_participations ep where ep.id=any(partids)),'[]'),
 'participation_categories',coalesce((select jsonb_agg(to_jsonb(pc)) from public.participation_categories pc where pc.participation_id=any(partids)),'[]'),
 'participant_documents',coalesce((select jsonb_agg(to_jsonb(d)) from public.participant_documents d where d.participation_id=any(partids)),'[]'),
 'membership_decisions',coalesce((select jsonb_agg(to_jsonb(d)) from public.membership_decisions d where d.school_person_id=any(links) and (staff or exists(select 1 from public.school_people sp where sp.id=d.school_person_id and sp.user_id=auth.uid()))),'[]'),
 'registrations',coalesce((select jsonb_agg(to_jsonb(r) order by e.name,s.name,r.id) from public.registrations r join public.events e on e.id=r.event_id join public.schools s on s.id=r.school_id where r.id=any(rids)),'[]'),
 'registration_athletes',coalesce((select jsonb_agg(to_jsonb(a)) from public.registration_athletes a where a.registration_id=any(allocation_rids)),'[]'),
 'registration_staff',coalesce((select jsonb_agg(to_jsonb(a)) from public.registration_staff a where a.registration_id=any(rids)),'[]'),
 'school_event_contexts',coalesce((select jsonb_agg(to_jsonb(c)) from public.school_event_contexts c where c.institution_id=tenant and school is not null and c.school_id=school),'[]'),
 'notifications',coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at desc,n.id) from (select * from public.notifications n where n.institution_id=tenant and n.recipient_user_id=auth.uid() and p_mode='notifications' order by n.created_at desc,n.id offset p_offset limit p_limit) n),'[]')
 ) into payload;
 if p_mode='notifications' then select count(*) into total from public.notifications n where n.institution_id=tenant and n.recipient_user_id=auth.uid();end if;
 return jsonb_build_object('tables',payload,'total',total,'summary',summary);
end $$;
revoke all on function public.siep_portal_page(uuid,text,uuid,text,jsonb,integer,integer,uuid,boolean) from public,anon;
grant execute on function public.siep_portal_page(uuid,text,uuid,text,jsonb,integer,integer,uuid,boolean) to authenticated;
