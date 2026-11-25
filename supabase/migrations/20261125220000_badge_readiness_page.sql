create function public.siep_badge_readiness_page(
 p_event_id uuid,p_school_id uuid,p_role text default null,p_query text default '',
 p_offset integer default 0,p_limit integer default 25
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare
 selected_event public.events;
 selected_school public.schools;
 result jsonb;
begin
 select * into selected_event from public.events where id=p_event_id;
 perform siep_private.require_staff(selected_event.institution_id);
 select * into selected_school from public.schools where id=p_school_id and institution_id=selected_event.institution_id;
 if not found then raise exception 'Selecione uma escola da instituição' using errcode='42501';end if;
 if p_limit is null or p_limit not between 1 and 50 or p_offset is null or p_offset not between 0 and 1000000
  or length(p_query)>200 or (p_role is not null and p_role not in ('athlete','staff','responsible')) then
  raise exception 'Consulta inválida' using errcode='22023';
 end if;
 with registrations as materialized (
  select id,status from public.registrations
  where institution_id=selected_event.institution_id and event_id=p_event_id and school_id=p_school_id
   and status in ('draft','submitted','correction_requested','approved')
 ), athletes as (
  select a.person_id,case
   when bool_or(r.status='approved') then 'approved'
   when bool_or(r.status='correction_requested') then 'correction_requested'
   when bool_or(r.status='submitted') then 'submitted'
   else 'draft' end as registration_status
  from registrations r join public.registration_athletes a on a.registration_id=r.id and a.active
  group by a.person_id
 ), candidates as (
  select person_id,'athlete'::text as role,registration_status from athletes
  union all
  select sp.person_id,sp.role,null
  from public.school_people sp
  where sp.institution_id=selected_event.institution_id and sp.school_id=p_school_id and sp.status='approved' and not sp.archived
   and (sp.role='staff' or (sp.role='responsible' and sp.user_id is not null and exists(select 1 from registrations)))
 ), eligible as materialized (
  select * from siep_private.badge_rows(p_event_id,p_school_id,p_role,p_query)
 ), matching as materialized (
  select c.*,p.full_name as person_name
  from candidates c join public.people p on p.id=c.person_id and p.institution_id=selected_event.institution_id and not p.archived
  where (p_role is null or c.role=p_role)
   and (coalesce(p_query,'')='' or strpos(siep_private.report_text(p.full_name||' '||selected_school.name),siep_private.report_text(p_query))>0)
 ), page as (
  select * from matching order by person_name,role,person_id offset p_offset limit p_limit
 ), details as (
  select p.person_id,p.person_name,p.role,
   array_remove(array[
    case when selected_event.status='archived' then 'event_archived' when selected_school.archived then 'school_archived' end,
    case when e.person_id is not null then null
     when p.role='athlete' then case p.registration_status
      when 'draft' then 'registration_draft'
      when 'correction_requested' then 'registration_correction'
      when 'submitted' then 'registration_approval'
      else 'inactive_link' end
     when p.role='staff' then case staff.review->>'status'
      when 'approved' then 'registration_approval'
      when 'correction_requested' then 'staff_correction'
      when 'rejected' then 'staff_rejected'
      when 'pending' then case when staff.review->>'active'='false' then 'inactive_link' else 'staff_review' end
      else 'staff_not_submitted' end
     else 'registration_approval' end,
    case when not exists(select 1 from public.person_photos f where f.institution_id=selected_event.institution_id
      and f.person_id=p.person_id and f.is_current and f.status='uploaded') then 'photo' end
   ],null) as reasons
  from page p left join eligible e on e.person_id=p.person_id and e.role=p.role
  left join lateral (
   select case when p.role='staff' and e.person_id is null
     then siep_private.staff_conference_row(selected_event.institution_id,p_event_id,p_school_id,p.person_id) end as review
  ) staff on true
 )
 select jsonb_build_object('total',(select count(*) from matching),
  'rows',coalesce((select jsonb_agg(to_jsonb(d) order by person_name,role,person_id) from details d),'[]'))
 into result;
 return result;
end $$;

revoke all on function public.siep_badge_readiness_page(uuid,uuid,text,text,integer,integer) from public,anon;
grant execute on function public.siep_badge_readiness_page(uuid,uuid,text,text,integer,integer) to authenticated;
notify pgrst,'reload schema';
