-- School staff enroll once per event, independently of athlete registrations.
create table public.staff_event_entries (
 institution_id uuid not null,
 event_id uuid not null,
 school_id uuid not null,
 person_id uuid not null,
 staff_role_id uuid not null references public.event_staff_roles(id),
 submission_revision integer not null default 1 check(submission_revision>0),
 submitted_by uuid not null references auth.users(id),
 submitted_at timestamptz not null default now(),
 primary key(institution_id,event_id,school_id,person_id),
 foreign key(institution_id,event_id) references public.events(institution_id,id),
 foreign key(institution_id,school_id) references public.schools(institution_id,id),
 foreign key(institution_id,person_id) references public.people(institution_id,id)
);
alter table public.staff_event_entries enable row level security;
revoke all on public.staff_event_entries from public,anon,authenticated;

create or replace function siep_private.staff_conference_candidate(tenant uuid,ev uuid,school uuid,person uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 with legacy as (
  select a.registration_id,sr.id,sr.name
  from public.registration_staff a join public.event_staff_roles sr on sr.id=a.staff_role_id
  where a.institution_id=tenant and a.event_id=ev and a.school_id=school and a.person_id=person
 )
 select jsonb_build_object(
  'event_id',ev,'school_id',school,'person_id',person,'event_name',e.name,'school_name',s.name,
  'person',to_jsonb(p),'link_id',sp.id,
  'active',not p.archived and not sp.archived and sp.status='approved' and not s.archived
    and (entry.person_id is null or coalesce(role.enabled and role.name=sp.position,false)),
  'photo',(select jsonb_build_object('id',f.id,'bucket',f.bucket_id,'objectPath',f.object_path,'name',f.original_name)
   from public.person_photos f where f.institution_id=tenant and f.person_id=person and f.is_current and f.status='uploaded'),
  'roles',case when entry.person_id is not null then jsonb_build_array(jsonb_build_object('id',role.id,'name',role.name))
   else (select coalesce(jsonb_agg(x order by x->>'name'),'[]') from
    (select distinct jsonb_build_object('id',id,'name',name) x from legacy) roles) end,
  'registration_count',(select count(distinct registration_id) from legacy)
 ) || case when entry.person_id is null then '{}'::jsonb
      else jsonb_build_object('direct_entry',true,'submission_revision',entry.submission_revision) end
 from public.people p
 join public.school_people sp on sp.institution_id=p.institution_id and sp.person_id=p.id and sp.role='staff' and sp.school_id=school
 join public.events e on e.institution_id=tenant and e.id=ev
 join public.schools s on s.institution_id=tenant and s.id=school
 left join public.staff_event_entries entry on entry.institution_id=tenant and entry.event_id=ev and entry.school_id=school and entry.person_id=person
 left join public.event_staff_roles role on role.id=entry.staff_role_id
 where p.institution_id=tenant and p.id=person and (entry.person_id is not null or exists(select 1 from legacy));
$$;

create or replace function siep_private.staff_conference_fingerprint(candidate jsonb) returns text
language sql immutable set search_path=pg_catalog as $$
 select md5((jsonb_build_object('person',candidate->'person','photo',candidate->'photo','roles',candidate->'roles','active',candidate->'active','link_id',candidate->'link_id')
  || case when candidate ? 'submission_revision'
     then jsonb_build_object('submission_revision',candidate->'submission_revision') else '{}'::jsonb end)::text);
$$;
create or replace function public.siep_staff_conference_page(p_institution_id uuid,p_school_id uuid default null,p_filters jsonb default '{}',p_offset integer default 0,p_limit integer default 10) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare payload jsonb;total bigint;ev uuid;school uuid;state text:=coalesce(p_filters->>'status','all');q text:=siep_private.report_text(coalesce(p_filters->>'query',''));
begin
 if not siep_private.is_staff(p_institution_id) then
  if p_school_id is null then raise exception 'Escola obrigatória' using errcode='42501';end if;
  perform siep_private.require_school(p_institution_id,p_school_id);
 end if;
 if auth.uid() is null then raise exception 'Acesso indisponível' using errcode='42501';end if;
 if p_offset is null or p_offset not between 0 and 1000000 or p_limit is null or p_limit not between 1 and 50 or jsonb_typeof(p_filters)<>'object' or octet_length(p_filters::text)>2048 or state not in ('all','pending','approved','correction_requested','rejected') then raise exception 'Filtros inválidos' using errcode='22023';end if;
 ev:=nullif(p_filters->>'eventId','')::uuid;school:=coalesce(p_school_id,nullif(p_filters->>'schoolId','')::uuid);
 with sources as (
  select institution_id,event_id,school_id,person_id from public.staff_event_entries
  union
  select institution_id,event_id,school_id,person_id from public.registration_staff
  where p_filters->>'directOnly' is distinct from 'true'
 ), candidates as materialized (select a.event_id,a.school_id,a.person_id from sources a join public.people p on p.id=a.person_id join public.schools s on s.id=a.school_id where a.institution_id=p_institution_id and (ev is null or a.event_id=ev) and (school is null or a.school_id=school) and (q='' or position(q in siep_private.report_text(p.full_name||' '||p.cpf||' '||s.name))>0)), rows as materialized (select siep_private.staff_conference_row(p_institution_id,c.event_id,c.school_id,c.person_id) item from candidates c), filtered as materialized (select item from rows where item is not null and (state='all' or item->>'status'=state))
 select count(*),coalesce((select jsonb_agg(item order by item->>'school_name',item#>>'{person,full_name}',item->>'event_id',item->>'person_id') from (select item from filtered order by item->>'school_name',item#>>'{person,full_name}',item->>'event_id',item->>'person_id' offset p_offset limit p_limit) page),'[]') into total,payload from filtered;
 return jsonb_build_object('rows',payload,'total',total);
end $$;

create function public.siep_submit_staff_event(p_institution_id uuid,p_event_id uuid,p_school_id uuid,p_person_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
 role_id uuid;
 entry public.staff_event_entries;
 previous_status text;
begin
 perform siep_private.require_school(p_institution_id,p_school_id);
 perform pg_advisory_xact_lock(hashtextextended(p_institution_id::text||':'||p_event_id||':'||p_school_id||':'||p_person_id,0));
 perform 1 from public.events where institution_id=p_institution_id and id=p_event_id and status='open' for share;
 if not found then raise exception 'Selecione um evento com inscrições abertas' using errcode='23514';end if;
 select f.id into role_id from public.school_people sp
 join public.people p on p.institution_id=sp.institution_id and p.id=sp.person_id and not p.archived
 join public.schools s on s.institution_id=sp.institution_id and s.id=sp.school_id and not s.archived
 join public.event_staff_roles f on f.institution_id=sp.institution_id and f.event_id=p_event_id and f.enabled and f.name=sp.position
 where sp.institution_id=p_institution_id and sp.school_id=p_school_id and sp.person_id=p_person_id and sp.role='staff'
  and sp.status='approved' and not sp.archived
 for share of sp,p,s,f;
 if role_id is null then raise exception 'O profissional precisa estar ativo na escola e ter uma função habilitada no evento' using errcode='23514';end if;
 select * into entry from public.staff_event_entries where institution_id=p_institution_id and event_id=p_event_id
  and school_id=p_school_id and person_id=p_person_id;
 if found then
  previous_status:=siep_private.staff_conference_row(p_institution_id,p_event_id,p_school_id,p_person_id)->>'status';
  if entry.staff_role_id is distinct from role_id or previous_status in ('correction_requested','rejected') then
   update public.staff_event_entries set staff_role_id=role_id,submission_revision=submission_revision+1,
    submitted_by=auth.uid(),submitted_at=now()
   where institution_id=p_institution_id and event_id=p_event_id and school_id=p_school_id and person_id=p_person_id;
  end if;
 else
  insert into public.staff_event_entries(institution_id,event_id,school_id,person_id,staff_role_id,submitted_by)
  values(p_institution_id,p_event_id,p_school_id,p_person_id,role_id,auth.uid());
 end if;
 return jsonb_build_object('status',siep_private.staff_conference_row(p_institution_id,p_event_id,p_school_id,p_person_id)->>'status');
end $$;

create function public.siep_staff_event_status(p_institution_id uuid,p_event_id uuid,p_school_id uuid,p_people uuid[])
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 perform siep_private.require_school(p_institution_id,p_school_id);
 if cardinality(p_people)>100 then raise exception 'Consulta inválida' using errcode='22023';end if;
 return (select coalesce(jsonb_object_agg(person_id,siep_private.staff_conference_row(
   p_institution_id,p_event_id,p_school_id,person_id)->>'status'),'{}')
  from public.staff_event_entries where institution_id=p_institution_id and event_id=p_event_id
   and school_id=p_school_id and person_id=any(p_people));
end $$;

revoke all on function public.siep_submit_staff_event(uuid,uuid,uuid,uuid),public.siep_staff_event_status(uuid,uuid,uuid,uuid[]) from public,anon;
grant execute on function public.siep_submit_staff_event(uuid,uuid,uuid,uuid),public.siep_staff_event_status(uuid,uuid,uuid,uuid[]) to authenticated;

create or replace function siep_private.badge_rows(event_uuid uuid,school_uuid uuid,requested_role text,search text)
returns table(person_id uuid,school_id uuid,role text,role_label text,person_name text,school_name text,photo_id uuid,photo_bucket text,photo_path text)
language sql stable set search_path=pg_catalog as $$
 with approved as (
  select r.* from public.registrations r where r.event_id=event_uuid and r.status='approved' and (school_uuid is null or r.school_id=school_uuid)
 ), eligible as (
  select r.school_id,a.person_id,'athlete'::text as role from approved r join public.registration_athletes a on a.registration_id=r.id where a.active
  union select r.school_id,a.person_id,'staff'::text from approved r join public.registration_staff a on a.registration_id=r.id
  union select d.school_id,d.person_id,'staff'::text from public.staff_event_entries d
   where d.event_id=event_uuid and (school_uuid is null or d.school_id=school_uuid)
  union select r.school_id,sp.person_id,'responsible'::text from approved r join public.school_people sp on sp.school_id=r.school_id where sp.role='responsible' and sp.status='approved' and not sp.archived and sp.user_id is not null
 )
 select p.id,s.id,e.role,case e.role when 'athlete' then 'Atleta' when 'staff' then 'Comissão técnica' else 'Responsável escolar' end,p.full_name,s.name,f.id,f.bucket_id,f.object_path
 from eligible e join public.people p on p.id=e.person_id join public.schools s on s.id=e.school_id and s.institution_id=p.institution_id and not s.archived
 left join public.person_photos f on f.person_id=p.id and f.is_current and f.status='uploaded'
 where not p.archived and (requested_role is null or e.role=requested_role) and exists(select 1 from public.school_people sp where sp.school_id=s.id and sp.person_id=p.id and sp.role=e.role and sp.status='approved' and not sp.archived)
 and case when e.role='staff' then (siep_private.staff_conference_row(p.institution_id,event_uuid,s.id,p.id)->>'status')='approved' else true end
 and (coalesce(search,'')='' or strpos(siep_private.report_text(p.full_name||' '||s.name),siep_private.report_text(search))>0)
$$;
create or replace function siep_private.badge_dynamic_data(ev uuid,school uuid,person uuid,profile text) returns jsonb language sql stable set search_path=pg_catalog as $$
 with involved as(select r.* from public.registrations r where r.event_id=ev and r.school_id=school and r.status='approved' and case when profile='athlete' then exists(select 1 from public.registration_athletes a where a.registration_id=r.id and a.person_id=person and a.active) when profile='staff' then exists(select 1 from public.registration_staff a where a.registration_id=r.id and a.person_id=person) else false end)
 select jsonb_build_object('modalities',(select string_agg(distinct m.name,' / ' order by m.name) from involved r join public.event_categories c on c.id=r.category_id join public.event_modalities m on m.id=c.modality_id),'categories',(select string_agg(distinct c.name,' / ' order by c.name) from involved r join public.event_categories c on c.id=r.category_id),'proofs',(select string_agg(distinct p.name,' / ' order by p.name) from involved r join public.event_proofs p on p.id=r.proof_id),'cref',case when profile='staff' then (
  select nullif(btrim(sp.professional_registration),'')
  from public.school_people sp
  join public.events e on e.id=ev and e.institution_id=sp.institution_id
  where sp.school_id=school and sp.person_id=person and sp.role='staff'
 ) end, 'functions',case when profile='responsible' then coalesce((select nullif(sp.position,'') from public.school_people sp where sp.school_id=school and sp.person_id=person and sp.role='responsible'),'Responsável escolar') else coalesce((select f.name from public.staff_event_entries d join public.event_staff_roles f on f.id=d.staff_role_id where d.event_id=ev and d.school_id=school and d.person_id=person and profile='staff'),(select string_agg(distinct f.name,' / ' order by f.name) from involved r join public.registration_staff a on a.registration_id=r.id and a.person_id=person join public.event_staff_roles f on f.id=a.staff_role_id)) end);
$$;

notify pgrst,'reload schema';
