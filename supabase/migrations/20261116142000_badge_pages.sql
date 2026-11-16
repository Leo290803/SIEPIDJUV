-- Listagem de crachás limitada; emissão continua validada no servidor.
create function siep_private.badge_rows(event_uuid uuid,school_uuid uuid,requested_role text,search text)
returns table(person_id uuid,school_id uuid,role text,role_label text,person_name text,school_name text,photo_id uuid,photo_bucket text,photo_path text)
language sql stable set search_path=pg_catalog as $$
 with approved as (
  select r.* from public.registrations r where r.event_id=event_uuid and r.status='approved' and (school_uuid is null or r.school_id=school_uuid)
 ), eligible as (
  select r.school_id,a.person_id,'athlete'::text as role from approved r join public.registration_athletes a on a.registration_id=r.id where a.active
  union select r.school_id,a.person_id,'staff'::text from approved r join public.registration_staff a on a.registration_id=r.id
  union select r.school_id,sp.person_id,'responsible'::text from approved r join public.school_people sp on sp.school_id=r.school_id where sp.role='responsible' and sp.status='approved' and not sp.archived and sp.user_id is not null
 )
 select p.id,s.id,e.role,case e.role when 'athlete' then 'Atleta' when 'staff' then 'Comissão técnica' else 'Responsável escolar' end,p.full_name,s.name,f.id,f.bucket_id,f.object_path
 from eligible e join public.people p on p.id=e.person_id join public.schools s on s.id=e.school_id and s.institution_id=p.institution_id and not s.archived
 left join public.person_photos f on f.person_id=p.id and f.is_current and f.status='uploaded'
 where not p.archived and (requested_role is null or e.role=requested_role) and exists(select 1 from public.school_people sp where sp.school_id=s.id and sp.person_id=p.id and sp.role=e.role and sp.status='approved' and not sp.archived)
 and (coalesce(search,'')='' or strpos(siep_private.report_text(p.full_name||' '||s.name),siep_private.report_text(search))>0)
$$;
revoke all on function siep_private.badge_rows(uuid,uuid,text,text) from public,anon,authenticated;
create function public.siep_badge_page(p_event_id uuid,p_school_id uuid default null,p_role text default null,p_query text default '',p_offset integer default 0,p_limit integer default 25)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare tenant uuid;result jsonb;
begin
 select institution_id into tenant from public.events where id=p_event_id;
 perform siep_private.require_staff(tenant);
 if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset not between 0 and 1000000 or length(p_query)>200 or (p_role is not null and p_role not in ('athlete','staff','responsible')) then raise exception 'Consulta inválida' using errcode='22023';end if;
 if p_school_id is not null and not exists(select 1 from public.schools where id=p_school_id and institution_id=tenant) then raise exception 'Escola indisponível' using errcode='42501';end if;
 with rows as materialized(select * from siep_private.badge_rows(p_event_id,p_school_id,p_role,p_query)),page as(select * from rows order by school_name,person_name,role,person_id,school_id offset p_offset limit p_limit)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p) order by school_name,person_name,role,person_id,school_id) from page p),'[]'),'total',(select count(*) from rows)) into result;
 return result;
end $$;
revoke all on function public.siep_badge_page(uuid,uuid,text,text,integer,integer) from public,anon;
grant execute on function public.siep_badge_page(uuid,uuid,text,text,integer,integer) to authenticated;

create or replace function public.siep_issue_event_badges(p_event_id uuid,p_entries jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare event public.events;institution public.institutions;entry jsonb;candidate jsonb;candidates jsonb;result jsonb:='[]';badge public.event_badges;next_version integer;person_uuid uuid;school_uuid uuid;badge_role text;seen text[]:=array[]::text[];key text;
begin
 select * into event from public.events where id=p_event_id for update;
 if not found then raise exception 'Evento indisponível' using errcode='P0002';end if;
 perform siep_private.require_staff(event.institution_id);
 if event.status='archived' then raise exception 'Evento arquivado não recebe novas emissões' using errcode='23514';end if;
 if jsonb_typeof(p_entries) is distinct from 'array' then raise exception 'Selecione as pessoas para emitir' using errcode='23514';end if;
 if jsonb_array_length(p_entries) not between 1 and 50 then raise exception 'Emita de 1 a 50 crachás por lote' using errcode='23514';end if;
 select * into institution from public.institutions where id=event.institution_id;
 select coalesce(jsonb_agg(to_jsonb(c)),'[]') into candidates from siep_private.badge_rows(event.id,null,null,'') c where exists(select 1 from jsonb_array_elements(p_entries) e where e->>'person_id'=c.person_id::text and e->>'school_id'=c.school_id::text and e->>'role'=c.role);
 for entry in select value from jsonb_array_elements(p_entries) loop
  person_uuid:=(entry->>'person_id')::uuid;school_uuid:=(entry->>'school_id')::uuid;badge_role:=entry->>'role';
  key:=coalesce(person_uuid::text,'')||':'||coalesce(school_uuid::text,'')||':'||coalesce(badge_role,'');
  if key=any(seen) then raise exception 'Não repita uma pessoa/papel no lote' using errcode='23514';end if;
  seen:=array_append(seen,key);
  select value into candidate from jsonb_array_elements(candidates) where value->>'person_id'=person_uuid::text and value->>'school_id'=school_uuid::text and value->>'role'=badge_role;
  if candidate is null then raise exception 'Pessoa sem vínculo e inscrição aprovados neste evento' using errcode='23514';end if;
  if candidate->>'photo_id' is null then raise exception 'Complete a foto de identificação antes de emitir o crachá' using errcode='23514';end if;
  select coalesce(max(version),0)+1 into next_version from public.event_badges where event_id=event.id and school_id=school_uuid and person_id=person_uuid and role=badge_role;
  update public.event_badges set is_current=false where event_id=event.id and school_id=school_uuid and person_id=person_uuid and role=badge_role and is_current;
  insert into public.event_badges(institution_id,event_id,school_id,person_id,role,photo_id,version,snapshot,issued_by)
  values(event.institution_id,event.id,school_uuid,person_uuid,badge_role,(candidate->>'photo_id')::uuid,next_version,candidate||jsonb_build_object('event_name',event.name,'edition',event.edition,'institution_name',institution.name,'event_id',event.id),auth.uid()) returning * into badge;
  result:=result||jsonb_build_array(to_jsonb(badge));
 end loop;
 return result;
end $$;
